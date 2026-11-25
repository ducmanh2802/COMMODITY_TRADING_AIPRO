import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { MAP_H, MAP_W, projectX, projectY } from './mapProjection';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtDateTime, useT } from '../../../i18n';
import type { TFunction } from '../../../i18n';
import type { TKey } from '../../../i18n/vi';
import type { WeatherRegionResult, WeatherRegionsResponse } from '../../../shared/types/weather';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { AlertOctagon, AlertTriangle, CircleCheck, CloudRain, Thermometer } from 'lucide-react';
import { Delta, Fold } from '../pulse/tileBits';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';

type Severity = 'normal' | 'watch' | 'alert';

function severity(r: WeatherRegionResult): Severity {
  if (r.flags.includes('SƯƠNG_GIÁ_RISK') || r.flags.length >= 2) return 'alert';
  return r.flags.length ? 'watch' : 'normal';
}

const SEV_COLOR: Record<Severity, string> = {
  normal: 'var(--muted)',
  watch: 'var(--warning)',
  alert: 'var(--negative)',
};

function whyLine(t: TFunction, r: WeatherRegionResult): string {
  const n = r.next14d;
  const base = { region: r.nameVi, crop: t(`wx.crop.${r.regionId}` as TKey) };
  if (r.flags.includes('SƯƠNG_GIÁ_RISK')) return t('wx.why.frost', { ...base, c: n.tminMin });
  if (r.flags.includes('KHÔ_HẠN')) return t('wx.why.dry', { ...base, pct: Math.abs(n.precipAnomalyPct ?? 0) });
  if (r.flags.includes('MƯA_NHIỀU')) return t('wx.why.wet', { ...base, pct: Math.abs(n.precipAnomalyPct ?? 0) });
  if (r.flags.includes('NẮNG_NÓNG')) return t('wx.why.hot', { ...base, c: n.tmaxAnomalyC });
  return t('wx.why.normal', base);
}

/** Short impact chip: "Chậm thu hoạch · RC" (region/% stay in the bars; the full sentence is the chip's accessible name). */
function impactChip(t: TFunction, r: WeatherRegionResult): { text: string; full: string } {
  const syms = r.instruments.map((id) => id.split(':')[1] ?? id);
  const target = syms.length > 0 ? [...new Set(syms)].join('/') : t(`wx.crop.${r.regionId}` as TKey);
  const f = r.flags;
  const impact = f.includes('SƯƠNG_GIÁ_RISK')
    ? t('wx.impact.frost', { c: r.next14d.tminMin })
    : f.includes('KHÔ_HẠN')
      ? t('wx.impact.dry')
      : f.includes('MƯA_NHIỀU')
        ? t('wx.impact.wet')
        : f.includes('NẮNG_NÓNG')
          ? t('wx.impact.hot')
          : t('wx.impact.normal');
  return { text: `${impact} · ${target}`, full: whyLine(t, r) };
}

function centroid(r: WeatherRegionResult) {
  const lat = r.points.reduce((a, p) => a + p.lat, 0) / r.points.length;
  const lon = r.points.reduce((a, p) => a + p.lon, 0) / r.points.length;
  return { lat, lon };
}

const LandLayer = lazy(() => import('./LandLayer'));
const MARKER_SCALE = 2.6;

/** Equirectangular map (cropped to growing-region band): lazy land outlines, graticule, focusable markers. */
function RegionMap({ regions, onPick, t }: { regions: WeatherRegionResult[]; onPick: (id: string) => void; t: TFunction }) {
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="group" aria-label={t('wx.mapLabel')} className="w-full h-auto rounded-md bg-[var(--surface)] border border-[var(--border)]">
      <Suspense fallback={null}>
        <LandLayer />
      </Suspense>
      {[-30, 0, 30].map((lat) => (
        <line key={`la${lat}`} x1={0} x2={MAP_W} y1={projectY(lat)} y2={projectY(lat)} stroke={lat === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} strokeWidth={1} />
      ))}
      {[-90, -60, -30, 0, 30, 60, 90, 120].map((lon) => (
        <line key={`lo${lon}`} x1={projectX(lon)} x2={projectX(lon)} y1={0} y2={MAP_H} stroke="var(--chart-grid)" strokeWidth={1} />
      ))}
      {regions.map((r) => {
        const c = centroid(r);
        const sev = severity(r);
        const color = SEV_COLOR[sev];
        const label = `${r.nameVi}: ${t(`wx.legend.${sev}` as TKey)}`;
        return (
          <g
            key={r.regionId}
            role="button"
            tabIndex={0}
            aria-label={label}
            className="cursor-pointer focus:outline-none focus-visible:[&>circle:first-of-type]:stroke-[var(--accent)]"
            transform={`translate(${projectX(c.lon)} ${projectY(c.lat)}) scale(${MARKER_SCALE})`}
            onClick={() => onPick(r.regionId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(r.regionId);
              }
            }}
          >
            <title>{r.nameVi}</title>
            <circle cx={0} cy={0} r={9} fill={color} opacity={0.18} stroke="transparent" strokeWidth={1.5} />
            {/* Transparent touch target: >= 40 CSS px across at phone widths (map scales to ~0.32 px/unit). */}
            <circle cx={0} cy={0} r={26} fill="transparent" stroke="none" pointerEvents="all" />
            <SevShape sev={sev} cx={0} cy={0} color={color} />
          </g>
        );
      })}
    </svg>
  );
}

