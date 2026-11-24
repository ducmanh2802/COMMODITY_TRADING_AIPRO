/**
 * T92 Expiry calendar & roll reminders (pure date logic). Dates come from the encoded exchange rules in
 * src/shared/contracts (buildContractChain) — never invented here. When a rule is not available for a date
 * (e.g. no first-notice rule) the result keeps that fact so the UI can say "tra lịch sàn" with the source link.
 */
import { buildContractChain } from '../../../shared/contracts/chain';
import { calendarDaysBetween, isIsoDate } from '../../../shared/contracts/dates';

export const CALENDAR_WINDOW_DAYS = 45;
const REMINDER_WINDOW_DAYS = 10;

type ExpiryKind = 'FND' | 'LTD';

export interface ExpiryEvent {
  instrumentId: string;
  contractCode: string;
  kind: ExpiryKind;
  date: string;
  daysLeft: number;
  verified: boolean;
}

export interface InstrumentExpiry {
  events: ExpiryEvent[];
  /** True when at least one listed contract has no computable FND rule. */
  fndUnavailable: boolean;
  /** True when the instrument has no usable calendar at all (no rule encoded). */
  noCalendar: boolean;
  /** Where to check the exchange calendar, when a rule source is known. */
  sourceUrl: string | null;
}

export function todayIso(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Upcoming FND/LTD dates (0..windowDays calendar days ahead) for the next few listed contracts. */
export function instrumentExpiry(instrumentId: string, root: string, asOf: string, windowDays = CALENDAR_WINDOW_DAYS): InstrumentExpiry {
  const empty: InstrumentExpiry = { events: [], fndUnavailable: false, noCalendar: true, sourceUrl: null };
  if (!isIsoDate(asOf)) return empty;
  const chain = buildContractChain({ instrumentId, root, asOf, count: 4 });
  if (chain.status !== 'OK') return empty;
  const events: ExpiryEvent[] = [];
  let fndUnavailable = false;
  let sourceUrl: string | null = null;
  for (const c of chain.contracts) {
    const verified = c.calendarStatus === 'VERIFIED';
    const pairs: [ExpiryKind, typeof c.firstNoticeDay][] = [['FND', c.firstNoticeDay], ['LTD', c.lastTradingDay]];
    for (const [kind, res] of pairs) {
      if (res.status !== 'COMPUTED') {
        if (kind === 'FND') {
          fndUnavailable = true;
          sourceUrl = sourceUrl ?? res.sourceUrl;
        }
        continue;
      }
      sourceUrl = sourceUrl ?? res.sourceUrl;
      const daysLeft = calendarDaysBetween(asOf, res.date);
      if (daysLeft >= 0 && daysLeft <= windowDays) events.push({ instrumentId, contractCode: c.code, kind, date: res.date, daysLeft, verified });
    }
  }
  events.sort((a, b) => a.daysLeft - b.daysLeft || (a.kind === 'FND' ? -1 : 1));
  return { events, fndUnavailable, noCalendar: false, sourceUrl };
}

/** Earliest FND/LTD within the reminder window for an open position (FND wins a tie); null when none. */
export function positionReminder(instrumentId: string, root: string, asOf: string, windowDays = REMINDER_WINDOW_DAYS): ExpiryEvent | null {
  const { events } = instrumentExpiry(instrumentId, root, asOf, windowDays);
  return events[0] ?? null;
}

/** Instruments to show in the calendar: held ones first, then watched (by id or exchange symbol), unique. */
export function relevantInstruments<T extends { id: string; exchangeSymbol: string }>(
  instruments: T[],
  heldIds: string[],
  watchKeys: string[]
): { inst: T; held: boolean }[] {
  const out: { inst: T; held: boolean }[] = [];
  const seen = new Set<string>();
  for (const id of heldIds) {
    const inst = instruments.find((i) => i.id === id);
    if (inst && !seen.has(inst.id)) {
      seen.add(inst.id);
      out.push({ inst, held: true });
    }
  }
  for (const k of watchKeys) {
    const inst = instruments.find((i) => i.id === k || i.exchangeSymbol === k);
    if (inst && !seen.has(inst.id)) {
      seen.add(inst.id);
      out.push({ inst, held: false });
    }
  }
  return out;
}

/** Defensive read of localStorage `ctap.watchlist` (instrument keys only); [] on any problem. */
export function readWatchKeys(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    const env = data && typeof data === 'object' ? (data as { items?: unknown }) : null;
    const rows: unknown[] = Array.isArray(data) ? data : env && Array.isArray(env.items) ? env.items : [];
    return rows
      .map((r) => (r && typeof r === 'object' ? (r as { instrumentId?: unknown }).instrumentId : null))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {
    return [];
  }
}
