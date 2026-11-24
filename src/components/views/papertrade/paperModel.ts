/**
 * T58 Paper trading — persistence model for practice sessions ("Phiên giao dịch thử"): Firestore payload
 * builders / parsers, the localStorage fallback for signed-out users and a pure reducer for write ops
 * shared by both backends. No Firebase imports (timestamps are injected) so it is unit-testable.
 * Limits MUST stay in sync with the paper* functions in firestore.rules.
 */
import { normalizePlan, type PaperPlan } from './checklist';
import { normalizeMistakeNote, normalizeMistakeTags, type MistakeTag } from './mistakeStats';
import { DEFAULT_SETTINGS, balanceAfterOpen, type ClosedTradeCalc, type CloseReason, type PaperSettings, type PositionLike, type Side } from './paperMath';

export const PAPER_LIMITS = {
  capitalMin: 1_000_000,
  capitalMax: 1_000_000_000_000,
  journalMax: 1000,
  noteIdMax: 64,
  nameMax: 80,
  contractsMax: 1000,
} as const;

export type SessionStatus = 'active' | 'closed';

export interface PaperSession {
  id: string;
  name: string;
  startingCapitalVnd: number;
  /** Cash balance (capital + realised P&L - fees paid). */
  balanceVnd: number;
  settings: PaperSettings;
  status: SessionStatus;
  createdAtMs: number;
  closedAtMs: number | null;
  /** Stored when the session is closed (no open positions then, so equity == balance). */
  finalEquityVnd: number | null;
}

export interface PaperPosition extends PositionLike {
  sessionId: string;
  entryFxRate: number;
  journal: string;
  researchNoteId: string;
  openedAtMs: number;
  /** Pre-trade checklist result (optional: absent on records saved before this feature). */
  plan?: PaperPlan;
}

export interface PaperTrade {
  id: string;
  sessionId: string;
  instrumentId: string;
  side: Side;
  contracts: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  closeReason: CloseReason;
  grossPnlUsd: number;
  feesVnd: number;
  pnlUsd: number;
  pnlVnd: number;
  rMultiple: number | null;
  fxRate: number;
  journal: string;
  researchNoteId: string;
  openedAtMs: number;
  closedAtMs: number;
  /** Copied from the position at close (optional: absent on older trades). */
  plan?: PaperPlan;
  /** Self-review mistake tags (optional: absent on older / untagged trades). */
  mistakeTags?: MistakeTag[];
  /** Short note for the mistake tags (optional). */
  mistakeNote?: string;
}

export interface PaperState {
  sessions: PaperSession[];
  positions: PaperPosition[];
  trades: PaperTrade[];
}

/**
 * Whether `plan` is written to Firestore. firestore.rules (isValidPaperPlan) allows the optional `plan` field on
 * paperPositions / paperOrders. Local (signed-out) storage always keeps it.
 */
const PERSIST_PLAN_TO_FIRESTORE = true;

export const EMPTY_STATE: PaperState = { sessions: [], positions: [], trades: [] };

/** Validation error key or null. */
export function validateCapital(v: number): 'capitalRange' | null {
  return Number.isFinite(v) && v >= PAPER_LIMITS.capitalMin && v <= PAPER_LIMITS.capitalMax ? null : 'capitalRange';
}

export function validateSessionName(name: string): 'nameRequired' | 'nameTooLong' | null {
  const n = name.trim();
  if (!n) return 'nameRequired';
  return n.length > PAPER_LIMITS.nameMax ? 'nameTooLong' : null;
}

export function newSession(id: string, name: string, capitalVnd: number, now: number = Date.now()): PaperSession {
  return {
    id,
    name: name.trim(),
    startingCapitalVnd: capitalVnd,
    balanceVnd: capitalVnd,
    settings: { ...DEFAULT_SETTINGS },
    status: 'active',
    createdAtMs: now,
    closedAtMs: null,
    finalEquityVnd: null,
  };
}

