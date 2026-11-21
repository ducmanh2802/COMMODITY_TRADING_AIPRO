import { useCallback, useEffect, useState } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtDateTime, useT } from '../../../i18n';
import type { TFunction } from '../../../i18n';
import type { TKey } from '../../../i18n/vi';
import type { WeatherRegionResult, WeatherRegionsResponse } from '../../../shared/types/weather';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
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

function centroid(r: WeatherRegionResult) {
  const lat = r.points.reduce((a, p) => a + p.lat, 0) / r.points.length;
  const lon = r.points.reduce((a, p) => a + p.lon, 0) / r.points.length;
  return { lat, lon };
}

/** Equirectangular sketch (graticule + markers); no map library. */
function RegionMap({ regions, onPick, t }: { regions: WeatherRegionResult[]; onPick: (id: string) => void; t: TFunction }) {
  const W = 360;
  const H = 180;
  const x = (lon: number) => ((lon + 180) / 360) * W;
  const y = (lat: number) => ((90 - lat) / 180) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('wx.mapLabel')} className="w-full h-auto rounded-md bg-[var(--surface-2)] border border-[var(--border)]">
      {[-60, -30, 0, 30, 60].map((lat) => (
        <line key={`la${lat}`} x1={0} x2={W} y1={y(lat)} y2={y(lat)} stroke="var(--border)" strokeWidth={lat === 0 ? 0.8 : 0.4} strokeDasharray={lat === 0 ? undefined : '2 3'} />
      ))}
      {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => (
        <line key={`lo${lon}`} x1={x(lon)} x2={x(lon)} y1={0} y2={H} stroke="var(--border)" strokeWidth={0.4} strokeDasharray="2 3" />
      ))}
      {regions.map((r) => {
        const c = centroid(r);
        const color = SEV_COLOR[severity(r)];
        return (
          <g key={r.regionId} className="cursor-pointer" onClick={() => onPick(r.regionId)}>
            <title>{r.nameVi}</title>
            <circle cx={x(c.lon)} cy={y(c.lat)} r={9} fill={color} opacity={0.18} />
            <circle cx={x(c.lon)} cy={y(c.lat)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={1} />
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ t }: { t: TFunction }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
      {(['normal', 'watch', 'alert'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SEV_COLOR[s] }} />
          {t(`wx.legend.${s}` as TKey)}
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
  return (
    <Card id={`wx-${r.regionId}`} tone={sev === 'normal' ? 'default' : 'warning'} className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{r.nameVi}</h3>
        <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEV_COLOR[sev] }} />
      </div>

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

      <p className="text-sm text-[var(--text-strong)]">{whyLine(t, r)}</p>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs text-[var(--muted)]">
          <span>{t('wx.rain')}</span>
          <span style={{ color: pct == null ? undefined : pct <= -40 ? 'var(--warning)' : pct >= 50 ? 'var(--accent-text)' : undefined }}>
            {pct == null ? t('wx.rainNoPct') : `${pct > 0 ? '+' : ''}${pct}% ${t('wx.rainAnomaly')}`}
          </span>
        </div>
        {([
          ['wx.rainForecast', n.precipMm, 'var(--accent)'],
          ['wx.rainNormal', n.precipNormalMm, 'var(--muted)'],
        ] as const).map(([label, v, color]) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 text-[var(--muted)]">{t(label)}</span>
            <div className="h-2 flex-1 rounded-full bg-[var(--surface-2)]">
              <div className="h-2 rounded-full" style={{ width: `${(v / maxRain) * 100}%`, background: color }} />
            </div>
            <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text-strong)]">{t('wx.mm', { n: Math.round(v) })}</span>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[var(--muted)]">{t('wx.tmax')}</span>
        <span className="tabular-nums text-[var(--text-strong)]">
          {n.tmaxAvg}°C <span className="text-[var(--muted)]">({t('wx.tmaxVs', { n: n.tmaxNormal })}, {n.tmaxAnomalyC > 0 ? '+' : ''}{n.tmaxAnomalyC}°C)</span>
        </span>
      </div>

      <div>
        <div className="mb-1 text-xs text-[var(--muted)]">{t('wx.daily')}</div>
        <div className="flex h-10 items-end gap-0.5" aria-hidden="true">
          {r.daily.map((d) => (
            <div key={d.date} className="flex-1 rounded-t-sm bg-[var(--accent)]/70" title={`${d.date}: ${d.precipMm} mm, ${d.tmin}–${d.tmax}°C`} style={{ height: `${Math.max(4, (d.precipMm / maxDay) * 100)}%` }} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[var(--muted)]">{t('wx.instruments')}:</span>
        {r.instruments.length === 0 ? (
          <span className="text-[var(--muted)]">{t('wx.noInstruments')}</span>
        ) : (
          r.instruments.map((id) => {
            const sym = id.split(':')[1] ?? id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => openInstrumentIn(sym, 'instrument')}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[var(--accent-text)] hover:border-[var(--accent)]/60"
              >
                {id}
              </button>
            );
          })
        )}
      </div>
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
        subtitle={t('wx.disclaimer')}
        actions={data && <span className="text-xs text-[var(--muted)]">{t('wx.updated', { time: fmtDateTime(data.retrievedAt) })}</span>}
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
          <button type="button" onClick={() => load()} className="mt-2 rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--accent-text)]">
            {t('wx.retry')}
          </button>
        </div>
      )}
      {data && data.regions.length === 0 && state !== 'error' && <p className="text-sm text-[var(--muted)]">{t('wx.empty')}</p>}
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
