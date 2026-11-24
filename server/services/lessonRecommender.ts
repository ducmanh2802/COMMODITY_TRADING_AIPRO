/**
 * Server-side Gemini Lesson Recommender for Commodity Academy.
 *
 * - API key stays strictly on the server (GEMINI_API_KEY).
 * - Uses `@google/genai` with `gemini-4-hydrogen` and structured JSON output.
 * - Never fabricates AI output when the key is missing or Gemini fails; returns status: 'UNAVAILABLE'.
 * - Validates and filters recommended lesson IDs strictly against the provided candidate set.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  LessonRecommendationRequest,
  LessonRecommendationResult,
  LessonRecommendationUnavailableReason,
} from '../../src/shared/types/lessonRecommendation.ts';

const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
const DEFAULT_TIMEOUT_MS = 20_000;

export interface RecommenderModelRequest {
  systemInstruction: string;
  prompt: string;
  signal: AbortSignal;
}

export interface RecommenderModelClient {
  readonly model: string;
  generate(req: RecommenderModelRequest): Promise<string>;
}

export interface LessonRecommenderDeps {
  apiKey?: string | null;
  modelClient?: RecommenderModelClient;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  now?: () => Date;
  logError?: (message: string, err: unknown) => void;
}

function resolveGeminiModel(): string {
  const m = process.env.GEMINI_MODEL?.trim();
  return m && m.length > 0 ? m : DEFAULT_GEMINI_MODEL;
}

export function createLessonRecommenderClient(
  apiKey: string,
  model: string = resolveGeminiModel()
): RecommenderModelClient {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  return {
    model,
    async generate({ systemInstruction, prompt, signal }) {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          abortSignal: signal,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    lessonId: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    matchedSymbols: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    priority: { type: Type.STRING, enum: ['HIGH', 'MEDIUM'] },
                  },
                  required: ['lessonId', 'reason', 'matchedSymbols', 'priority'],
                },
              },
            },
            required: ['headline', 'recommendations'],
          },
        },
      });
      return response.text ?? '';
    },
  };
}

const RawRecommendationOutputSchema = z.object({
  headline: z.string().min(1).max(260),
  recommendations: z
    .array(
      z.object({
        lessonId: z.string().min(1).max(64),
        reason: z.string().min(1).max(360),
        matchedSymbols: z.array(z.string().min(1).max(24)).max(6),
        priority: z.enum(['HIGH', 'MEDIUM']),
      })
    )
    .min(1)
    .max(8),
});

function buildPrompts(req: LessonRecommendationRequest, maxResults: number) {
  const langLabel = req.language === 'en' ? 'English' : 'Vietnamese';
  const systemInstruction = [
    `You are an educational curriculum advisor for a Vietnamese commodity futures Academy (MXV & global exchanges).`,
    `Your ONLY task is to select and explain the most helpful Academy lessons from the provided candidate list based on:`,
    `1) Commodities the user frequently searches/inspects.`,
    `2) Commodities the user currently holds open positions in (give open-position contract mechanics, seasonal/supply-demand, margin, and roll-cost lessons higher priority).`,
    `STRICT RULES:`,
    `- Respond ONLY in ${langLabel}.`,
    `- Only select lessonId values that exist verbatim in the CANDIDATE_LESSONS list.`,
    `- Never invent lesson IDs or commodities not present in the user signals or candidates.`,
    `- Never give buy/sell trading advice, price targets, or entry/stop recommendations — keep reasons strictly educational.`,
    `- Return 1 to ${maxResults} concise recommendations.`,
  ].join('\n');

  const lines: string[] = [
    `USER_SEARCHED_COMMODITIES: ${JSON.stringify(req.searchedCommodities)}`,
    `USER_OPEN_POSITIONS: ${JSON.stringify(req.openPositions)}`,
    `CANDIDATE_LESSONS: ${JSON.stringify(
      req.candidates.map((c) => ({
        id: c.id,
        level: c.levelNumber,
        title: c.title,
        objective: c.objective,
        instrumentIds: c.instrumentIds,
        done: c.done,
        matchedSymbols: c.matchedSymbols,
      }))
    )}`,
    `Select up to ${maxResults} lessons and explain clearly why each fits the user's searched commodities and/or open positions.`,
  ];

  return { systemInstruction, prompt: lines.join('\n\n') };
}

function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as Record<string, unknown>;
  const status = typeof rec.status === 'number' ? rec.status : undefined;
  if (status !== undefined && status >= 500 && status < 600) return true;
  const msg = typeof rec.message === 'string' ? rec.message.toLowerCase() : '';
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('high demand') ||
    msg.includes('"status":"unavailable"') ||
    msg.includes('service unavailable')
  );
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function classifyError(err: unknown): LessonRecommendationUnavailableReason {
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    if (rec.name === 'AbortError' || rec.code === 'ABORT_ERR') return 'MODEL_TIMEOUT';
    const status = typeof rec.status === 'number' ? rec.status : undefined;
    if (status === 429) return 'MODEL_RATE_LIMITED';
    const msg = typeof rec.message === 'string' ? rec.message.toLowerCase() : '';
    if (msg.includes('timeout') || msg.includes('aborted')) return 'MODEL_TIMEOUT';
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
      return 'MODEL_RATE_LIMITED';
    }
  }
  return 'MODEL_ERROR';
}

function unavailableResult(
  reason: LessonRecommendationUnavailableReason,
  language: LessonRecommendationRequest['language'],
  now: Date
): LessonRecommendationResult {
  return {
    status: 'UNAVAILABLE',
    unavailableReason: reason,
    headline: '',
    recommendations: [],
    generatedAt: now.toISOString(),
    language,
  };
}

export async function generateLessonRecommendations(
  req: LessonRecommendationRequest,
  deps: LessonRecommenderDeps = {}
): Promise<LessonRecommendationResult> {
  const now = (deps.now ?? (() => new Date()))();
  const maxResults = Math.min(Math.max(req.maxResults ?? 4, 1), 6);

  if (
    (req.searchedCommodities.length === 0 && req.openPositions.length === 0) ||
    req.candidates.length === 0
  ) {
    return unavailableResult('NO_SIGNALS', req.language, now);
  }

  const resolvedKey =
    deps.apiKey !== undefined ? deps.apiKey : process.env.GEMINI_API_KEY;
  const trimmedKey = typeof resolvedKey === 'string' ? resolvedKey.trim() : '';

  if (!deps.modelClient && trimmedKey.length === 0) {
    return unavailableResult('NO_API_KEY', req.language, now);
  }

  const client = deps.modelClient ?? createLessonRecommenderClient(trimmedKey);
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.min(Math.max(deps.maxAttempts ?? 3, 1), 4);
  const retryBaseMs = deps.retryBaseMs ?? 500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let rawText = '';
  try {
    const { systemInstruction, prompt } = buildPrompts(req, maxResults);
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        rawText = await client.generate({
          systemInstruction,
          prompt,
          signal: controller.signal,
        });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        if (controller.signal.aborted || attempt === maxAttempts || !isRetryableError(err)) {
          throw err;
        }
        await sleepWithSignal(retryBaseMs * Math.pow(2, attempt - 1), controller.signal);
        if (controller.signal.aborted) {
          throw lastErr;
        }
      }
    }
  } catch (err) {
    const reason = controller.signal.aborted ? 'MODEL_TIMEOUT' : classifyError(err);
    deps.logError?.(`[ai-recommend] generation failed (${reason})`, err);
    return unavailableResult(reason, req.language, now);
  } finally {
    clearTimeout(timer);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err) {
    deps.logError?.('[ai-recommend] invalid JSON from model', err);
    return unavailableResult('INVALID_MODEL_OUTPUT', req.language, now);
  }

  const validated = RawRecommendationOutputSchema.safeParse(parsedJson);
  if (!validated.success) {
    deps.logError?.('[ai-recommend] schema mismatch', validated.error.issues);
    return unavailableResult('INVALID_MODEL_OUTPUT', req.language, now);
  }

  const candidateById = new Map(req.candidates.map((c) => [c.id, c]));
  const seenIds = new Set<string>();
  const filtered = validated.data.recommendations
    .filter((item) => {
      if (!candidateById.has(item.lessonId) || seenIds.has(item.lessonId)) return false;
      seenIds.add(item.lessonId);
      return true;
    })
    .slice(0, maxResults)
    .map((item) => {
      const candidate = candidateById.get(item.lessonId)!;
      const cleanSymbols = Array.from(
        new Set(
          (item.matchedSymbols.length > 0 ? item.matchedSymbols : candidate.matchedSymbols)
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        )
      ).slice(0, 4);
      return {
        lessonId: item.lessonId,
        reason: item.reason.trim(),
        matchedSymbols: cleanSymbols,
        priority: item.priority,
      };
    });

  if (filtered.length === 0) {
    return unavailableResult('INVALID_MODEL_OUTPUT', req.language, now);
  }

  return {
    status: 'OK',
    headline: validated.data.headline.trim(),
    recommendations: filtered,
    generatedAt: now.toISOString(),
    model: client.model,
    language: req.language,
  };
}