/** Clamp settings into the ranges the Firestore rules accept. */
export function sanitizeSettings(s: Partial<PaperSettings>): PaperSettings {
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    marginPct: num(s.marginPct, DEFAULT_SETTINGS.marginPct, 0, 100),
    feePerContractUsd: num(s.feePerContractUsd, DEFAULT_SETTINGS.feePerContractUsd, 0, 1000),
    slippageTicks: num(s.slippageTicks, DEFAULT_SETTINGS.slippageTicks, 0, 100),
    marginCallPct: num(s.marginCallPct, DEFAULT_SETTINGS.marginCallPct, 0, 1000),
    stopOutPct: num(s.stopOutPct, DEFAULT_SETTINGS.stopOutPct, 0, 1000),
  };
}

export function newPaperId(prefix: 'ses' | 'pos' | 'ord', now: number = Date.now(), rand: number = Math.random()): string {
  return `${prefix}_${now}_${Math.floor(rand * 1e9).toString(36)}`;
}

// --------------------------------------------------------------------------- write ops (shared by both backends)

export type SessionPatch = Partial<Pick<PaperSession, 'name' | 'startingCapitalVnd' | 'balanceVnd' | 'settings' | 'status' | 'closedAtMs' | 'finalEquityVnd'>>;
type PositionPatch = Partial<Pick<PaperPosition, 'stopLoss' | 'takeProfit' | 'journal' | 'researchNoteId'>>;
export type TradePatch = Partial<Pick<PaperTrade, 'journal' | 'researchNoteId' | 'mistakeTags' | 'mistakeNote'>>;

export type PaperOp =
  | { t: 'sessionCreate'; session: PaperSession }
  | { t: 'sessionUpdate'; id: string; patch: SessionPatch }
  | { t: 'sessionDelete'; id: string }
  | { t: 'positionCreate'; position: PaperPosition }
  | { t: 'positionUpdate'; id: string; patch: PositionPatch }
  | { t: 'positionDelete'; id: string }
  | { t: 'tradeCreate'; trade: PaperTrade }
  | { t: 'tradeUpdate'; id: string; patch: TradePatch }
  | { t: 'tradeDelete'; id: string };

/** Pure reducer used for the localStorage backend (Firestore applies the same ops via a write batch). */
export function applyOps(state: PaperState, ops: PaperOp[]): PaperState {
  let s = state;
  for (const op of ops) {
    switch (op.t) {
      case 'sessionCreate':
        s = { ...s, sessions: [...s.sessions.filter((x) => x.id !== op.session.id), op.session] };
        break;
      case 'sessionUpdate':
        s = { ...s, sessions: s.sessions.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)) };
        break;
      case 'sessionDelete':
        s = {
          sessions: s.sessions.filter((x) => x.id !== op.id),
          positions: s.positions.filter((x) => x.sessionId !== op.id),
          trades: s.trades.filter((x) => x.sessionId !== op.id),
        };
        break;
      case 'positionCreate':
        s = { ...s, positions: [...s.positions.filter((x) => x.id !== op.position.id), op.position] };
        break;
      case 'positionUpdate':
        s = { ...s, positions: s.positions.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)) };
        break;
      case 'positionDelete':
        s = { ...s, positions: s.positions.filter((x) => x.id !== op.id) };
        break;
      case 'tradeCreate':
        s = { ...s, trades: [...s.trades.filter((x) => x.id !== op.trade.id), op.trade] };
        break;
      case 'tradeUpdate':
        s = { ...s, trades: s.trades.map((x) => (x.id === op.id ? { ...x, ...op.patch } : x)) };
        break;
      case 'tradeDelete':
        s = { ...s, trades: s.trades.filter((x) => x.id !== op.id) };
        break;
    }
  }
  return s;
}

/** Ops that wipe a session's positions and trades and restore the starting balance (the "Reset" button). */
export function resetSessionOps(state: PaperState, sessionId: string): PaperOp[] {
  const sess = state.sessions.find((x) => x.id === sessionId);
  if (!sess) return [];
  return [
    ...state.positions.filter((p) => p.sessionId === sessionId).map((p): PaperOp => ({ t: 'positionDelete', id: p.id })),
    ...state.trades.filter((p) => p.sessionId === sessionId).map((p): PaperOp => ({ t: 'tradeDelete', id: p.id })),
    { t: 'sessionUpdate', id: sessionId, patch: { balanceVnd: sess.startingCapitalVnd } },
  ];
}

