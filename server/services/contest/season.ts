/** T63 - contest seasons: one per calendar month in Asia/Ho_Chi_Minh (UTC+7, no DST). */
const ICT_OFFSET_MS = 7 * 3_600_000;

/** Season id 'YYYY-MM' for an instant, in Vietnam time. */
export function seasonIdOf(ms: number): string {
  const d = new Date(ms + ICT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const SEASON_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** [startMs, endMs) of a season, i.e. 00:00 ICT on the 1st of the month to 00:00 ICT of the next month. */
export function seasonRange(id: string): { startMs: number; endMs: number } {
  if (!SEASON_RE.test(id)) throw new Error(`Bad season id: ${id}`);
  const y = Number(id.slice(0, 4));
  const m = Number(id.slice(5, 7));
  return {
    startMs: Date.UTC(y, m - 1, 1) - ICT_OFFSET_MS,
    endMs: Date.UTC(y, m, 1) - ICT_OFFSET_MS,
  };
}

/** Calendar day key (YYYY-MM-DD) in Vietnam time. */
export function ictDayKey(ms: number): string {
  return new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10);
}
