/**
 * Reference main-session hours of the world exchanges behind MXV linked contracts.
 * Defined in each exchange's LOCAL time zone; conversion to Vietnam time goes through Intl so US/UK
 * daylight-saving changes are handled automatically (no hardcoded offsets).
 * Reference only: exact hours differ per contract, holidays are not modelled.
 */
import { VIETNAM_TIMEZONE } from './time';

export type ExchangeId = 'CBOT' | 'NYMEX' | 'COMEX' | 'ICEUS' | 'ICEEU' | 'SGX' | 'LME';

/** One recurring weekly window: starts at local weekday `day` (0=Sun..6=Sat) `start` HH:MM, lasts `minutes`. */
interface SessionWindow {
  day: number;
  start: string;
  minutes: number;
}

export interface ExchangeSchedule {
  id: ExchangeId;
  tz: string;
  /** What the schedule represents (Vietnamese, short). */
  scope: string;
  windows: SessionWindow[];
}

const days = (list: number[], start: string, minutes: number): SessionWindow[] => list.map((day) => ({ day, start, minutes }));
const MON_FRI = [1, 2, 3, 4, 5];
const SUN_THU = [0, 1, 2, 3, 4];

export const EXCHANGE_SCHEDULES: ExchangeSchedule[] = [
  {
    id: 'CBOT',
    tz: 'America/Chicago',
    scope: 'Ngô, đậu tương, lúa mì (Globex)',
    // Evening 19:00-07:45 CT, day session 08:30-13:20 CT
    windows: [...days(SUN_THU, '19:00', 765), ...days(MON_FRI, '08:30', 290)],
  },
  { id: 'NYMEX', tz: 'America/Chicago', scope: 'Dầu thô, khí đốt (Globex)', windows: days(SUN_THU, '17:00', 23 * 60) },
  { id: 'COMEX', tz: 'America/Chicago', scope: 'Vàng, bạc, đồng (Globex)', windows: days(SUN_THU, '17:00', 23 * 60) },
  { id: 'ICEUS', tz: 'America/New_York', scope: 'Cà phê, đường, ca cao (gộp ca chính)', windows: days(MON_FRI, '03:30', 600) },
  { id: 'ICEEU', tz: 'Europe/London', scope: 'Dầu Brent', windows: days(MON_FRI, '01:00', 22 * 60) },
  { id: 'SGX', tz: 'Asia/Singapore', scope: 'Cao su TSR20', windows: days(MON_FRI, '08:00', 540) },
  { id: 'LME', tz: 'Europe/London', scope: 'Kim loại cơ bản (giao dịch điện tử)', windows: days(MON_FRI, '01:00', 18 * 60) },
];

const WEEK_MIN = 7 * 1440;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

interface LocalParts {
  weekday: number;
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
}

export function localParts(date: Date, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(date)) p[part.type] = part.value;
  return {
    weekday: WEEKDAY_INDEX[p.weekday] ?? 0,
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
  };
}

/** Minutes since local Sunday 00:00 in `tz`. */
function localWeekMinute(date: Date, tz: string): number {
  const p = localParts(date, tz);
  return p.weekday * 1440 + p.hour * 60 + p.minute;
}

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const windowStart = (w: SessionWindow): number => w.day * 1440 + toMin(w.start);
const mod = (n: number): number => ((n % WEEK_MIN) + WEEK_MIN) % WEEK_MIN;

export interface ExchangeStatus {
  open: boolean;
  /** Minutes until the open/close state flips (null when schedule is empty). */
  minutesToChange: number | null;
  nextChangeAt: Date | null;
}

export function exchangeStatus(schedule: ExchangeSchedule, now: Date): ExchangeStatus {
  const cur = localWeekMinute(now, schedule.tz);
  const isOpenAt = (m: number): boolean => schedule.windows.some((w) => mod(m - windowStart(w)) < w.minutes);
  const open = isOpenAt(cur);
  const bounds = schedule.windows.flatMap((w) => [windowStart(w), mod(windowStart(w) + w.minutes)]);
  let best: number | null = null;
  for (const b of bounds) {
    const delta = mod(b - cur);
    if (delta === 0) continue;
    if (isOpenAt(b) !== open && (best === null || delta < best)) best = delta;
  }
  return {
    open,
    minutesToChange: best,
    nextChangeAt: best === null ? null : new Date(Math.floor(now.getTime() / 60000) * 60000 + best * 60000),
  };
}

/** Offset (minutes, local - UTC) of `tz` at the given instant. */
function offsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/** UTC instant of a wall-clock time in `tz`. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let utc = guess - offsetMinutes(new Date(guess), tz) * 60000;
  utc = guess - offsetMinutes(new Date(utc), tz) * 60000;
  return new Date(utc);
}

export interface VietnamSessionRange {
  /** Vietnam weekdays (0=Sun..6=Sat) on which this range starts. */
  days: number[];
  start: string;
  end: string;
  /** True when the range ends on the next Vietnam calendar day. */
  endsNextDay: boolean;
}

const hhmm = (h: number, m: number): string => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** Session windows expressed in Vietnam time, using the DST rules in force around `ref`. */
export function sessionsInVietnam(schedule: ExchangeSchedule, ref: Date): VietnamSessionRange[] {
  const refLocal = localParts(ref, schedule.tz);
  const refDayStart = Date.UTC(refLocal.year, refLocal.month - 1, refLocal.day);
  const map = new Map<string, VietnamSessionRange>();
  for (const w of schedule.windows) {
    // The date of weekday `w.day` within the local week (Sun..Sat) that contains `ref`.
    const target = new Date(refDayStart + (w.day - refLocal.weekday) * 86_400_000);
    const startUtc = zonedToUtc(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      Number(w.start.slice(0, 2)),
      Number(w.start.slice(3, 5)),
      schedule.tz
    );
    const endUtc = new Date(startUtc.getTime() + w.minutes * 60000);
    const s = localParts(startUtc, VIETNAM_TIMEZONE);
    const e = localParts(endUtc, VIETNAM_TIMEZONE);
    const key = `${hhmm(s.hour, s.minute)}-${hhmm(e.hour, e.minute)}`;
    const existing = map.get(key);
    if (existing) existing.days.push(s.weekday);
    else map.set(key, { days: [s.weekday], start: hhmm(s.hour, s.minute), end: hhmm(e.hour, e.minute), endsNextDay: e.weekday !== s.weekday });
  }
  return [...map.values()]
    .map((r) => ({ ...r, days: [...r.days].sort((a, b) => a - b) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Hours by which Vietnam is ahead of `tz` at `ref`, e.g. 12 for Chicago in US summer. */
export function offsetFromVietnamHours(tz: string, ref: Date): number {
  return (offsetMinutes(ref, VIETNAM_TIMEZONE) - offsetMinutes(ref, tz)) / 60;
}
