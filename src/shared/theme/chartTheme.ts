/**
 * Shared chart theme (dataviz skill): one source for lightweight-charts defaults plus
 * sequential / diverging / categorical helpers resolved from the CSS tokens in index.css.
 * No green/red anywhere: up = --positive (blue), down = --negative (apricot).
 */
import { ColorType, CrosshairMode, LineStyle, type DeepPartial, type ChartOptions } from 'lightweight-charts';
import { cssVar } from './chartColors';
import { LINE_WIDTH } from './chartScale';

export * from './chartScale';

/** Theme-aware defaults for every lightweight-charts instance: createChart(el, { ...lwBase(), ... }). */
export function lwBase(opts: { timeVisible?: boolean; secondsVisible?: boolean } = {}): DeepPartial<ChartOptions> {
  const grid = cssVar('--chart-grid', 'rgba(228,231,236,0.07)');
  const axis = cssVar('--chart-axis', 'rgba(228,231,236,0.16)');
  const cross = cssVar('--chart-crosshair', 'rgba(228,231,236,0.45)');
  const label = cssVar('--surface-3', '#222C3F');
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: cssVar('--surface', '#201D30') },
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
