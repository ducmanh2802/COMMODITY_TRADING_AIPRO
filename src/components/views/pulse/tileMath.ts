/** Direction of a delta: null/0/NaN are flat. */
export function deltaDirection(v: number | null): 'up' | 'down' | 'flat' {
  if (v === null || !Number.isFinite(v) || v === 0) return 'flat';
  return v > 0 ? 'up' : 'down';
}

/** Position (0-100) of `value` within the min..max of `values`; null when it cannot be drawn. */
export function rangePct(value: number | null, values: number[]): number | null {
  if (value === null || !Number.isFinite(value) || values.length < 2) return null;
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of finite) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return 50;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}
