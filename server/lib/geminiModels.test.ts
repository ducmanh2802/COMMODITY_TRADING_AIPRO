import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_GEMINI_MODELS, generateContentWithFallback, geminiModelChain, isRetryableModelError } from './geminiModels.ts';

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

test('generateContentWithFallback: falls through busy model, stops on hard error', async () => {
  const calls: string[] = [];
  const ai = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model === 'busy') throw Object.assign(new Error('high demand'), { status: 503 });
        if (model === 'bad') throw Object.assign(new Error('invalid'), { status: 400 });
        return { text: `ok:${model}` };
      },
    },
  } as never;
  const r = await generateContentWithFallback(ai, { contents: 'x' }, ['busy', 'good']);
  assert.equal(r.model, 'good');
  assert.deepEqual(calls, ['busy', 'good']);
  await assert.rejects(generateContentWithFallback(ai, { contents: 'x' }, ['bad', 'good']), /invalid/);
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
