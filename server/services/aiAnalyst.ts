/**
 * T20 — AI Analyst (Gemini, server-side) in research-summary mode (decision D3).
 *
 * - The API key lives only on the server (GEMINI_API_KEY); it is never sent to the client.
 * - The prompt is built only from data the server holds: contract spec, latest quote, technicalEngine
 *   indicators and COT (when loaded). Every block carries a quality label + source + as-of; missing
 *   blocks are sent as UNAVAILABLE with an explicit "do not estimate" instruction.
 * - The model must return { summary, keyFacts[{statement, sourceRefs}], risks, dataGaps }. No actions,
 *   price levels, entries, targets or stops. A server-side post-check removes any sentence with
 *   recommendation language and drops facts that do not cite an available data block.
 * - No key / no verified data / timeout / model error → status UNAVAILABLE with a reason code; never
 *   fabricated text, never internal error details.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import type {
  AiDataInput,
  AiDataInputId,
  AiLanguage,
  AiResearchSummary,
  AiUnavailableReason,
} from '../../src/shared/types/analysis.ts';
import type { InstrumentDefinition, Timeframe } from '../../src/shared/types/instrument.ts';
import type { DataQualityStatus, MarketQuote } from '../../src/shared/types/market.ts';
import type { CotAnalyticsResult, CotReportType } from '../../src/shared/cot/analytics.ts';
import type { TechnicalSnapshot } from '../engines/technicalEngine.ts';
import { getCotMapping } from '../cot/mapping.ts';
import { CotServiceError, type CotService } from '../cot/service.ts';

/** Default model; override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
/** Default model-call timeout; override with AI_ANALYST_TIMEOUT_MS. */
export const DEFAULT_AI_TIMEOUT_MS = 20_000;

const MAX_TEXT = 1200;

// ---------------------------------------------------------------------------------------------
// Model client (injectable for tests)
// ---------------------------------------------------------------------------------------------

export interface AiModelRequest {
  systemInstruction: string;
  prompt: string;
  signal: AbortSignal;
}

export interface AiModelClient {
  readonly model: string;
  /** Returns the raw JSON text produced by the model. */
  generate(req: AiModelRequest): Promise<string>;
}

export function resolveGeminiModel(): string {
  const m = process.env.GEMINI_MODEL?.trim();
  return m && m.length > 0 ? m : DEFAULT_GEMINI_MODEL;
}

export function resolveAiTimeoutMs(): number {
  const n = Number(process.env.AI_ANALYST_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 1000 && n <= 120_000 ? Math.floor(n) : DEFAULT_AI_TIMEOUT_MS;
}

export function createGeminiModelClient(apiKey: string, model: string = resolveGeminiModel()): AiModelClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    model,
    async generate({ systemInstruction, prompt, signal }) {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          abortSignal: signal,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              keyFacts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    statement: { type: Type.STRING },
                    sourceRefs: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING, enum: ['SPEC', 'QUOTE', 'TECHNICAL', 'COT'] },
                    },
                  },
                  required: ['statement', 'sourceRefs'],
                },
              },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
              dataGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'keyFacts', 'risks', 'dataGaps'],
          },
        },
      });
      return response.text ?? '';
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Context → labelled data blocks
// ---------------------------------------------------------------------------------------------

/** Latest COT data for the instrument, as read from the server's COT store. */
export interface AiCotData {
  status: 'OK' | 'NOT_REPORTED' | 'NOT_LOADED';
  reportType: CotReportType | null;
  source: string | null;
  analytics: Pick<CotAnalyticsResult, 'latest' | 'status'> | null;
  note: string | null;
}

export interface AiAnalystContext {
  instrument: InstrumentDefinition;
  timeframe: Timeframe;
  language: AiLanguage;
  /** null when no quote could be obtained. */
  quote: MarketQuote | null;
  snapshot: TechnicalSnapshot;
  /** Where the engine candles came from, e.g. 'SQLITE CSV_IMPORT'. */
  candleSource: string | null;
  /** null when COT data was not looked up. */
  cot: AiCotData | null;
}

