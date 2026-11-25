/** Split minutes into whole hours and remaining minutes (negative / NaN clamp to 0). */
export function splitMinutes(minutes: number): { h: number; m: number } {
  const total = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Short countdown like "3g46" (hours + zero-padded minutes) or "46p" under an hour. */
export function shortDuration(minutes: number, hShort: string, mShort: string): string {
  const { h, m } = splitMinutes(minutes);
  return h > 0 ? `${h}${hShort}${String(m).padStart(2, '0')}` : `${m}${mShort}`;
}
