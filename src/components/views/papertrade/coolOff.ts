/**
 * Paper trading discipline — forced cool-off after a losing streak or a bad day (pure, no React).
 * Education only: it pauses NEW practice orders so the learner stops and reviews; closing or reducing
 * existing positions is never blocked. Not advice to buy or sell.
 *
 * Rule (defaults): 3 consecutive losing closed trades, OR realised loss for the current Vietnam calendar day
 * (Asia/Ho_Chi_Minh, fixed UTC+7, no DST) at or below -3% of the session's starting capital → new orders are
 * locked for 24h from the close that triggered it. A later trigger (e.g. a 4th loss) restarts the 24h.
 */

export interface CoolOffTrade {
  pnlVnd: number;
  closedAtMs: number;
  /** Capital the daily-loss % is measured against (the trade's session starting capital). */
  baseVnd: number;
}

export interface CoolOffConfig {
  streak: number;
  /** Positive number: lock when today's realised loss is <= -dailyLossPct % of base. */
  dailyLossPct: number;
  lockMs: number;
}

export const COOL_OFF_DEFAULTS: CoolOffConfig = { streak: 3, dailyLossPct: 3, lockMs: 24 * 3600_000 };

export type CoolOffReason = 'streak' | 'dailyLoss';

export interface CoolOffStats {
  /** Current trailing run of losing trades (0 when the last trade was not a loss). */
  lossStreak: number;
  /** Realised P&L of the current Vietnam day. */
  todayPnlVnd: number;
  /** Realised P&L of the current Vietnam day, % of base (sum of per-trade %). */
  todayPnlPct: number;
  /** Close time of the trade that started the active lock (null when unlocked). */
  triggeredAtMs: number | null;
}

export interface CoolOffResult {
  locked: boolean;
  reason: CoolOffReason | null;
  /** Epoch ms when new orders unlock (null when unlocked). */
  until: number | null;
  stats: CoolOffStats;
}

const VN_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** Vietnam calendar day index (days since 1970-01-01 in UTC+7). */
export function vnDayIndex(ms: number): number {
  return Math.floor((ms + VN_OFFSET_MS) / DAY_MS);
}

const pctOf = (t: CoolOffTrade) => (t.baseVnd > 0 ? (t.pnlVnd / t.baseVnd) * 100 : 0);

export function evaluateCoolOff(trades: CoolOffTrade[], nowMs: number, cfg: CoolOffConfig = COOL_OFF_DEFAULTS): CoolOffResult {
  const sorted = trades.filter((t) => Number.isFinite(t.closedAtMs) && Number.isFinite(t.pnlVnd) && t.closedAtMs <= nowMs).sort((a, b) => a.closedAtMs - b.closedAtMs);
  let streak = 0;
  let day = Number.NaN;
  let dayPct = 0;
  let trigger: { at: number; reason: CoolOffReason } | null = null;
  for (const t of sorted) {
    streak = t.pnlVnd < 0 ? streak + 1 : 0;
    const d = vnDayIndex(t.closedAtMs);
    if (d !== day) {
      day = d;
      dayPct = 0;
    }
    dayPct += pctOf(t);
    // A trigger needs a losing close; the later trigger wins (restarts the 24h).
    if (t.pnlVnd < 0) {
      if (streak >= cfg.streak) trigger = { at: t.closedAtMs, reason: 'streak' };
      else if (dayPct <= -cfg.dailyLossPct) trigger = { at: t.closedAtMs, reason: 'dailyLoss' };
    }
  }
  const today = vnDayIndex(nowMs);
  const todays = sorted.filter((t) => vnDayIndex(t.closedAtMs) === today);
  const todayPnlVnd = todays.reduce((s, t) => s + t.pnlVnd, 0);
  const todayPnlPct = todays.reduce((s, t) => s + pctOf(t), 0);
  const active = trigger && trigger.at + cfg.lockMs > nowMs ? trigger : null;
  return {
    locked: !!active,
    reason: active ? active.reason : null,
    until: active ? active.at + cfg.lockMs : null,
    stats: { lossStreak: streak, todayPnlVnd, todayPnlPct, triggeredAtMs: active ? active.at : null },
  };
}

/** Maps paper state (all sessions, so starting a new session does not skip the pause) to cool-off input. */
export function coolOffTradesFromState(state: {
  sessions: { id: string; startingCapitalVnd: number }[];
  trades: { sessionId: string; pnlVnd: number; closedAtMs: number }[];
}): CoolOffTrade[] {
  const cap = new Map(state.sessions.map((s) => [s.id, s.startingCapitalVnd]));
  return state.trades.map((t) => ({ pnlVnd: t.pnlVnd, closedAtMs: t.closedAtMs, baseVnd: cap.get(t.sessionId) ?? 0 }));
}