export type AiCotQueryLike = Pick<CotService, 'query'>;

/**
 * Reads the latest stored COT report for the instrument (no network). Never throws: errors become
 * NOT_LOADED / NOT_REPORTED with a short, non-internal note.
 */
export function loadCotForAi(service: AiCotQueryLike | null, instrumentId: string): AiCotData | null {
  if (!service) return null;
  const mapping = getCotMapping(instrumentId);
  if (!mapping || mapping.status !== 'REPORTED') {
    return { status: 'NOT_REPORTED', reportType: null, source: 'CFTC COT', analytics: null, note: 'Instrument not covered by CFTC COT reports.' };
  }
  const reportType: CotReportType = mapping.reportTypes.includes('DISAGGREGATED') ? 'DISAGGREGATED' : mapping.reportTypes[0];
  try {
    const q = service.query(instrumentId, { reportType });
    if (q.rows.length === 0 || !q.analytics.latest) {
      return { status: 'NOT_LOADED', reportType, source: 'CFTC COT', analytics: null, note: 'No COT reports synced yet.' };
    }
    const src = q.provenance.sources.length > 0 ? `CFTC COT (${q.provenance.dataSources.join(', ')})` : 'CFTC COT';
    return { status: 'OK', reportType, source: src, analytics: q.analytics, note: null };
  } catch (err) {
    return {
      status: err instanceof CotServiceError && err.code === 'COT_NOT_REPORTED' ? 'NOT_REPORTED' : 'NOT_LOADED',
      reportType,
      source: 'CFTC COT',
      analytics: null,
      note: 'COT data could not be read.',
    };
  }
}

const COT_STALE_DAYS = 17;

function isUsableMarketStatus(s: DataQualityStatus): boolean {
  return s !== 'UNAVAILABLE' && s !== 'INVALID';
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== ''));
}

function round(n: number | null | undefined, dp = 4): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function unavailable(id: AiDataInputId, source: string, note: string): AiDataInput {
  return { id, quality: 'UNAVAILABLE', sourceQuality: null, source, asOf: null, note, data: null };
}

export function buildSpecInput(instrument: InstrumentDefinition): AiDataInput {
  const s = instrument.specification;
  if (s.verificationStatus === 'UNAVAILABLE') {
    return unavailable('SPEC', s.dataSource || 'instrument registry', 'Contract specification not available.');
  }
  return {
    id: 'SPEC',
    quality: s.verificationStatus,
    sourceQuality: null,
    source: s.dataSource || 'instrument registry',
    asOf: null,
    note: s.verificationStatus === 'UNVERIFIED' ? 'Specification not verified against the exchange.' : null,
    data: compact({
      productName: instrument.productName,
      exchange: instrument.exchange,
      symbol: instrument.exchangeSymbol,
      contractSize: s.contractSize,
      contractSizeUnit: s.contractSizeUnit,
      minimumTickSize: s.minimumTickSize,
      tickValue: s.tickValue,
      tradingCurrency: s.tradingCurrency,
      quotationUnit: s.quotationUnit,
      settlementMethod: s.settlementMethod,
      tradingHours: s.tradingHoursSummary,
      tradingHoursTimezone: s.tradingHoursTimezone,
      expirationDate: s.expirationDate,
      firstNoticeDate: s.firstNoticeDate,
      mxvSymbol: instrument.mxvMapping?.mxvSymbol ?? null,
      mxvMappingStatus: instrument.mxvMapping?.mappingStatus ?? null,
    }),
  };
}