/** Ops that delete a session and its children (children first so rules' session lookups still pass). */
export function deleteSessionOps(state: PaperState, sessionId: string): PaperOp[] {
  return [...resetSessionOps(state, sessionId).filter((o) => o.t !== 'sessionUpdate'), { t: 'sessionDelete', id: sessionId }];
}

/** Ops to copy a whole local state into Firestore (first sign-in import). Order: sessions, positions, trades. */
export function importOps(local: PaperState): PaperOp[] {
  return [
    ...local.sessions.map((session): PaperOp => ({ t: 'sessionCreate', session })),
    ...local.positions.map((position): PaperOp => ({ t: 'positionCreate', position })),
    ...local.trades.map((trade): PaperOp => ({ t: 'tradeCreate', trade })),
  ];
}

// --------------------------------------------------------------------------- Firestore payloads

/** `ts(ms)` encodes epoch ms as a Firestore Timestamp; `now` is serverTimestamp(). */
export interface TsFns<T> {
  now: T;
  ts: (ms: number) => T;
}

export function buildSessionCreate<T>(userId: string, s: PaperSession, f: TsFns<T>, preserveDates: boolean) {
  return {
    userId,
    name: s.name.slice(0, PAPER_LIMITS.nameMax),
    startingCapitalVnd: s.startingCapitalVnd,
    balanceVnd: s.balanceVnd,
    settings: sanitizeSettings(s.settings),
    status: s.status,
    createdAt: preserveDates ? f.ts(s.createdAtMs) : f.now,
    updatedAt: f.now,
    closedAt: s.closedAtMs === null ? null : preserveDates ? f.ts(s.closedAtMs) : f.now,
    finalEquityVnd: s.finalEquityVnd,
  };
}

export function buildSessionUpdate<T>(p: SessionPatch, f: TsFns<T>) {
  const out: Record<string, unknown> = { updatedAt: f.now };
  if (p.name !== undefined) out.name = p.name.trim().slice(0, PAPER_LIMITS.nameMax);
  if (p.startingCapitalVnd !== undefined) out.startingCapitalVnd = p.startingCapitalVnd;
  if (p.balanceVnd !== undefined) out.balanceVnd = p.balanceVnd;
  if (p.settings !== undefined) out.settings = sanitizeSettings(p.settings);
  if (p.status !== undefined) out.status = p.status;
  if (p.closedAtMs !== undefined) out.closedAt = p.closedAtMs === null ? null : f.now;
  if (p.finalEquityVnd !== undefined) out.finalEquityVnd = p.finalEquityVnd;
  return out;
}

export function buildPositionCreate<T>(userId: string, p: PaperPosition, f: TsFns<T>, preserveDates: boolean) {
  return {
    userId,
    sessionId: p.sessionId,
    instrumentId: p.instrumentId,
    side: p.side,
    contracts: p.contracts,
    entryPrice: p.entryPrice,
    stopLoss: p.stopLoss,
    takeProfit: p.takeProfit,
    marginPerContractUsd: p.marginPerContractUsd,
    entryFeeVnd: p.entryFeeVnd,
    entryFxRate: p.entryFxRate,
    journal: p.journal.slice(0, PAPER_LIMITS.journalMax),
    researchNoteId: p.researchNoteId.slice(0, PAPER_LIMITS.noteIdMax),
    openedAt: preserveDates ? f.ts(p.openedAtMs) : f.now,
    ...(PERSIST_PLAN_TO_FIRESTORE && p.plan ? { plan: p.plan } : {}),
  };
}

