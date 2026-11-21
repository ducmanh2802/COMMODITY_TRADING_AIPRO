import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface TooltipRow {
  label: string;
  value: string;
  /** CSS colour for the 2px line key (optional). */
  color?: string;
}

export interface TooltipState {
  x: number;
  y: number;
  title?: string;
  rows: TooltipRow[];
}

/** Hover/focus tooltip state for SVG/HTML charts. Attach wrapRef to a `relative` wrapper. */
export function useChartTooltip(): {
  wrapRef: RefObject<HTMLDivElement | null>;
  tip: TooltipState | null;
  show: (e: { clientX: number; clientY: number }, title: string | undefined, rows: TooltipRow[]) => void;
  showAt: (el: Element, title: string | undefined, rows: TooltipRow[]) => void;
  hide: () => void;
} {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, title: string | undefined, rows: TooltipRow[]) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, rows });
  }, []);
  const showAt = useCallback((el: Element, title: string | undefined, rows: TooltipRow[]) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const b = el.getBoundingClientRect();
    setTip({ x: b.left - r.left + b.width / 2, y: b.top - r.top, title, rows });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { wrapRef, tip, show, showAt, hide };
}

/** Floating readout: value strong, label secondary, 2px line keys (never boxes). Render inside the relative wrapper. */
export function ChartTooltip({ tip, children }: { tip: TooltipState | null; children?: ReactNode }) {
  if (!tip) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-[7rem] max-w-[14rem] rounded-md border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
    >
      {tip.title && <div className="mb-0.5 text-[var(--muted)]">{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          {r.color && (
            <svg aria-hidden="true" width="10" height="4" className="shrink-0">
              <line x1="0" x2="10" y1="2" y2="2" stroke={r.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          <span className="font-semibold tabular-nums text-[var(--text-strong)]">{r.value}</span>
          <span className="truncate text-[var(--muted)]">{r.label}</span>
        </div>
      ))}
      {children}
    </div>
  );
}