export function buildQuoteInput(quote: MarketQuote | null): AiDataInput {
  if (!quote) return unavailable('QUOTE', 'provider registry', 'No quote could be obtained.');
  if (!isUsableMarketStatus(quote.status) || quote.price === null) {
    return {
      ...unavailable('QUOTE', quote.source || 'provider registry', quote.statusReason ?? 'No verified quote.'),
      quality: quote.status === 'INVALID' ? 'INVALID' : 'UNAVAILABLE',
    };
  }
  return {
    id: 'QUOTE',
    quality: quote.status,
    sourceQuality: quote.sourceQuality ?? null,
    source: quote.source,
    asOf: quote.timestamp,
    note: quote.statusReason ?? null,
    data: compact({
      price: quote.price,
      bid: quote.bid,
      ask: quote.ask,
      volume: quote.volume,
      openInterest: quote.openInterest,
      currency: quote.currency,
      unit: quote.unit,
      contract: quote.contract ?? quote.contractMonth,
      delayMinutes: quote.delayMinutes ?? null,
      retrievedAt: quote.retrievedAt,
    }),
  };
}

export function buildTechnicalInput(snapshot: TechnicalSnapshot, candleSource: string | null): AiDataInput {
  const source = `technicalEngine over ${candleSource ?? 'stored candles'}`;
  if (!isUsableMarketStatus(snapshot.status) || snapshot.lastClose === null) {
    return {
      ...unavailable('TECHNICAL', source, snapshot.reason ?? 'No validated candles for this timeframe.'),
      quality: snapshot.status === 'INVALID' ? 'INVALID' : 'UNAVAILABLE',
    };
  }
  const ms = snapshot.marketStructure;
  return {
    id: 'TECHNICAL',
    quality: snapshot.status,
    sourceQuality: null,
    source,
    asOf: snapshot.lastTimestamp,
    note: snapshot.reason ?? null,
    data: {
      timeframe: snapshot.timeframe,
      completeCandleCount: snapshot.completeCandleCount,
      lastClose: snapshot.lastClose,
      ema: snapshot.ema,
      sma: snapshot.sma,
      rsi14: round(snapshot.rsi14, 2),
      macd: snapshot.macd,
      bollinger: snapshot.bollinger,
      atr14: round(snapshot.atr14),
      atrPct: round(snapshot.atrPct, 3),
      adx14: snapshot.adx14,
      marketStructure: {
        mainTrend: ms.mainTrend,
        shortTermTrend: ms.shortTermTrend,
        momentum: ms.momentum,
        volatility: ms.volatility,
        marketRegime: ms.marketRegime,
        structurePattern: ms.structurePattern,
        supportZones: ms.supportZones,
        resistanceZones: ms.resistanceZones,
      },
    },
  };
}

function shiftIsoDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function buildCotInput(cot: AiCotData | null, now: Date): AiDataInput {
  if (!cot) return unavailable('COT', 'CFTC COT', 'COT data not looked up.');
  const latest = cot.analytics?.latest ?? null;
  if (cot.status !== 'OK' || !latest) {
    return unavailable('COT', cot.source ?? 'CFTC COT', cot.note ?? 'No COT reports loaded for this instrument.');
  }
  const staleBefore = shiftIsoDays(now.toISOString(), -COT_STALE_DAYS);
  const categories: Record<string, unknown> = {};
  for (const [name, c] of Object.entries(latest.categories)) {
    if (!c) continue;
    categories[name] = compact({
      long: c.long,
      short: c.short,
      net: c.net,
      netPctOi: round(c.netPctOi, 2),
      netChangeWoW: c.netChangeWoW,
      cotIndex: round(c.cotIndex, 1),
    });
  }
  return {
    id: 'COT',
    quality: latest.reportDate < staleBefore ? 'STALE' : 'CURRENT',
    sourceQuality: 'OFFICIAL',
    source: cot.source ?? 'CFTC COT',
    asOf: latest.reportDate,
    note: `${cot.reportType ?? ''} report; as-of is the CFTC position date (released ~${latest.expectedReleaseDate}).`.trim(),
    data: { reportType: cot.reportType, openInterest: latest.openInterest, categories },
  };
}

