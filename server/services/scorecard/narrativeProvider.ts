/**
 * Narrative provider selection (env AI_PROVIDER = rules | gemini | ollama; default rules).
 * - rules  : free, offline templates (./narrative.ts)
 * - gemini : existing research-summary path (free-tier key from Google AI Studio works)
 * - ollama : local model via OLLAMA_URL /api/generate; falls back to rules when unreachable
 * Every LLM text goes through the same recommendation-language post-check; prompts contain scorecard facts only.
 */
import type { AiLanguage, AiResearchSummary } from '../../../src/shared/types/analysis.ts';
import type { InstrumentDefinition } from '../../../src/shared/types/instrument.ts';
import type { Scorecard, ScorecardNarrative, ScorecardNarrativeProvider } from '../../../src/shared/types/scorecard.ts';
import { stripRecommendationLanguage } from '../aiAnalyst.ts';
import { generateRulesNarrative } from './narrative.ts';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.2';
export const DEFAULT_OLLAMA_TIMEOUT_MS = 30_000;

export function resolveAiProvider(env: NodeJS.ProcessEnv = process.env): ScorecardNarrativeProvider {
  const v = env.AI_PROVIDER?.trim().toLowerCase();
  return v === 'gemini' || v === 'ollama' ? v : 'rules';
}

/** Prompt built only from scorecard facts (labels, numbers, sources, dates). */
export function buildNarrativePrompt(card: Scorecard, language: AiLanguage): string {
  const lang = language === 'vi' ? 'Vietnamese' : 'English';
  const facts = {
    instrument: card.productName,
    price: card.price,
    overall: {
      trendClarity: card.overall.trendClarity.label.en,
      volatilityRisk: card.overall.volatilityRisk.label.en,
      excluded: card.overall.dimensionsExcluded,
    },
    dimensions: card.dimensions.map((d) => ({
      id: d.id,
      status: d.status,
      label: d.label?.en ?? null,
      metrics: d.metrics,
      source: d.source,
      asOf: d.asOf,
    })),
    dataQuality: card.dataQuality.label.en,
  };
  return [
    'You write a neutral 4-6 sentence research summary of one commodity futures instrument for a beginner.',
    'Use ONLY the facts in the JSON below. Do not invent numbers. Mention missing data when a dimension is UNAVAILABLE.',
    'This is NOT trading advice: never recommend or suggest buying, selling, entering, exiting, price targets, stop levels or positions.',
    `Write in ${lang}. Output plain text only.`,
    '',
    JSON.stringify(facts),
  ].join('\n');
}

export interface OllamaOptions {
  url?: string;
  model?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Returns cleaned text, or null when Ollama is unreachable / answers badly / the text is empty after the post-check. */
export async function callOllama(prompt: string, o: OllamaOptions = {}): Promise<string | null> {
  const base = (o.url ?? process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
  const model = o.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL;
  const f = o.fetchFn ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS);
  try {
    const res = await f(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { response?: unknown };
    if (typeof body.response !== 'string') return null;
    const text = stripRecommendationLanguage(body.response.trim()).text;
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface NarrativeDeps {
  provider: ScorecardNarrativeProvider;
  inst: Pick<InstrumentDefinition, 'specification'> | null;
  ollama?: OllamaOptions;
  /** Existing Gemini research-summary path (server/app.ts wires generateResearchSummary). */
  gemini?: (language: AiLanguage) => Promise<AiResearchSummary>;
  now?: () => Date;
}

function llmNarrative(card: Scorecard, language: AiLanguage, text: string, provider: 'gemini' | 'ollama', now: Date): ScorecardNarrative {
  return {
    vi: language === 'vi' ? text : '',
    en: language === 'en' ? text : '',
    provider,
    source: {
      vi: provider === 'gemini' ? 'AI Gemini (chỉ mô tả số liệu của bảng đánh giá)' : 'AI chạy cục bộ qua Ollama (chỉ mô tả số liệu của bảng đánh giá)',
      en: provider === 'gemini' ? 'Gemini AI (describes scorecard figures only)' : 'Local AI via Ollama (describes scorecard figures only)',
    },
    generatedAt: now.toISOString(),
  };
}

/** Builds the narrative with the configured provider; any LLM failure falls back to the rules narrative. */
export async function buildNarrative(card: Scorecard, language: AiLanguage, d: NarrativeDeps): Promise<ScorecardNarrative> {
  const now = (d.now ?? (() => new Date()))();
  const rules = () => generateRulesNarrative(card, d.inst, now);
  if (d.provider === 'ollama') {
    const text = await callOllama(buildNarrativePrompt(card, language), d.ollama);
    return text ? llmNarrative(card, language, text, 'ollama', now) : { ...rules(), fallbackFrom: 'ollama' };
  }
  if (d.provider === 'gemini' && d.gemini) {
    try {
      const a = await d.gemini(language);
      const text = a.status === 'OK' ? stripRecommendationLanguage(a.summary.trim()).text : '';
      if (text) return llmNarrative(card, language, text, 'gemini', now);
    } catch {
      // fall through to rules
    }
    return { ...rules(), fallbackFrom: 'gemini' };
  }
  return rules();
}
