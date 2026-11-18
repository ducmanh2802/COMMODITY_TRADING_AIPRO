import type { BriefChartPoint } from '../../../shared/types/brief';
import { fmtDate, fmtFixed, useT } from '../../../i18n';

/** Small inline-SVG price line with the 50-session average (no chart library needed). */
export function BriefSparkline({ points, unit, decimals = 2 }: { points: BriefChartPoint[]; unit: string; decimals?: number }) {
  const t = useT();
  if (points.length < 2) return null;
  const W = 600;
  const H = 120;
  const PAD = 4;
  const values = points.flatMap((p) => (p.ma50 !== null ? [p.close, p.ma50] : [p.close]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
  const closePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  let maPath = '';
  points.forEach((p, i) => {
    if (p.ma50 === null) return;
    maPath += `${maPath ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ma50).toFixed(1)} `;
  });
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <figure className="bg-[#0B0E14] border border-[#263244] rounded-lg p-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[#E5E7EB]/65 mb-2">
        <span className="font-medium text-[#E5E7EB]/85">{t('brief.chartTitle')}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-[#60A5FA]" aria-hidden="true" />
            {t('brief.chartClose')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-[#F59E0B]" aria-hidden="true" />
            {t('brief.chartMa50')}
          </span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-24 sm:h-28" role="img" aria-label={t('brief.chartTitle')}>
        <path d={closePath} fill="none" stroke="#60A5FA" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        {maPath && <path d={maPath} fill="none" stroke="#F59E0B" strokeWidth={1.2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex justify-between text-[11px] font-mono text-[#E5E7EB]/50 mt-1 gap-2">
        <span>
          {fmtDate(first.t)} · {fmtFixed(first.close, decimals)}
        </span>
        <span className="text-right">
          {fmtDate(last.t)} · {fmtFixed(last.close, decimals)} {unit}
        </span>
      </div>
    </figure>
  );
}