export function buildDataInputs(ctx: AiAnalystContext, now: Date): AiDataInput[] {
  return [
    buildSpecInput(ctx.instrument),
    buildQuoteInput(ctx.quote),
    buildTechnicalInput(ctx.snapshot, ctx.candleSource),
    buildCotInput(ctx.cot, now),
  ];
}

const INPUT_TITLES: Record<AiDataInputId, string> = {
  SPEC: 'Contract specification',
  QUOTE: 'Latest quote',
  TECHNICAL: 'Technical indicators (technicalEngine)',
  COT: 'CFTC Commitments of Traders (latest report)',
};

// ---------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------

export const AI_SYSTEM_INSTRUCTION = [
  'You are a commodity futures RESEARCH assistant writing a neutral research summary for a beginner.',
  'Use ONLY the data blocks in the user message. Do not use outside knowledge, news, or memory of prices.',
  'Never invent, estimate, extrapolate or round-trip numbers that are not in a data block.',
  'A block marked UNAVAILABLE has no data: say it is unavailable in dataGaps; never guess its values.',
  'Mention the quality label (CURRENT, DELAYED, HISTORICAL, STALE, UNOFFICIAL, UNVERIFIED) when citing a block that is not CURRENT/VERIFIED.',
  'This is NOT trading advice. Do NOT recommend or suggest buying, selling, going long or short, entering or exiting a position,',
  'and do NOT give entry prices, entry zones, price targets, take-profit levels, stop-loss levels, position sizes or any action.',
  'Do not use the words buy, sell, entry, target, take profit or stop loss.',
  'Describe what the data shows (levels, indicator readings, positioning), not what anyone should do.',
  'Return JSON: {"summary": string, "keyFacts": [{"statement": string, "sourceRefs": ["SPEC"|"QUOTE"|"TECHNICAL"|"COT"]}],',
  '"risks": string[] (risks/limitations of the data and of the market context), "dataGaps": string[]}.',
  'Every keyFact must cite at least one available block id in sourceRefs.',
].join(' ');

