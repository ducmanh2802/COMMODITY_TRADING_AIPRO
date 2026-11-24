import type { ExchangeCode } from '../types/instrument';
import {
  EXCHANGE_SCHEDULES,
  exchangeStatus,
  localParts,
  offsetFromVietnamHours,
  sessionsInVietnam,
  type ExchangeId,
  type ExchangeSchedule,
  type VietnamSessionRange,
} from './exchangeHours';
import { formatTimestampInZone, getVietnamClockLabel, VIETNAM_TIMEZONE } from './time';
import { MARKET_HOLIDAYS, type MarketHolidayEntry } from './vietnamCalendar';

export type SessionCountdownFilter = 'ALL' | 'OPEN' | 'CLOSED';

export interface ExchangeMeta {
  symbols: readonly string[];
  primarySymbol: string | null;
  holidayExchanges: readonly ExchangeCode[];
}

export const EXCHANGE_META: Record<ExchangeId, ExchangeMeta> = {
  CBOT: { symbols: ['ZC', 'ZS', 'ZW', 'ZM', 'ZL'], primarySymbol: 'ZC', holidayExchanges: ['CBOT', 'MXV'] },
  NYMEX: { symbols: ['CL', 'NG'], primarySymbol: 'CL', holidayExchanges: ['NYMEX', 'MXV'] },
  COMEX: { symbols: ['GC', 'SI', 'HG'], primarySymbol: 'GC', holidayExchanges: ['COMEX', 'MXV'] },
  ICEUS: { symbols: ['KC', 'SB', 'CT', 'CC'], primarySymbol: 'KC', holidayExchanges: ['ICE', 'MXV'] },
  ICEEU: { symbols: ['BRN', 'RC'], primarySymbol: 'RC', holidayExchanges: ['ICE', 'MXV'] },
  SGX: { symbols: ['FEF'], primarySymbol: 'FEF', holidayExchanges: ['SGX', 'MXV'] },
  LME: { symbols: [], primarySymbol: null, holidayExchanges: [] },
};

export interface CountdownParts {
  totalSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  hms: string;
}

