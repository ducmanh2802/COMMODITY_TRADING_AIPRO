/** Scale legend for diverging (negative | 0 | positive) and sequential (low -> high) colour encodings. */
export function ScaleLegend({
  kind,
  low,
  mid,
  high,
  className = '',
}: {
  kind: 'diverging' | 'sequential';
  low: string;
  mid?: string;
  high: string;
  className?: string;
}) {
  const bg =
    kind === 'diverging'
      ? 'linear-gradient(90deg, var(--negative), color-mix(in srgb, var(--negative) 30%, var(--div-mid)), var(--div-mid), color-mix(in srgb, var(--positive) 30%, var(--div-mid)), var(--positive))'
      : 'linear-gradient(90deg, var(--seq-1), var(--seq-2), var(--seq-3), var(--seq-4), var(--seq-5))';
  return (
    <div className={`flex items-center gap-2 text-[11px] text-[var(--muted)] ${className}`} aria-hidden="true">
      <span>{low}</span>
      <span className="h-2 w-28 rounded-full" style={{ background: bg }} />
      {mid && <span>{mid}</span>}
      <span>{high}</span>
    </div>
  );
}