/** Severity marker: shape + colour (never colour alone): circle = normal, triangle = watch, diamond = alert. */
function SevShape({ sev, cx, cy, color }: { sev: Severity; cx: number; cy: number; color: string }) {
  const common = { fill: color, stroke: 'var(--surface)', strokeWidth: 2 } as const;
  if (sev === 'watch') return <polygon points={`${cx},${cy - 6} ${cx + 5.5},${cy + 4} ${cx - 5.5},${cy + 4}`} {...common} />;
  if (sev === 'alert') return <polygon points={`${cx},${cy - 6.5} ${cx + 6.5},${cy} ${cx},${cy + 6.5} ${cx - 6.5},${cy}`} {...common} />;
  return <circle cx={cx} cy={cy} r={4.5} {...common} />;
}

function SevIcon({ sev, className = '' }: { sev: Severity; className?: string }) {
  const Icon = sev === 'alert' ? AlertOctagon : sev === 'watch' ? AlertTriangle : CircleCheck;
  return <Icon aria-hidden="true" className={className} style={{ color: SEV_COLOR[sev] }} />;
}

function Legend({ t }: { t: TFunction }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
      {(['normal', 'watch', 'alert'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <SevIcon sev={s} className="h-3.5 w-3.5" />
          {t(`wx.legend.${s}` as TKey)}
        </span>
      ))}
      {([['wx.rainForecast', 'var(--series-1)'], ['wx.rainNormal', 'var(--series-other)']] as const).map(([k, c]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[2px]" style={{ background: c }} aria-hidden="true" />
          {t(k)}
        </span>
      ))}
    </div>
  );
}