export function splitCountdownSeconds(totalSeconds: number): CountdownParts {
  const clamped = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const days = Math.floor(clamped / 86_400);
  const rem = clamped % 86_400;
  const hours = Math.floor(rem / 3600);
  const minutes = Math.floor((rem % 3600) / 60);
  const seconds = rem % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    totalSeconds: clamped,
    days,
    hours,
    minutes,
    seconds,
    hms: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

export interface SessionCountdownItem {
  id: ExchangeId;
  tz: string;
  scope: string;
  symbols: readonly string[];
  primarySymbol: string | null;
  open: boolean;
  transition: 'CLOSES' | 'OPENS';
  imminent: boolean;
  remainingSeconds: number;
  countdown: CountdownParts;
  nextChangeAtIso: string | null;
  nextChangeVietnamFormatted: string | null;
  nextChangeVietnamHm: string | null;
  nextChangeVietnamWeekday: number | null;
  vietnamRanges: VietnamSessionRange[];
  offsetFromVietnamHours: number;
  holidayToday: MarketHolidayEntry | null;
}

export interface SessionCountdownOverview {
  vietnamClockLabel: string;
  vietnamDateIso: string;
  vietnamWeekday: number;
  openCount: number;
  closedCount: number;
  totalCount: number;
  soonestChange: SessionCountdownItem | null;
  nextToOpen: SessionCountdownItem | null;
  nextToClose: SessionCountdownItem | null;
  sessions: SessionCountdownItem[];
}

function vietnamDateIso(now: Date): { dateIso: string; weekday: number } {
  const p = localParts(now, VIETNAM_TIMEZONE);
  return {
    dateIso: `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    weekday: p.weekday,
  };
}

function findHolidayForExchange(id: ExchangeId, vnDateIso: string): MarketHolidayEntry | null {
  const meta = EXCHANGE_META[id];
  if (!meta.holidayExchanges.length) return null;
  return (
    MARKET_HOLIDAYS.find(
      (h) => h.dateIso === vnDateIso && h.affectedExchanges.some((ex) => meta.holidayExchanges.includes(ex))
    ) ?? null
  );
}

/**
 * Computes live countdown state for one exchange relative to `now`, synced to 1-second Vietnam wall clock
 * ticks and converted into `Asia/Ho_Chi_Minh` (ICT) via existing timezone utilities.
 */
export function computeSessionCountdown(
  schedule: ExchangeSchedule,
  now: Date = new Date(),
  vnDateStr?: string
): SessionCountdownItem {
  const vnInfo = vnDateStr ? { dateIso: vnDateStr } : vietnamDateIso(now);
  const status = exchangeStatus(schedule, now);
  const nowSecMs = Math.floor(now.getTime() / 1000) * 1000;
  const remainingSeconds =
    status.nextChangeAt !== null ? Math.max(0, Math.floor((status.nextChangeAt.getTime() - nowSecMs) / 1000)) : 0;

  const countdown = splitCountdownSeconds(remainingSeconds);
  const nextParts = status.nextChangeAt ? localParts(status.nextChangeAt, VIETNAM_TIMEZONE) : null;
  const meta = EXCHANGE_META[schedule.id];

  return {
    id: schedule.id,
    tz: schedule.tz,
    scope: schedule.scope,
    symbols: meta.symbols,
    primarySymbol: meta.primarySymbol,
    open: status.open,
    transition: status.open ? 'CLOSES' : 'OPENS',
    imminent: remainingSeconds > 0 && remainingSeconds <= 1800,
    remainingSeconds,
    countdown,
    nextChangeAtIso: status.nextChangeAt ? status.nextChangeAt.toISOString() : null,
    nextChangeVietnamFormatted: status.nextChangeAt
      ? formatTimestampInZone(status.nextChangeAt.toISOString(), VIETNAM_TIMEZONE)
      : null,
    nextChangeVietnamHm: nextParts
      ? `${String(nextParts.hour).padStart(2, '0')}:${String(nextParts.minute).padStart(2, '0')}`
      : null,
    nextChangeVietnamWeekday: nextParts ? nextParts.weekday : null,
    vietnamRanges: sessionsInVietnam(schedule, now),
    offsetFromVietnamHours: offsetFromVietnamHours(schedule.tz, now),
    holidayToday: findHolidayForExchange(schedule.id, vnInfo.dateIso),
  };
}

export function buildAllSessionCountdowns(
  now: Date = new Date(),
  filter: SessionCountdownFilter = 'ALL',
  schedules: readonly ExchangeSchedule[] = EXCHANGE_SCHEDULES
): SessionCountdownOverview {
  const vn = vietnamDateIso(now);
  const all = schedules.map((s) => computeSessionCountdown(s, now, vn.dateIso));

  // Open sessions first (soonest to close first), then closed sessions (soonest to open first).
  const sorted = [...all].sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1;
    return a.remainingSeconds - b.remainingSeconds || a.id.localeCompare(b.id);
  });

  const openSessions = sorted.filter((s) => s.open);
  const closedSessions = sorted.filter((s) => !s.open);
  const soonestChange =
    [...all].sort((a, b) => a.remainingSeconds - b.remainingSeconds || a.id.localeCompare(b.id))[0] ?? null;

  const sessions =
    filter === 'OPEN' ? openSessions : filter === 'CLOSED' ? closedSessions : sorted;

  return {
    vietnamClockLabel: getVietnamClockLabel(now),
    vietnamDateIso: vn.dateIso,
    vietnamWeekday: vn.weekday,
    openCount: openSessions.length,
    closedCount: closedSessions.length,
    totalCount: all.length,
    soonestChange,
    nextToOpen: closedSessions[0] ?? null,
    nextToClose: openSessions[0] ?? null,
    sessions,
  };
}
