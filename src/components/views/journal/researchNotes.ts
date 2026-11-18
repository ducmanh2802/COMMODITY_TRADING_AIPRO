/**
 * Research Notebook (T18) — pure model + validation for owner-only research notes stored in the
 * Firestore `researchNotes` collection. No Firebase imports here so the logic is unit-testable; the
 * view injects `serverTimestamp()` as the timestamp sentinel.
 *
 * The limits below MUST stay in sync with `isValidResearchNote` in firestore.rules.
 */

export const NOTE_LIMITS = {
  titleMax: 120,
  bodyMax: 10_000,
  instrumentIdMax: 32,
  tagsMax: 8,
  tagMax: 32,
  contractCodeMax: 24,
  rangeMax: 40,
} as const;

export const NOTE_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const;
export type NoteTimeframe = (typeof NOTE_TIMEFRAMES)[number];

/** Optional chart context captured when a note is written from a chart. Empty string = not set. */
export interface NoteChartContext {
  timeframe: NoteTimeframe | '';
  contractCode: string;
  rangeStart: string;
  rangeEnd: string;
}

export interface ResearchNote {
  id: string;
  userId: string;
  instrumentId: string;
  title: string;
  body: string;
  tags: string[];
  chartContext: NoteChartContext | null;
  /** Milliseconds since epoch; null while the server timestamp is pending. */
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

/** Form state for create/edit. */
export interface NoteDraft {
  instrumentId: string;
  title: string;
  body: string;
  /** Comma/space separated free text, normalized by `normalizeTags`. */
  tagsText: string;
  timeframe: NoteTimeframe | '';
  contractCode: string;
  rangeStart: string;
  rangeEnd: string;
}

export const EMPTY_DRAFT: NoteDraft = {
  instrumentId: '',
  title: '',
  body: '',
  tagsText: '',
  timeframe: '',
  contractCode: '',
  rangeStart: '',
  rangeEnd: '',
};

export type NoteValidationError =
  | 'instrumentRequired'
  | 'instrumentTooLong'
  | 'titleRequired'
  | 'titleTooLong'
  | 'bodyTooLong'
  | 'tooManyTags'
  | 'tagTooLong'
  | 'badTimeframe'
  | 'contractTooLong'
  | 'rangeTooLong'
  | 'rangeOrder';

const TAG_RE = /^[\p{L}\p{N}_\-.]+$/u;

/** Split on commas/whitespace, strip a leading '#', lowercase, dedupe, keep order. Invalid chars dropped. */
export function normalizeTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, '').trim().toLowerCase();
    if (!tag || !TAG_RE.test(tag) || out.includes(tag)) continue;
    out.push(tag);
  }
  return out;
}

function isTimeframe(v: string): v is NoteTimeframe {
  return (NOTE_TIMEFRAMES as readonly string[]).includes(v);
}

/** Returns the first validation problem, or null when the draft can be saved. */
export function validateDraft(d: NoteDraft): NoteValidationError | null {
  const inst = d.instrumentId.trim();
  if (!inst) return 'instrumentRequired';
  if (inst.length > NOTE_LIMITS.instrumentIdMax) return 'instrumentTooLong';
  const title = d.title.trim();
  if (!title) return 'titleRequired';
  if (title.length > NOTE_LIMITS.titleMax) return 'titleTooLong';
  if (d.body.length > NOTE_LIMITS.bodyMax) return 'bodyTooLong';
  const tags = normalizeTags(d.tagsText);
  if (tags.length > NOTE_LIMITS.tagsMax) return 'tooManyTags';
  if (tags.some((t) => t.length > NOTE_LIMITS.tagMax)) return 'tagTooLong';
  if (d.timeframe !== '' && !isTimeframe(d.timeframe)) return 'badTimeframe';
  if (d.contractCode.trim().length > NOTE_LIMITS.contractCodeMax) return 'contractTooLong';
  const rs = d.rangeStart.trim();
  const re = d.rangeEnd.trim();
  if (rs.length > NOTE_LIMITS.rangeMax || re.length > NOTE_LIMITS.rangeMax) return 'rangeTooLong';
  if (rs && re && rs > re) return 'rangeOrder';
  return null;
}

/** Chart context to persist, or null when every field is empty. */
export function draftChartContext(d: NoteDraft): NoteChartContext | null {
  const ctx: NoteChartContext = {
    timeframe: d.timeframe,
    contractCode: d.contractCode.trim(),
    rangeStart: d.rangeStart.trim(),
    rangeEnd: d.rangeEnd.trim(),
  };
  return ctx.timeframe || ctx.contractCode || ctx.rangeStart || ctx.rangeEnd ? ctx : null;
}

/** Fields that an update may change (mirrors the rules' affectedKeys allowlist). */
export function buildNoteContent(d: NoteDraft) {
  return {
    instrumentId: d.instrumentId.trim(),
    title: d.title.trim(),
    body: d.body,
    tags: normalizeTags(d.tagsText),
    chartContext: draftChartContext(d),
  };
}

