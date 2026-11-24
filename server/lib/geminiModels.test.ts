import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_GEMINI_MODELS,
  adaptParamsForModel,
  generateContentWithFallback,
  geminiModelChain,
  isAiConfigured,
  isFatalModelError,
  isRetryableModelError,
} from './geminiModels.ts';

test('geminiModelChain: free defaults, env override list, dedupe', () => {
  assert.deepEqual(geminiModelChain({}), [...FREE_GEMINI_MODELS]);
  assert.deepEqual(geminiModelChain({ GEMINI_MODEL: ' a , b,a ' }), ['a', 'b']);
  assert.deepEqual(geminiModelChain({ GEMINI_MODEL: '  ' }), [...FREE_GEMINI_MODELS]);
});

test('isRetryableModelError: 503/429/404 yes, 400/abort no', () => {
  assert.equal(isRetryableModelError({ status: 503 }), true);
  assert.equal(isRetryableModelError({ message: 'got status: 429 RESOURCE_EXHAUSTED' }), true);
  assert.equal(isRetryableModelError({ message: 'models/x is no longer available to new users' }), true);
  assert.equal(isRetryableModelError({ status: 400, message: 'bad request' }), false);
  assert.equal(isRetryableModelError({ name: 'AbortError', status: 503 }), false);
});

test('generateContentWithFallback: falls through busy and 400 models, stops on auth/abort', async () => {
  const calls: string[] = [];
  const ai = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model === 'busy') throw Object.assign(new Error('high demand'), { status: 503 });
        if (model === 'bad') throw Object.assign(new Error('INVALID_ARGUMENT: systemInstruction'), { status: 400 });
        if (model === 'badkey') throw Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 });
        if (model === 'denied') throw Object.assign(new Error('forbidden'), { status: 403 });
        if (model === 'abort') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        return { text: `ok:${model}` };
      },
    },
  } as never;
  const r = await generateContentWithFallback(ai, { contents: 'x' }, ['busy', 'good'], {});
  assert.equal(r.model, 'good');
  assert.deepEqual(calls, ['busy', 'good']);
  const r2 = await generateContentWithFallback(ai, { contents: 'x' }, ['bad', 'good'], {});
  assert.equal(r2.model, 'good');
  calls.length = 0;
  await assert.rejects(generateContentWithFallback(ai, { contents: 'x' }, ['badkey', 'good'], {}), /API key not valid/);
  await assert.rejects(generateContentWithFallback(ai, { contents: 'x' }, ['denied', 'good'], {}), /forbidden/);
  await assert.rejects(generateContentWithFallback(ai, { contents: 'x' }, ['abort', 'good'], {}), /aborted/);
  assert.deepEqual(calls, ['badkey', 'denied', 'abort']);
});

test('generateContentWithFallback: after all Gemini models fail, tries OpenRouter; null client goes straight to OpenRouter', async () => {
  const orCalls: string[] = [];
  const fakeFetch = (async (_url: string, init?: RequestInit) => {
    orCalls.push(JSON.parse(String(init?.body)).model as string);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }));
  }) as never;
  const env = { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'x/y:free' };
  const ai = {
    models: {
      generateContent: async () => {
        throw Object.assign(new Error('INVALID_ARGUMENT'), { status: 400 });
      },
    },
  } as never;
  const r = await generateContentWithFallback(ai, { contents: 'x' }, ['m1', 'm2'], env, fakeFetch);
  assert.equal(r.model, 'openrouter:x/y:free');
  const r2 = await generateContentWithFallback(null, { contents: 'x' }, ['m1'], env, fakeFetch);
  assert.equal(r2.response.text, 'hello');
  assert.deepEqual(orCalls, ['x/y:free', 'x/y:free']);
  await assert.rejects(generateContentWithFallback(null, { contents: 'x' }, ['m1'], {}), /No AI model configured/);
});

test('adaptParamsForModel: gemma gets schema/system stripped and folded into the prompt', () => {
  const params = {
    contents: 'USER',
    config: { systemInstruction: 'SYS', responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' }, temperature: 0.1 },
  } as never;
  const g = adaptParamsForModel(params, 'gemma-4-31b-it') as { contents: string; config: Record<string, unknown> };
  assert.equal(g.config.systemInstruction, undefined);
  assert.equal(g.config.responseSchema, undefined);
  assert.equal(g.config.responseMimeType, undefined);
  assert.equal(g.config.temperature, 0.1);
  assert.match(g.contents, /^SYS\n.*JSON.*\n\nUSER$/s);
  assert.equal(adaptParamsForModel(params, 'gemini-flash-lite-latest'), params);
});

test('isFatalModelError / isAiConfigured', () => {
  assert.equal(isFatalModelError({ status: 401 }), true);
  assert.equal(isFatalModelError({ status: 400, message: 'API_KEY_INVALID' }), true);
  assert.equal(isFatalModelError({ status: 400, message: 'INVALID_ARGUMENT' }), false);
  assert.equal(isFatalModelError({ status: 503 }), false);
  assert.equal(isAiConfigured({}), false);
  assert.equal(isAiConfigured({ GEMINI_API_KEY: ' ' }), false);
  assert.equal(isAiConfigured({ OPENROUTER_API_KEY: 'k' }), true);
  assert.equal(isAiConfigured({ GEMINI_API_KEY: 'k' }), true);
});

test('generateViaOpenRouter: picks live :free models, strips code fences, falls through 429', async () => {
  const { generateViaOpenRouter } = await import('./geminiModels.ts');
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'paid/model' }, { id: 'a/one:free', context_length: 8000 }, { id: 'b/two:free', context_length: 32000 }] }));
    }
    const model = JSON.parse(String(init?.body)).model as string;
    calls.push(model);
    if (model === 'b/two:free') return new Response('{}', { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"summary":"ok"}\n```' } }] }));
  }) as never;
  const r = await generateViaOpenRouter(
    { contents: 'x', config: { systemInstruction: 'sys', responseMimeType: 'application/json' } },
    { OPENROUTER_API_KEY: 'k' },
    fakeFetch
  );
  assert.deepEqual(calls, ['b/two:free', 'a/one:free']);
  assert.equal(r.model, 'openrouter:a/one:free');
  assert.equal(r.response.text, '{"summary":"ok"}');
});
