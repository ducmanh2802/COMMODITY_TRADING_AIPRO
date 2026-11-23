/** Client helpers for the Strategy Lab: strategy-param schema types and the walk-forward scan grid. */

export interface ParamDef {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const MAX_GRID_COMBOS = 50;

function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function roundToStep(v: number, step: number): number {
  const d = decimalsOf(step);
  return Number((Math.round(v / step) * step).toFixed(d));
}

/** Three scan values around the current one: value - delta, value, value + delta (clamped, de-duplicated). */
export function scanValues(def: ParamDef, current: number): number[] {
  const delta = Math.max(def.step, roundToStep((def.max - def.min) / 10, def.step));
  const raw = [current - delta, current, current + delta].map((v) => roundToStep(Math.min(def.max, Math.max(def.min, v)), def.step));
  return [...new Set(raw)].sort((a, b) => a - b);
}

export function buildGrid(schema: ParamDef[], values: Record<string, number>, keys: string[]): Record<string, number[]> {
  const grid: Record<string, number[]> = {};
  for (const def of schema) {
    if (keys.includes(def.key)) grid[def.key] = scanValues(def, values[def.key] ?? def.default);
  }
  return grid;
}

export function countCombos(grid: Record<string, number[]>): number {
  const lens = Object.values(grid).map((v) => v.length);
  return lens.length === 0 ? 1 : lens.reduce((a, b) => a * b, 1);
}

export function defaultsOf(schema: ParamDef[]): Record<string, number> {
  return Object.fromEntries(schema.map((d) => [d.key, d.default]));
}
