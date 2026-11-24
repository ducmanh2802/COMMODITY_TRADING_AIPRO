/**
 * POST /api/paper/weekly-review: optional short Vietnamese narrative for the paper-trading weekly review.
 * Input = computed summary NUMBERS only (no names, ids, journals, instruments). Education only, never advice.
 * No GEMINI_API_KEY / OPENROUTER_API_KEY or any model error -> 503 / 502 and the client silently keeps its formula text.
 */
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { createRateLimiter } from '../middleware/rateLimit.ts';
import { isAiConfigured } from '../lib/geminiModels.ts';
import { createGeminiModelClient, stripRecommendationLanguage } from '../services/aiAnalyst.ts';

const num = z.number().finite().nullable();
export const WeeklySummarySchema = z
  .object({
    trades: z.number().int().min(0).max(10_000),
    wins: z.number().int().min(0).max(10_000),
    losses: z.number().int().min(0).max(10_000),
    winRatePct: num,
    avgWinVnd: num,
    avgLossVnd: num,
    totalPnlVnd: z.number().finite(),
    expectancyVnd: num,
    expectancyR: num,
    maxDrawdownPct: z.number().finite(),
    stopLossPct: num,
    biggestLossVnd: num,
    noStop: z.number().int().min(0).max(10_000),
    oversized: z.number().int().min(0).max(10_000),
    offPlan: z.number().int().min(0).max(10_000),
    eventTrades: z.number().int().min(0).max(10_000),
    topMistakeTag: z.string().max(40).regex(/^[\p{L}\p{N} _.-]*$/u).nullable(),
  })
  .strict();
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;

export type WeeklyNarrator = (s: WeeklySummary) => Promise<string | null>;

const SYSTEM =
  'Bạn là trợ giảng giao dịch GIẢ LẬP (paper trading) cho người mới. Viết 2-4 câu tiếng Việt nhận xét tuần giao dịch thử, ' +
  'chỉ dựa trên các con số được cung cấp, giọng khích lệ và mang tính giáo dục (kỷ luật, cắt lỗ, khối lượng vừa phải). ' +
  'Không bịa số liệu, không dự đoán giá, không khuyến nghị mua/bán bất kỳ hàng hóa nào. ' +
  'Trả JSON có trường "summary"; "keyFacts", "risks" và "dataGaps" là mảng rỗng.';

/** AI narrator, or null when neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set. */
export function createWeeklyNarrator(env: NodeJS.ProcessEnv = process.env): WeeklyNarrator | null {
  if (!isAiConfigured(env)) return null;
  const client = createGeminiModelClient(env.GEMINI_API_KEY?.trim() || null);
  return async (s) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    try {
      const raw = await client.generate({ signal: ac.signal, systemInstruction: SYSTEM, prompt: `Số liệu tuần (JSON): ${JSON.stringify(s)}` });
      const text = (JSON.parse(raw) as { summary?: unknown }).summary;
      return typeof text === 'string' && text.trim() ? text.trim() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface PaperReviewRouteOptions {
  /** undefined -> Gemini from env; null -> AI disabled. */
  narrator?: WeeklyNarrator | null;
  /** Requests per minute per client (default 6). */
  maxPerMinute?: number;
}

export function registerPaperReviewRoutes(app: Express, options: PaperReviewRouteOptions = {}): void {
  let narrator: WeeklyNarrator | null | undefined = options.narrator;
  const getNarrator = () => (narrator === undefined ? (narrator = createWeeklyNarrator()) : narrator);
  const limiter = createRateLimiter({ windowMs: 60_000, max: options.maxPerMinute ?? 6 });

  app.post('/api/paper/weekly-review', limiter, async (req: Request, res: Response) => {
    const parsed = WeeklySummarySchema.safeParse(req.body?.summary);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_SUMMARY' });
      return;
    }
    const n = getNarrator();
    if (!n) {
      res.status(503).json({ error: 'AI_UNAVAILABLE' });
      return;
    }
    const text = await n(parsed.data).catch(() => null);
    const clean = text ? stripRecommendationLanguage(text).text.slice(0, 800).trim() : '';
    if (!clean) {
      res.status(502).json({ error: 'AI_FAILED' });
      return;
    }
    res.json({ narrative: clean, source: 'AI' });
  });
}