function RegionCard({ r, t }: { r: WeatherRegionResult; t: TFunction }) {
  const { openInstrumentIn } = useTerminal();
  const n = r.next14d;
  const maxRain = Math.max(n.precipMm, n.precipNormalMm, 1);
  const maxDay = Math.max(...r.daily.map((d) => d.precipMm), 1);
  const sev = severity(r);
  const pct = n.precipAnomalyPct;
  const chip = impactChip(t, r);
  const tAnom = n.tmaxAnomalyC;
  return (
    <Card id={`wx-${r.regionId}`} tone={sev === 'normal' ? 'default' : 'warning'} className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{r.nameVi}</h3>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--muted)]">
          <SevIcon sev={sev} className="h-4 w-4" />
          {t(`wx.legend.${sev}` as TKey)}
        </span>
      </div>

      <p className="text-xs">
        <span
          className="inline-flex rounded-full border px-2.5 py-1 font-medium"
          style={sev === 'normal' ? { borderColor: 'var(--border)', color: 'var(--muted)' } : { borderColor: 'var(--warning)', color: 'var(--text-strong)' }}
          title={chip.full}
          aria-label={chip.full}
        >
          {chip.text}
        </span>
      </p>

      <div className="space-y-1" role="group" aria-label={`${t('wx.rain')}: ${t('wx.rainForecast')} ${t('wx.mm', { n: Math.round(n.precipMm) })}, ${t('wx.rainNormal')} ${t('wx.mm', { n: Math.round(n.precipNormalMm) })}`}>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1 text-[var(--muted)]" title={t('wx.rain')}>
            <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
            {pct == null ? t('c4.wx.dry') : <Delta v={pct} text={`${pct > 0 ? '+' : ''}${pct}%`} />}
          </span>
          <span className="tabular-nums text-[var(--muted)]" title={t('wx.tmax')}>
            <Thermometer className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {n.tmaxAvg}°C <Delta v={tAnom} text={`${tAnom > 0 ? '+' : ''}${tAnom}°`} />
          </span>
        </div>
        {([
          [n.precipMm, 'var(--series-1)'],
          [n.precipNormalMm, 'var(--series-other)'],
        ] as const).map(([v, color], i) => (
          <div key={i} className="flex items-center gap-2 text-xs" aria-hidden="true">
            <div className="h-2 flex-1 bg-[var(--surface-2)]">
              <div className="h-2 rounded-r-[4px]" style={{ width: `${(v / maxRain) * 100}%`, background: color }} />
            </div>
            <span className="w-14 shrink-0 text-right tabular-nums text-[var(--text-strong)]">{t('wx.mm', { n: Math.round(v) })}</span>
          </div>
        ))}
      </div>

      <div className="flex h-8 items-end gap-0.5" role="img" aria-label={t('wx.daily')}>
        {r.daily.map((d) => (
          <div key={d.date} className="max-w-[24px] flex-1 rounded-t-[4px] bg-[var(--series-1)] hover:brightness-125" title={`${d.date}: ${d.precipMm} mm, ${d.tmin}–${d.tmax}°C`} style={{ height: `${Math.max(4, (d.precipMm / maxDay) * 100)}%` }} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {r.instruments.length === 0 ? (
          <span className="text-[var(--muted)]" title={t('wx.noInstruments')}>{t('c4.wx.noCt')}</span>
        ) : (
          r.instruments.map((id) => {
            const sym = id.split(':')[1] ?? id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => openInstrumentIn(sym, 'instrument')}
                aria-label={`${t('wx.instruments')}: ${id}`}
                className="inline-flex items-center min-h-10 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[var(--accent-text)] hover:border-[var(--accent)]/60"
              >
                {id}
              </button>
            );
          })
        )}
      </div>

      <Fold summary={t('c4.wx.detail')}>
        <p>{chip.full}</p>
        {r.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.flags.map((f) => (
              <span
                key={f}
                className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
                style={{ borderColor: f === 'SƯƠNG_GIÁ_RISK' ? 'var(--negative)' : 'var(--warning)', color: f === 'SƯƠNG_GIÁ_RISK' ? 'var(--negative)' : 'var(--warning)' }}
              >
                {t(`wx.flag.${f}` as TKey)}
              </span>
            ))}
          </div>
        )}
        <p>
          {t('wx.rain')}: {pct == null ? t('wx.rainNoPct') : `${pct > 0 ? '+' : ''}${pct}% ${t('wx.rainAnomaly')}`} · {t('wx.rainForecast')} {t('wx.mm', { n: Math.round(n.precipMm) })} · {t('wx.rainNormal')} {t('wx.mm', { n: Math.round(n.precipNormalMm) })}
        </p>
        <p>
          {t('wx.tmax')}: {n.tmaxAvg}°C ({t('wx.tmaxVs', { n: n.tmaxNormal })}, {tAnom > 0 ? '+' : ''}{tAnom}°C)
        </p>
        <p>{t('wx.daily')}</p>
        <p>{t('wx.instruments')}: {r.instruments.length === 0 ? t('wx.noInstruments') : r.instruments.join(', ')}</p>
      </Fold>
    </Card>
  );
}

export function WeatherPanel() {
  const t = useT();
  const [data, setData] = useState<WeatherRegionsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback((signal?: AbortSignal) => {
    setState('loading');
    fetchJsonWithRetry<WeatherRegionsResponse>('/api/weather/regions', { signal })
      .then((d) => {
        if (signal?.aborted) return;
        setData(d);
        setState('ready');
      })
      .catch(() => !signal?.aborted && setState('error'));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const pick = (id: string) => document.getElementById(`wx-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <section className="space-y-4">
      <SectionHeader
        title={t('wx.title')}
        actions={data && data.status !== 'UNAVAILABLE' && <span className="text-xs text-[var(--muted)]">{t('wx.updated', { time: fmtDateTime(data.retrievedAt) })}</span>}
      />
      {state === 'loading' && !data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      )}
      {state === 'error' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text)]">
          <p>{t('wx.error')}</p>
          <button type="button" onClick={() => load()} className="mt-2 min-h-10 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--accent-text)]">
            {t('wx.retry')}
          </button>
        </div>
      )}
      {data && data.status === 'UNAVAILABLE' && state !== 'error' && (
        <div role="status" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text)]">
          <p className="text-[var(--warning)]">{t('wx.unavailable')}</p>
          <button type="button" onClick={() => load()} className="mt-2 min-h-10 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--accent-text)]">
            {t('wx.retry')}
          </button>
        </div>
      )}
      {data && data.status !== 'UNAVAILABLE' && data.regions.length === 0 && state !== 'error' && <p className="text-sm text-[var(--muted)]">{t('wx.empty')}</p>}
      {data && data.regions.length > 0 && (
        <>
          <div className="mx-auto max-w-2xl space-y-2">
            <RegionMap regions={data.regions} onPick={pick} t={t} />
            <Legend t={t} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.regions.map((r) => (
              <RegionCard key={r.regionId} r={r} t={t} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
