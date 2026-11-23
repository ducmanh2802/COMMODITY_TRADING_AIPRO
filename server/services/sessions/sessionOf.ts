/**
 * Exchange trading-session mapping (pure, no I/O).
 *
 * A "session" is the exchange TRADING DAY. Electronic sessions that start the prior evening belong to the
 * NEXT trading day: CBOT grains open 19:00 Chicago (evening before), CME Globex metals/energy open
 * 18:00 New York. ICE US softs trade a same-day window (no prior-evening start). Wall-clock times are
 * resolved with the IANA zone, so DST changes are handled by Intl, not by fixed offsets.
 * Exchange holidays are NOT modelled (a holiday simply yields no bars, never an invented session).
 * Rules are the exchanges' regular hours; early closes / special schedules are not tracked.
 */
export interface SessionRule {
  timeZone: string;
  /** Local minutes-of-day from which a bar belongs to the NEXT trading day; null = no prior-evening start. */
  rolloverMinutes: number | null;
  /** Local minutes-of-day of the regular close (used only to flag a session as still in progress). */
  closeMinutes: number;
}

export const SESSION_RULES: Readonly<Record<string, SessionRule>> = {
  CBOT: { timeZone: 'America/Chicago', rolloverMinutes: 19 * 60, closeMinutes: 13 * 60 + 20 },
  COMEX: { timeZone: 'America/New_York', rolloverMinutes: 18 * 60, closeMinutes: 17 * 60 },
  NYMEX: { timeZone: 'America/New_York', rolloverMinutes: 18 * 60, closeMinutes: 17 * 60 },
  ICE: { timeZone: 'America/New_York', rolloverMinutes: null, closeMinutes: 13 * 60 + 30 },
};

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  minutesOfDay: number;
}

export function localParts(timestampMs: number, timeZone: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(timestampMs))) p[part.type] = part.value;
  return { year: +p.year, month: +p.month, day: +p.day, minutesOfDay: (+p.hour % 24) * 60 + +p.minute };
}

export function ruleFor(instrument: { exchange: string }): SessionRule | null {
  return SESSION_RULES[instrument.exchange] ?? null;
}

/** Trading-session date (YYYY-MM-DD) of an intraday bar start time; null for an unknown exchange or bad time. */
export function sessionOf(timestampMs: number, instrument: { exchange: string }): string | null {
  const rule = ruleFor(instrument);
  if (!rule || !Number.isFinite(timestampMs)) return null;
  const lp = localParts(timestampMs, rule.timeZone);
  let dayMs = Date.UTC(lp.year, lp.month - 1, lp.day);
  if (rule.rolloverMinutes !== null && lp.minutesOfDay >= rule.rolloverMinutes) dayMs += DAY_MS;
  const dow = new Date(dayMs).getUTCDay();
  if (dow === 6) dayMs += 2 * DAY_MS; // Fri evening / Sat -> Monday
  else if (dow === 0) dayMs += DAY_MS; // Sun daytime -> Monday
  return new Date(dayMs).toISOString().slice(0, 10);
}

/** True while `sessionDate` is the exchange's current, not yet closed session at `nowMs`. */
export function isSessionInProgress(sessionDate: string, nowMs: number, instrument: { exchange: string }): boolean {
  const rule = ruleFor(instrument);
  if (!rule || sessionOf(nowMs, instrument) !== sessionDate) return false;
  const m = localParts(nowMs, rule.timeZone).minutesOfDay;
  return m < rule.closeMinutes || (rule.rolloverMinutes !== null && m >= rule.rolloverMinutes);
}

export const MIN_RETAINED_SESSIONS = 20;

/**
 * Retention cutoff for one intraday series: bars with timestamp < result may be deleted. The cutoff is the
 * calendar window (`now - keepDays`), but never newer than the first bar of the `minSessions`-th most recent
 * session, so at least that many distinct sessions survive. null = delete nothing (unknown exchange, or the
 * series has <= minSessions sessions).
 */
export function retentionCutoffMs(args: {
  barTimestampsMs: number[];
  instrument: { exchange: string };
  nowMs: number;
  keepDays: number;
  minSessions?: number;
}): number | null {
  const minSessions = args.minSessions ?? MIN_RETAINED_SESSIONS;
  const firstBarOf = new Map<string, number>();
  for (const ts of args.barTimestampsMs) {
    const s = sessionOf(ts, args.instrument);
    if (s === null) return null;
    const prev = firstBarOf.get(s);
    if (prev === undefined || ts < prev) firstBarOf.set(s, ts);
  }
  const sessions = [...firstBarOf.keys()].sort().reverse();
  if (sessions.length <= minSessions) return null;
  const protectedFrom = firstBarOf.get(sessions[minSessions - 1])!;
  return Math.min(args.nowMs - args.keepDays * DAY_MS, protectedFrom);
}