export function buildAnalystPrompt(ctx: AiAnalystContext, inputs: AiDataInput[], now: Date): string {
  const lang = ctx.language === 'vi' ? 'Vietnamese' : 'English';
  const lines: string[] = [
    `Instrument: ${ctx.instrument.id} (${ctx.instrument.productName}); analysis timeframe: ${ctx.timeframe}.`,
    `Server time (UTC): ${now.toISOString()}.`,
    `Write all text in ${lang}. Keep the summary under 120 words, at most 8 keyFacts.`,
    '',
    'DATA BLOCKS (the only facts you may use):',
  ];
  for (const b of inputs) {
    lines.push('');
    lines.push(`### [${b.id}] ${INPUT_TITLES[b.id]}`);
    const meta = [
      `quality: ${b.quality}`,
      b.sourceQuality ? `sourceQuality: ${b.sourceQuality}` : null,
      `source: ${b.source}`,
      `as-of: ${b.asOf ?? 'unknown'}`,
    ].filter(Boolean);
    lines.push(meta.join(' | '));
    if (b.note) lines.push(`note: ${b.note}`);
    if (b.data === null) {
      lines.push('data: UNAVAILABLE — no data for this block. Report it as a data gap; do not estimate it.');
    } else {
      lines.push(`data: ${JSON.stringify(b.data)}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Post-check: recommendation language
// ---------------------------------------------------------------------------------------------

const B = '(?<![\\p{L}\\p{N}_])';
const E = '(?![\\p{L}\\p{N}_])';

const RECOMMENDATION_PATTERNS: Array<{ term: string; re: RegExp }> = [
  ['buy', 'buy'],
  ['sell', 'sell(?!-off)'],
  ['go long/short', 'go(?:ing)?\\s+(?:long|short)'],
  ['entry', 'entr(?:y|ies)'],
  ['enter', 'enter(?:ing)?'],
  ['target', '(?:price\\s+)?targets?'],
  ['take profit', 'take[-\\s]?profits?'],
  ['stop loss', 'stop[-\\s]?loss(?:es)?'],
  ['stop at', 'stops?\\s+(?:at|below|above|near)'],
  ['recommend', 'recommend(?:s|ed|ation|ations)?'],
  ['should trade', 'should\\s+(?:consider\\s+)?(?:long|short|exit|open|close|add|trade|position)'],
  ['open/close position', '(?:open|close|exit)\\s+(?:a|an|the|your)?\\s*(?:long|short)?\\s*(?:position|trade)s?'],
  ['nên mua/bán', 'nên\\s+(?:mua|bán|vào|thoát|chốt|cắt)'],
  ['mua vào/bán ra', '(?:mua\\s+vào|bán\\s+ra)'],
  ['lệnh', '(?:vào|đặt|mở|đóng)\\s+lệnh'],
  ['lệnh mua/bán', 'lệnh\\s+(?:mua|bán)'],
  ['điểm vào', 'điểm\\s+(?:vào|mua|bán)'],
  ['chốt lời', 'chốt\\s+lời'],
  ['cắt/dừng lỗ', '(?:cắt|dừng)\\s+lỗ'],
  ['mục tiêu', '(?:giá\\s+)?mục\\s+tiêu(?:\\s+giá)?'],
  ['khuyến nghị', 'khuyến\\s+nghị'],
  ['mở/đóng vị thế', '(?:mở|đóng)\\s+vị\\s+thế'],
].map(([term, src]) => ({ term, re: new RegExp(`${B}${src}${E}`, 'iu') }));

/** Terms of recommendation language found in `text` (empty when clean). */
export function findRecommendationTerms(text: string): string[] {
  return RECOMMENDATION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.term);
}

/** Removes every sentence containing recommendation language. */
export function stripRecommendationLanguage(text: string): { text: string; removed: number; terms: string[] } {
  const sentences = text.split(/(?<=[.!?;])\s+|\n+/u).map((s) => s.trim()).filter((s) => s.length > 0);
  const kept: string[] = [];
  const terms = new Set<string>();
  let removed = 0;
  for (const s of sentences) {
    const found = findRecommendationTerms(s);
    if (found.length > 0) {
      removed += 1;
      found.forEach((t) => terms.add(t));
    } else {
      kept.push(s);
    }
  }
  return { text: kept.join(' '), removed, terms: [...terms] };
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

const ModelOutputSchema = z.object({
  summary: z.string().max(4000),
  keyFacts: z
    .array(z.object({ statement: z.string().max(MAX_TEXT), sourceRefs: z.array(z.string().max(16)).max(4) }))
    .max(20),
  risks: z.array(z.string().max(MAX_TEXT)).max(20),
  dataGaps: z.array(z.string().max(MAX_TEXT)).max(20),
});

export interface AiAnalystDeps {
  /** undefined → process.env.GEMINI_API_KEY. Empty/blank → UNAVAILABLE (NO_API_KEY). */
  apiKey?: string | null;
  /** Injected model client (tests). Default: Gemini client built from the key. */
  modelClient?: AiModelClient;
  timeoutMs?: number;
  now?: () => Date;
  /** Server-side logger for model failures (never returned to the client). */
  logError?: (message: string, err: unknown) => void;
}

class AiTimeoutError extends Error {}

function classifyModelError(err: unknown): AiUnavailableReason {
  if (err instanceof AiTimeoutError) return 'MODEL_TIMEOUT';
  if (err instanceof Error && err.name === 'AbortError') return 'MODEL_TIMEOUT';
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined;
  if (status === 429) return 'MODEL_RATE_LIMITED';
  return 'MODEL_ERROR';
}

export async function generateResearchSummary(
  ctx: AiAnalystContext,
  deps: AiAnalystDeps = {}
): Promise<AiResearchSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const inputs = buildDataInputs(ctx, now);
  const base: AiResearchSummary = {
    status: 'UNAVAILABLE',
    unavailableReason: null,
    instrument: ctx.instrument.exchangeSymbol,
    timeframe: ctx.timeframe,
    language: ctx.language,
    generatedAt: now.toISOString(),
    model: null,
    summary: '',
    keyFacts: [],
    risks: [],
    dataGaps: inputs.filter((i) => i.data === null).map((i) => `${i.id}: UNAVAILABLE`),
    inputs,
    postCheck: { flagged: false, removedSentences: 0, matchedTerms: [], droppedUnsourcedFacts: 0 },
  };

  const apiKey = deps.apiKey === undefined ? process.env.GEMINI_API_KEY : deps.apiKey;
  if (!apiKey || apiKey.trim().length === 0) {
    return { ...base, unavailableReason: 'NO_API_KEY' };
  }

  const marketBlocks = inputs.filter((i) => i.id !== 'SPEC' && i.data !== null);
  if (marketBlocks.length === 0) {
    return { ...base, unavailableReason: 'NO_VERIFIED_DATA' };
  }

  const client = deps.modelClient ?? createGeminiModelClient(apiKey.trim());
  const timeoutMs = deps.timeoutMs ?? resolveAiTimeoutMs();
  const prompt = buildAnalystPrompt(ctx, inputs, now);
  const logError = deps.logError ?? ((m: string, e: unknown) => console.error(m, e));

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let raw: string;
  try {
    raw = await Promise.race([
      client.generate({ systemInstruction: AI_SYSTEM_INSTRUCTION, prompt, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AiTimeoutError(`AI model call exceeded ${timeoutMs} ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    logError('[aiAnalyst] model call failed', err);
    const reason = controller.signal.aborted ? 'MODEL_TIMEOUT' : classifyModelError(err);
    return { ...base, model: client.model, unavailableReason: reason };
  } finally {
    if (timer) clearTimeout(timer);
  }

  let parsed: z.infer<typeof ModelOutputSchema>;
  try {
    parsed = ModelOutputSchema.parse(JSON.parse(raw.trim()));
  } catch (err) {
    logError('[aiAnalyst] invalid model output', err);
    return { ...base, model: client.model, unavailableReason: 'INVALID_MODEL_OUTPUT' };
  }

  // Post-check: strip recommendation language, keep only facts that cite available blocks.
  const available = new Set<AiDataInputId>(inputs.filter((i) => i.data !== null).map((i) => i.id));
  const terms = new Set<string>();
  let removedSentences = 0;
  const clean = (s: string): string => {
    const r = stripRecommendationLanguage(s);
    removedSentences += r.removed;
    r.terms.forEach((t) => terms.add(t));
    return r.text;
  };

  const summary = clean(parsed.summary);
  let droppedUnsourcedFacts = 0;
  const keyFacts: AiResearchSummary['keyFacts'] = [];
  for (const f of parsed.keyFacts) {
    const statement = clean(f.statement);
    if (!statement) continue;
    const refs = [...new Set(f.sourceRefs.filter((r): r is AiDataInputId => available.has(r as AiDataInputId)))];
    if (refs.length === 0) {
      droppedUnsourcedFacts += 1;
      continue;
    }
    keyFacts.push({ statement, sourceRefs: refs });
  }
  const risks = parsed.risks.map(clean).filter((s) => s.length > 0);
  const modelGaps = parsed.dataGaps.map(clean).filter((s) => s.length > 0);
  // Server-detected gaps always shown, even if the model omitted them.
  const dataGaps = [...new Set([...base.dataGaps, ...modelGaps])];

  return {
    ...base,
    status: 'OK',
    model: client.model,
    summary,
    keyFacts,
    risks,
    dataGaps,
    postCheck: {
      flagged: removedSentences > 0 || droppedUnsourcedFacts > 0,
      removedSentences,
      matchedTerms: [...terms],
      droppedUnsourcedFacts,
    },
  };
}