/** Full create payload. `ts` is the server-timestamp sentinel (serverTimestamp() in the app). */
export function buildCreatePayload<T>(userId: string, d: NoteDraft, ts: T) {
  return { userId, ...buildNoteContent(d), createdAt: ts, updatedAt: ts };
}

/** Update payload: content fields + updatedAt only (userId/createdAt are immutable). */
export function buildUpdatePayload<T>(d: NoteDraft, ts: T) {
  return { ...buildNoteContent(d), updatedAt: ts };
}

export function noteToDraft(n: ResearchNote): NoteDraft {
  return {
    instrumentId: n.instrumentId,
    title: n.title,
    body: n.body,
    tagsText: n.tags.join(', '),
    timeframe: n.chartContext?.timeframe ?? '',
    contractCode: n.chartContext?.contractCode ?? '',
    rangeStart: n.chartContext?.rangeStart ?? '',
    rangeEnd: n.chartContext?.rangeEnd ?? '',
  };
}

function tsToMs(v: unknown): number | null {
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    const ms = (v as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Defensive parse of a Firestore document into a ResearchNote. */
export function parseNoteDoc(id: string, data: Record<string, unknown>): ResearchNote {
  const raw = data.chartContext;
  let chartContext: NoteChartContext | null = null;
  if (raw && typeof raw === 'object') {
    const c = raw as Record<string, unknown>;
    const tf = String(c.timeframe ?? '');
    chartContext = {
      timeframe: isTimeframe(tf) ? tf : '',
      contractCode: String(c.contractCode ?? ''),
      rangeStart: String(c.rangeStart ?? ''),
      rangeEnd: String(c.rangeEnd ?? ''),
    };
  }
  return {
    id,
    userId: String(data.userId ?? ''),
    instrumentId: String(data.instrumentId ?? ''),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    chartContext,
    createdAtMs: tsToMs(data.createdAt),
    updatedAtMs: tsToMs(data.updatedAt),
  };
}

export interface NoteFilter {
  /** '' = all instruments. */
  instrumentId: string;
  /** '' = any tag. */
  tag: string;
  /** Case-insensitive substring over title + body. */
  text: string;
}

/** Filter, then sort newest-updated first (pending server timestamps sort to the top). */
export function filterNotes(notes: ResearchNote[], f: NoteFilter): ResearchNote[] {
  const text = f.text.trim().toLowerCase();
  const tag = f.tag.trim().toLowerCase();
  return notes
    .filter((n) => !f.instrumentId || n.instrumentId === f.instrumentId)
    .filter((n) => !tag || n.tags.includes(tag))
    .filter((n) => !text || n.title.toLowerCase().includes(text) || n.body.toLowerCase().includes(text))
    .sort((a, b) => (b.updatedAtMs ?? Infinity) - (a.updatedAtMs ?? Infinity) || a.id.localeCompare(b.id));
}

/** Distinct values for filter dropdowns. */
export function collectFacets(notes: ResearchNote[]): { instruments: string[]; tags: string[] } {
  const inst = new Set<string>();
  const tags = new Set<string>();
  for (const n of notes) {
    inst.add(n.instrumentId);
    n.tags.forEach((t) => tags.add(t));
  }
  return { instruments: [...inst].sort(), tags: [...tags].sort() };
}

/** Firestore doc id matching the rules' isValidId (alnum, _ and -). */
export function newNoteId(now: number = Date.now(), rand: number = Math.random()): string {
  return `note_${now}_${Math.floor(rand * 1e9).toString(36)}`;
}

// --------------------------------------------------------------------------- chart -> notebook hand-off

/** Pre-fill handed from the Charts view to the notebook (module-level, consumed once). */
export type PendingNoteContext = Pick<NoteDraft, 'instrumentId' | 'timeframe' | 'contractCode' | 'rangeStart' | 'rangeEnd'>;

let pending: PendingNoteContext | null = null;

export function setPendingNoteContext(ctx: PendingNoteContext): void {
  pending = ctx;
}

export function hasPendingNoteContext(): boolean {
  return pending !== null;
}

/** Read without clearing (safe inside React state initializers, which StrictMode may run twice). */
export function peekPendingNoteContext(): PendingNoteContext | null {
  return pending;
}

export function consumePendingNoteContext(): PendingNoteContext | null {
  const ctx = pending;
  pending = null;
  return ctx;
}

/** Build the hand-off from a chart selection; unknown timeframes are dropped rather than rejected. */
export function chartToPendingContext(input: {
  instrumentId: string;
  contractCode: string;
  timeframe: string;
  firstTimestamp?: string | null;
  lastTimestamp?: string | null;
}): PendingNoteContext {
  return {
    instrumentId: input.instrumentId.slice(0, NOTE_LIMITS.instrumentIdMax),
    contractCode: input.contractCode.slice(0, NOTE_LIMITS.contractCodeMax),
    timeframe: isTimeframe(input.timeframe) ? input.timeframe : '',
    rangeStart: (input.firstTimestamp ?? '').slice(0, NOTE_LIMITS.rangeMax),
    rangeEnd: (input.lastTimestamp ?? '').slice(0, NOTE_LIMITS.rangeMax),
  };
}
