/**
 * Pure (library-free) chart scale helpers: categorical / sequential / diverging colours from CSS tokens.
 * Split from chartTheme.ts so non-chart views (heatmaps, world markets) do not pull lightweight-charts into the entry bundle.
 */
import { cssVar } from './chartColors';

/** Spec: lines are 2px. */
export const LINE_WIDTH = 2;

/** Categorical slots available; past this the tail folds into "Khác" (gray). */
export const MAX_SERIES = 6;

const FALLBACK_SERIES = ['#38BDF8', '#F5A524', '#A78BFA', '#2DD4BF', '#F472B6', '#8B95FF'];

/** Categorical colour for slot i (0-based). Never cycles: slots past MAX_SERIES return the "other" gray. */
export function seriesColor(i: number): string {
  if (i < 0 || i >= MAX_SERIES) return cssVar('--series-other', '#6B7280');
  return cssVar(`--series-${i + 1}`, FALLBACK_SERIES[i]);
}

/** CSS-var form (for SVG/HTML, follows the theme automatically). */
export function seriesVar(i: number): string {
  return i < 0 || i >= MAX_SERIES ? 'var(--series-other)' : `var(--series-${i + 1})`;
}

/**
 * Diverging (polarity) fill: --positive <-> --div-mid (neutral gray) <-> --negative.
 * Strength is capped so in-tile text keeps contrast.
 */
export function divergingFill(value: number | null, maxAbs: number): string {
  if (value === null || !Number.isFinite(value) || maxAbs <= 0 || value === 0) return 'var(--div-mid)';
  const k = Math.min(1, Math.abs(value) / maxAbs);
  const pct = Math.round((0.3 + 0.3 * k) * 100);
  const pole = value >= 0 ? 'var(--positive)' : 'var(--negative)';
  return `color-mix(in srgb, ${pole} ${pct}%, var(--div-mid))`;
}
