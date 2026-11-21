/**
 * Shared chart theme (dataviz skill): one source for lightweight-charts defaults plus
 * sequential / diverging / categorical helpers resolved from the CSS tokens in index.css.
 * No green/red anywhere: up = --positive (blue), down = --negative (apricot).
 */
import { ColorType, CrosshairMode, LineStyle, type DeepPartial, type ChartOptions } from 'lightweight-charts';
import { cssVar } from './chartColors';

/** Spec: lines are 2px. */
export const LINE_WIDTH = 2;
/** Spec: bars <= 24px, 4px rounded data-end. */
export const BAR_MAX = 24;
export const BAR_RADIUS = 4;

/** Categorical slots available; past this the tail folds into "Khác" (gray). */
export const MAX_SERIES = 6;

const FALLBACK_SERIES = ['#4F91E2', '#BE7E51', '#7F5BB6', '#0D9298', '#8A6E1F', '#C86E93'];

/** Categorical colour for slot i (0-based). Never cycles: slots past MAX_SERIES return the "other" gray. */
export function seriesColor(i: number): string {
  if (i < 0 || i >= MAX_SERIES) return cssVar('--series-other', '#6B7280');
  return cssVar(`--series-${i + 1}`, FALLBACK_SERIES[i]);
}

/** Entity-stable colour: the slot comes from the entity's position in a fixed master list, not its row rank. */
export function entityColor(id: string, masterOrder: readonly string[]): string {
  return seriesColor(masterOrder.indexOf(id));
}

/** CSS-var form (for SVG/HTML, follows the theme automatically). */
export function seriesVar(i: number): string {
  return i < 0 || i >= MAX_SERIES ? 'var(--series-other)' : `var(--series-${i + 1})`;
}

/** Sequential (magnitude) scale: t in 0..1 -> one-hue 5-step ramp token. */
export function seqVar(t: number): string {
  const k = Math.min(4, Math.max(0, Math.round(t * 4)));
  return `var(--seq-${k + 1})`;
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

/** Pole colour by sign (lines / bars). */
export function polarityVar(value: number): string {
  return value >= 0 ? 'var(--positive)' : 'var(--negative)';
}

/** Theme-aware defaults for every lightweight-charts instance: createChart(el, { ...lwBase(), ... }). */
export function lwBase(opts: { timeVisible?: boolean; secondsVisible?: boolean } = {}): DeepPartial<ChartOptions> {
  const grid = cssVar('--chart-grid', 'rgba(228,231,236,0.07)');
  const axis = cssVar('--chart-axis', 'rgba(228,231,236,0.16)');
  const cross = cssVar('--chart-crosshair', 'rgba(228,231,236,0.45)');
  const label = cssVar('--surface-3', '#262C38');
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: cssVar('--surface', '#171B23') },
      textColor: cssVar('--muted', 'rgba(228,231,236,0.68)'),
      fontSize: 11,
      attributionLogo: false,
      panes: { separatorColor: axis, separatorHoverColor: cssVar('--accent-soft', 'rgba(111,147,201,0.16)') },
    },
    grid: {
      vertLines: { color: grid, style: LineStyle.Solid },
      horzLines: { color: grid, style: LineStyle.Solid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: cross, width: 1, style: LineStyle.Solid, labelBackgroundColor: label },
      horzLine: { color: cross, width: 1, style: LineStyle.Solid, labelBackgroundColor: label },
    },
    rightPriceScale: { borderColor: axis },
    timeScale: { borderColor: axis, timeVisible: opts.timeVisible ?? false, secondsVisible: opts.secondsVisible ?? false },
  };
}

/** Options for a 2px line series in lightweight-charts. */
export function lwLine(color: string) {
  return { color, lineWidth: LINE_WIDTH as 2, crosshairMarkerRadius: 4, priceLineVisible: false, lastValueVisible: true };
}

/** Resolve 'var(--token)' (or a plain colour) to a concrete colour for canvas libraries. */
export function resolveColor(c: string): string {
  const m = c.match(/^var\((--[\w-]+)\)$/);
  return m ? cssVar(m[1], '#888888') : c;
}
