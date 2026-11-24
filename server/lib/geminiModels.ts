/**
 * AI model selection — free models only by default.
 *
 * Checked 2026-11-24 with a free AI Studio key: the "flash-lite" family and Gemma answer on the free tier,
 * but any single model can return 503 (high demand) at a given moment; gemini-2.5-* are closed to new
 * users (404). So we try a chain of free models, then (optionally) OpenRouter's free models.
 *
 * Env:
 *   GEMINI_MODEL       one model or a comma-separated fallback list (overrides FREE_GEMINI_MODELS)
 *   OPENROUTER_API_KEY optional; when set, OpenRouter ":free" models are the last fallback
 *                      (and the only provider when GEMINI_API_KEY is missing)
 *   OPENROUTER_MODEL   optional comma list of OpenRouter model ids; default = live list of ":free" models
 */
import type { GenerateContentParameters, GenerateContentResponse, GoogleGenAI } from '@google/genai';

export const FREE_GEMINI_MODELS: readonly string[] = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
];

/** Ordered list of models to try (env override first, else the free defaults). */
export function geminiModelChain(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.GEMINI_MODEL?.trim();
  const fromEnv = raw ? raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0) : [];
  const chain = fromEnv.length > 0 ? fromEnv : [...FREE_GEMINI_MODELS];
  return [...new Set(chain)];
}

export function primaryGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return geminiModelChain(env)[0];
}

/** True when another model may succeed: overloaded (503), rate/quota limited (429), model gone (404), 500. */
export function isRetryableModelError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { status?: unknown; code?: unknown; name?: unknown; message?: unknown };
    if (e.name === 'AbortError') return false;
    const status = Number(e.status ?? e.code);
    if ([404, 429, 500, 503].includes(status)) return true;
    const msg = typeof e.message === 'string' ? e.message : '';
    return /\b(404|429|500|503)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|high demand|quota|no longer available|not supported/i.test(msg);
  }
  return false;
}

// --------------------------------------------------------------------------- OpenRouter (free models)

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
let freeModelCache: { at: number; ids: string[] } | null = null;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Live list of OpenRouter models whose id ends with ":free" (cached 6h). */
export async function openRouterFreeModels(fetchImpl: FetchLike = fetch, signal?: AbortSignal): Promise<string[]> {
  if (freeModelCache && Date.now() - freeModelCache.at < 6 * 3600_000) return freeModelCache.ids;
  const res = await fetchImpl(`${OPENROUTER_BASE}/models`, { signal });
  if (!res.ok) throw Object.assign(new Error(`OpenRouter models HTTP ${res.status}`), { status: res.status });
  const body = (await res.json()) as { data?: { id?: unknown; context_length?: unknown }[] };
  const ids = (body.data ?? [])
    .filter((m) => typeof m.id === 'string' && m.id.endsWith(':free'))
    .sort((a, b) => Number(b.context_length ?? 0) - Number(a.context_length ?? 0))
    .map((m) => m.id as string);
  freeModelCache = { at: Date.now(), ids };
  return ids;
}

function contentsToText(contents: GenerateContentParameters['contents']): string {
  if (typeof contents === 'string') return contents;
  return JSON.stringify(contents);
}

function systemToText(sys: unknown): string | null {
  if (!sys) return null;
  if (typeof sys === 'string') return sys;
  const parts = (sys as { parts?: { text?: string }[] }).parts;
  return Array.isArray(parts) ? parts.map((p) => p.text ?? '').join('\n') : JSON.stringify(sys);
}

/** One OpenRouter chat call, shaped like a Gemini response ({ text }). Tries up to 3 free models. */
export async function generateViaOpenRouter(
  params: Omit<GenerateContentParameters, 'model'>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<{ response: GenerateContentResponse; model: string }> {
  const key = env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const cfg = (params.config ?? {}) as { systemInstruction?: unknown; responseMimeType?: string; temperature?: number; abortSignal?: AbortSignal };
  const signal = cfg.abortSignal;
  const fromEnv = env.OPENROUTER_MODEL?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const models = (fromEnv.length > 0 ? fromEnv : await openRouterFreeModels(fetchImpl, signal)).slice(0, 3);
  const sys = systemToText(cfg.systemInstruction);
  const wantJson = cfg.responseMimeType === 'application/json';
  const messages = [
    ...(sys ? [{ role: 'system', content: sys + (wantJson ? '\nTrả lời CHỈ bằng một object JSON hợp lệ.' : '') }] : []),
    { role: 'user', content: contentsToText(params.contents) },
  ];
  let lastErr: unknown = new Error('No free OpenRouter model available');
  for (const model of models) {
    try {
      const res = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Commodity Trading AIPRO' },
        body: JSON.stringify({ model, messages, temperature: cfg.temperature ?? 0.2, ...(wantJson ? { response_format: { type: 'json_object' } } : {}) }),
      });
      if (!res.ok) throw Object.assign(new Error(`OpenRouter HTTP ${res.status}`), { status: res.status });
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      let text = body.choices?.[0]?.message?.content?.trim() ?? '';
      if (wantJson) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
      if (!text) throw Object.assign(new Error('OpenRouter empty response'), { status: 503 });
      return { response: { text } as unknown as GenerateContentResponse, model: `openrouter:${model}` };
    } catch (err) {
      lastErr = err;
      if (!isRetryableModelError(err) && !/HTTP 4\d\d/.test(String((err as Error)?.message))) throw err;
    }
  }
  throw lastErr;
}

// --------------------------------------------------------------------------- unified entry point

/**
 * Calls Gemini generateContent with the first model, falling back to the next on retryable errors,
 * then to OpenRouter free models when OPENROUTER_API_KEY is set.
 * Non-retryable errors (bad request, abort, invalid key) are thrown immediately.
 * The caller's abortSignal travels inside params.config and is honoured by every attempt.
 */
export async function generateContentWithFallback(
  ai: Pick<GoogleGenAI, 'models'> | null,
  params: Omit<GenerateContentParameters, 'model'>,
  models: readonly string[] = geminiModelChain(),
  env: NodeJS.ProcessEnv = process.env
): Promise<{ response: GenerateContentResponse; model: string }> {
  let lastErr: unknown = new Error('No AI model configured');
  if (ai) {
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({ ...params, model }); // abortSignal travels in params.config
        return { response, model };
      } catch (err) {
        lastErr = err;
        if (!isRetryableModelError(err)) throw err;
      }
    }
  }
  if (env.OPENROUTER_API_KEY?.trim()) return generateViaOpenRouter(params, env);
  throw lastErr;
}