export function buildTradeCreate<T>(userId: string, t: PaperTrade, f: TsFns<T>, preserveDates: boolean) {
  return {
    userId,
    sessionId: t.sessionId,
    instrumentId: t.instrumentId,
    side: t.side,
    contracts: t.contracts,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    closeReason: t.closeReason,
    grossPnlUsd: t.grossPnlUsd,
    feesVnd: t.feesVnd,
    pnlUsd: t.pnlUsd,
    pnlVnd: t.pnlVnd,
    rMultiple: t.rMultiple,
    fxRate: t.fxRate,
    journal: t.journal.slice(0, PAPER_LIMITS.journalMax),
    researchNoteId: t.researchNoteId.slice(0, PAPER_LIMITS.noteIdMax),
    openedAt: f.ts(t.openedAtMs),
    closedAt: preserveDates ? f.ts(t.closedAtMs) : f.now,
    ...(PERSIST_PLAN_TO_FIRESTORE && t.plan ? { plan: t.plan } : {}),
    ...mistakeFields(t),
  };
}

function tsToMs(v: unknown): number | null {
  if (v && typeof v === 'object' && 'toMillis' in v && typeof (v as { toMillis: unknown }).toMillis === 'function') {
    const ms = (v as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const nn = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const side = (v: unknown): Side => (v === 'SHORT' ? 'SHORT' : 'LONG');

/** Spreadable optional `plan` (no key at all for old records). */
function planField(v: unknown): { plan?: PaperPlan } {
  const plan = normalizePlan(v);
  return plan ? { plan } : {};
}

/** Spreadable optional mistake fields (no keys for untagged / older records; see firestore.rules isValidPaperOrder). */
function mistakeFields(d: { mistakeTags?: unknown; mistakeNote?: unknown }): { mistakeTags?: MistakeTag[]; mistakeNote?: string } {
  const tags = normalizeMistakeTags(d.mistakeTags);
  const note = normalizeMistakeNote(d.mistakeNote);
  return { ...(tags.length ? { mistakeTags: tags } : {}), ...(note ? { mistakeNote: note } : {}) };
}

export function parseSessionDoc(id: string, d: Record<string, unknown>): PaperSession {
  const raw = (d.settings && typeof d.settings === 'object' ? d.settings : {}) as Partial<PaperSettings>;
  const status: SessionStatus = d.status === 'closed' ? 'closed' : 'active';
  return {
    id,
    name: String(d.name ?? ''),
    startingCapitalVnd: n(d.startingCapitalVnd),
    balanceVnd: n(d.balanceVnd),
    settings: sanitizeSettings(raw),
    status,
    createdAtMs: tsToMs(d.createdAt) ?? Date.now(),
    closedAtMs: status === 'closed' ? (tsToMs(d.closedAt) ?? Date.now()) : null,
    finalEquityVnd: nn(d.finalEquityVnd),
  };
}

export function parsePositionDoc(id: string, d: Record<string, unknown>): PaperPosition {
  return {
    id,
    sessionId: String(d.sessionId ?? ''),
    instrumentId: String(d.instrumentId ?? ''),
    side: side(d.side),
    contracts: n(d.contracts, 1),
    entryPrice: n(d.entryPrice),
    stopLoss: nn(d.stopLoss),
    takeProfit: nn(d.takeProfit),
    marginPerContractUsd: n(d.marginPerContractUsd),
    entryFeeVnd: n(d.entryFeeVnd),
    entryFxRate: n(d.entryFxRate, 1),
    journal: String(d.journal ?? ''),
    researchNoteId: String(d.researchNoteId ?? ''),
    openedAtMs: tsToMs(d.openedAt) ?? Date.now(),
    ...planField(d.plan),
  };
}

const REASONS: CloseReason[] = ['MANUAL', 'STOP_LOSS', 'TAKE_PROFIT', 'STOP_OUT'];

export function parseTradeDoc(id: string, d: Record<string, unknown>): PaperTrade {
  const reason = REASONS.includes(d.closeReason as CloseReason) ? (d.closeReason as CloseReason) : 'MANUAL';
  return {
    id,
    sessionId: String(d.sessionId ?? ''),
    instrumentId: String(d.instrumentId ?? ''),
    side: side(d.side),
    contracts: n(d.contracts, 1),
    entryPrice: n(d.entryPrice),
    exitPrice: n(d.exitPrice),
    stopLoss: nn(d.stopLoss),
    takeProfit: nn(d.takeProfit),
    closeReason: reason,
    grossPnlUsd: n(d.grossPnlUsd),
    feesVnd: n(d.feesVnd),
    pnlUsd: n(d.pnlUsd),
    pnlVnd: n(d.pnlVnd),
    rMultiple: nn(d.rMultiple),
    fxRate: n(d.fxRate, 1),
    journal: String(d.journal ?? ''),
    researchNoteId: String(d.researchNoteId ?? ''),
    openedAtMs: tsToMs(d.openedAt) ?? Date.now(),
    closedAtMs: tsToMs(d.closedAt) ?? Date.now(),
    ...planField(d.plan),
    ...mistakeFields(d),
  };
}

// --------------------------------------------------------------------------- localStorage (signed-out)

export const LOCAL_KEY = 'paperTrading.v2';

export function serializeState(s: PaperState): string {
  return JSON.stringify(s);
}

/** Defensive parse of the stored JSON; returns an empty state on any problem. */
export function deserializeState(raw: string | null): PaperState {
  if (!raw) return EMPTY_STATE;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
    return {
      sessions: arr(j.sessions).map((x) => ({
        ...parseSessionDoc(String(x.id ?? ''), x),
        createdAtMs: n(x.createdAtMs, Date.now()),
        closedAtMs: x.status === 'closed' ? n(x.closedAtMs, Date.now()) : null,
      })),
      positions: arr(j.positions).map((x) => ({ ...parsePositionDoc(String(x.id ?? ''), x), openedAtMs: n(x.openedAtMs, Date.now()) })),
      trades: arr(j.trades).map((x) => ({
        ...parseTradeDoc(String(x.id ?? ''), x),
        openedAtMs: n(x.openedAtMs, Date.now()),
        closedAtMs: n(x.closedAtMs, Date.now()),
      })),
    };
  } catch {
    return EMPTY_STATE;
  }
}

// --------------------------------------------------------------------------- op builders for trading actions

export interface CloseSpec {
  position: PaperPosition;
  exitPrice: number;
  calc: ClosedTradeCalc;
  reason: CloseReason;
}

/** Ops that open a position: create it and deduct the entry fee from the session balance. */
export function openOps(session: PaperSession, position: PaperPosition): PaperOp[] {
  return [
    { t: 'positionCreate', position },
    { t: 'sessionUpdate', id: session.id, patch: { balanceVnd: balanceAfterOpen(session.balanceVnd, position.entryFeeVnd) } },
  ];
}

/** Ops that close one or more positions into trades and write the resulting balance (single batch). */
export function closeOps(session: PaperSession, closes: CloseSpec[], newBalanceVnd: number, fx: number, nowMs: number): PaperOp[] {
  if (closes.length === 0) return [];
  const ops: PaperOp[] = [];
  closes.forEach((c, i) => {
    const p = c.position;
    ops.push({
      t: 'tradeCreate',
      trade: {
        id: newPaperId('ord', nowMs, (i + 1) / (closes.length + 1)),
        sessionId: session.id,
        instrumentId: p.instrumentId,
        side: p.side,
        contracts: p.contracts,
        entryPrice: p.entryPrice,
        exitPrice: c.exitPrice,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        closeReason: c.reason,
        grossPnlUsd: c.calc.grossPnlUsd,
        feesVnd: c.calc.feesVnd,
        pnlUsd: c.calc.pnlUsd,
        pnlVnd: c.calc.pnlVnd,
        rMultiple: c.calc.rMultiple,
        fxRate: fx,
        journal: p.journal,
        researchNoteId: p.researchNoteId,
        openedAtMs: p.openedAtMs,
        closedAtMs: nowMs,
        ...(p.plan ? { plan: p.plan } : {}),
      },
    });
    ops.push({ t: 'positionDelete', id: p.id });
  });
  ops.push({ t: 'sessionUpdate', id: session.id, patch: { balanceVnd: newBalanceVnd } });
  return ops;
}

/** Close a (position-free) session, freezing its final equity. */
export function closeSessionOps(session: PaperSession, nowMs: number): PaperOp[] {
  return [{ t: 'sessionUpdate', id: session.id, patch: { status: 'closed', closedAtMs: nowMs, finalEquityVnd: session.balanceVnd } }];
}
