/**
 * IANA timezone helpers built on Intl (no dependencies).
 * Converts a source wall-clock time in a declared timezone to UTC and refuses to guess when the local
 * time does not exist (DST spring-forward gap) or is ambiguous (DST fall-back overlap).
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock time of `utcMs` in `timeZone`, expressed as if it were UTC (ms, whole seconds). */
function wallClockAsUtcMs(utcMs: number, timeZone: string): number {
  const parts = getFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const hour = get('hour') % 24;
  return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
}

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type ZonedConversion =
  | { ok: true; utcMs: number }
  | { ok: false; reason: 'NONEXISTENT_LOCAL_TIME' | 'AMBIGUOUS_LOCAL_TIME' };

export function zonedWallTimeToUtc(wall: WallTime, timeZone: string): ZonedConversion {
  const wallMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const DAY = 86_400_000;
  const offsets = new Set<number>();
  for (const delta of [-DAY, 0, DAY]) {
    const probe = wallMs + delta;
    offsets.add(wallClockAsUtcMs(probe, timeZone) - probe);
  }
  const solutions = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallMs - offset;
    if (wallClockAsUtcMs(candidate, timeZone) === wallMs) solutions.add(candidate);
  }
  if (solutions.size === 0) return { ok: false, reason: 'NONEXISTENT_LOCAL_TIME' };
  if (solutions.size > 1) return { ok: false, reason: 'AMBIGUOUS_LOCAL_TIME' };
  return { ok: true, utcMs: [...solutions][0] };
}
