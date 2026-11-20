import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { fmtDateTime, fmtFixed, useI18n } from '../../../i18n';
import type { MarketPulse, PulseGroupStats, PulseIndicator, PulseMover, PulseText } from '../../../shared/types/marketPulse';
import { safeReadJson } from '../../../shared/utils/http';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { Heatmap } from '../../ui/viz/Heatmap';
import { FxPanel } from './FxPanel';

const signed = (v: number | null, d = 2, suffix = ''): string => (v === null ? '-' : `${v > 0 ? '+' : ''}${fmtFixed(v, d)}${suffix}`);
const tone = (v: number | null): string =>
  v === null || v === 0 ? 'text-[var(--muted)]' : v > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';

function Spark({ points }: { points: { value: number }[] }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 2 - ((p.value - min) / span) * (H - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8 text-[var(--accent)]" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IndicatorCard({ ind, lang }: { ind: PulseIndicator; lang: 'vi' | 'en' }) {
  const { t } = useI18n();
  const unit = ind.unit === 'index' ? '' : ind.unit === 'pp' ? ' pp' : '%';
  const chUnit = ind.changeKind === 'pct' ? '%' : ' pp';
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{ind.label[lang]}</p>
        <Badge tone="positive" title={ind.source}>{ind.quality}</Badge>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-[var(--text-strong)]">
        {ind.value === null ? <span className="text-sm text-[var(--faint)]">{t('pulse.unavailable')}</span> : `${fmtFixed(ind.value, 2)}${unit}`}
      </p>
      <Spark points={ind.spark} />
      <div className="flex gap-4 text-xs tabular-nums">
        <span>
          <span className="text-[var(--faint)]">{t('pulse.change1m')} </span>
          <span className={tone(ind.change1m)}>{signed(ind.change1m, 2, chUnit)}</span>
        </span>
        <span>
          <span className="text-[var(--faint)]">{t('pulse.change3m')} </span>
          <span className={tone(ind.change3m)}>{signed(ind.change3m, 2, chUnit)}</span>
        </span>
      </div>
      {ind.formula && <p className="text-[11px] text-[var(--faint)]">{t('pulse.formula', { v: ind.formula[lang] })}</p>}
      <p className="text-[11px] text-[var(--faint)]">
        {ind.asOf ? `${t('pulse.asOf', { v: ind.asOf })} · ` : ''}
        <a href={ind.sourceUrl} target="_blank" rel="noreferrer" className="underline">{ind.source}</a>
      </p>
    </Card>
  );
}

function BreadthBar({ up, down, flat, label }: { up: number; down: number; flat: number; label: string }) {
  const { t } = useI18n();
  const total = up + down + flat || 1;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{label}</span>
        <span className="tabular-nums">
          {up} {t('pulse.up')} · {down} {t('pulse.down')} · {flat} {t('pulse.flat')}
        </span>
      </div>
      <div className="flex h-2 rounded overflow-hidden bg-[var(--surface-2)]" role="img" aria-label={`${up}/${down}/${flat}`}>
        <div className="bg-[var(--positive)]" style={{ width: `${(up / total) * 100}%` }} />
        <div className="bg-[var(--faint)]" style={{ width: `${(flat / total) * 100}%` }} />
        <div className="bg-[var(--negative)]" style={{ width: `${(down / total) * 100}%` }} />
      </div>
    </div>
  );
}

function VolGauge({ g, lang }: { g: PulseGroupStats; lang: 'vi' | 'en' }) {
  const { t } = useI18n();
  const p = g.volPercentile;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--text)]">{g.label[lang]}</span>
        <span className="text-[var(--muted)] tabular-nums">{p === null ? '-' : t('pulse.percentile', { v: fmtFixed(p, 0) })}</span>
      </div>
      <div className="relative h-2 rounded bg-[var(--surface-2)]">
        {p !== null && <div className="absolute top-[-2px] h-3 w-1 rounded bg-[var(--accent)]" style={{ left: `calc(${p}% - 2px)` }} />}
      </div>
      <p className="text-[11px] text-[var(--faint)]">{g.volLevel ? t(`pulse.vol.${g.volLevel}` as 'pulse.vol.HIGH') : t('pulse.vol.none')}</p>
    </div>
  );
}

function MoverList({ title, items }: { title: string; items: PulseMover[] }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-xs text-[var(--muted)] mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--faint)]">{t('pulse.none')}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((m) => (
            <li key={m.symbol} className="flex justify-between text-sm" title={`${m.name} · ${m.asOf}`}>
              <span className="text-[var(--text)]">{m.symbol} <span className="text-[var(--faint)] text-xs">{m.name}</span></span>
              <span className={`tabular-nums ${tone(m.changePct)}`}>{signed(m.changePct, 2, '%')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Explanations({ items, lang }: { items: MarketPulse['explanations']; lang: 'vi' | 'en' }) {
  const { t } = useI18n();
  return (
    <Card className="space-y-2">
      <details>
        <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-[var(--text-strong)]">
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
          {t('pulse.why')}
        </summary>
        <dl className="mt-3 space-y-3">
          {items.map((e) => (
            <div key={e.id}>
              <dt className="text-sm font-medium text-[var(--text)]">{e.title[lang]}</dt>
              <dd className="text-sm text-[var(--muted)]">{e.body[lang]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}

const text = (x: PulseText, lang: 'vi' | 'en') => x[lang];

/**
 * "Tình hình tài chính thế giới": Fed/rates/inflation/USD + commodity market pulse (GET /api/market-pulse).
 * Self-contained: drop it into any page of the "Thị trường" section.
 */
export function MarketPulsePanel() {
  const { t, lang } = useI18n();
  const l = (lang === 'en' ? 'en' : 'vi') as 'vi' | 'en';
  const [data, setData] = useState<MarketPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market-pulse', { signal });
      setData(await safeReadJson<MarketPulse>(res));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const header = (
    <SectionHeader
      title={t('pulse.title')}
      subtitle={t('pulse.subtitle')}
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {t('pulse.retry')}
        </button>
      }
    />
  );

  if (loading && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        <Skeleton className="h-32" />
        <p className="text-sm text-[var(--muted)]">{t('pulse.loading')}</p>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        <Card tone="warning">{t('pulse.error', { msg: error })}</Card>
      </div>
    );
  }
  if (!data) return null;

  const ind = (id: PulseIndicator['id']) => data.fed.find((i) => i.id === id);
  const rates = (['FED_FUNDS', 'DGS2', 'DGS10', 'SPREAD_10Y2Y'] as const).map(ind).filter((x): x is PulseIndicator => Boolean(x));
  const infl = (['CPI_YOY', 'REAL_10Y'] as const).map(ind).filter((x): x is PulseIndicator => Boolean(x));
  const usd = ind('USD_BROAD');
  const c = data.commodities;

  return (
    <div className="space-y-5 max-w-6xl">
      {header}
      <p className="text-xs text-[var(--faint)]">{t('pulse.generatedAt', { v: fmtDateTime(data.generatedAt) })}</p>

      <Card tone="accent" className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('pulse.summaryTitle')}</h3>
        {data.summary.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">{t('pulse.summaryEmpty')}</p>
        ) : (
          <p className="text-sm text-[var(--text)] leading-relaxed">{data.summary.map((s) => text(s, l)).join(' ')}</p>
        )}
      </Card>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('pulse.fedTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rates.map((i) => <IndicatorCard key={i.id} ind={i} lang={l} />)}
        </div>
        <Card className="text-sm">
          <span className="font-medium text-[var(--text)]">{t('pulse.fomcTitle')}: </span>
          <span className="text-[var(--muted)]">{text(data.fomc.note, l)} </span>
          <a href={data.fomc.calendarUrl} target="_blank" rel="noreferrer" className="underline text-[var(--accent-text)]">{t('pulse.fomcLink')}</a>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('pulse.inflationTitle')} · {t('pulse.usdTitle')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {infl.map((i) => <IndicatorCard key={i.id} ind={i} lang={l} />)}
          {usd && <IndicatorCard ind={usd} lang={l} />}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('pulse.commTitle')}</h3>
        {c.note && <Card tone="warning" className="text-sm">{text(c.note, l)}</Card>}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[var(--text)]">{t('pulse.breadthTitle')}</h4>
              <Badge tone={c.quality === 'OFFICIAL' ? 'positive' : 'warning'}>{c.quality}</Badge>
            </div>
            <BreadthBar up={c.breadth.up1d} down={c.breadth.down1d} flat={c.breadth.flat1d} label={t('pulse.breadthToday')} />
            <BreadthBar up={c.breadth.up5d} down={c.breadth.down5d} flat={c.breadth.flat5d} label={t('pulse.breadth5d')} />
            <p className="text-[11px] text-[var(--faint)]">
              {t('pulse.withData', { n: c.breadth.instrumentsWithData })}
              {c.breadth.asOf ? ` · ${t('pulse.asOf', { v: c.breadth.asOf })}` : ''}
              {c.historySources.length > 0 ? ` · ${t('pulse.commSource', { v: c.historySources.join(', ') })}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <MoverList title={t('pulse.moversUp')} items={c.moversUp} />
              <MoverList title={t('pulse.moversDown')} items={c.moversDown} />
            </div>
          </Card>
          <Card className="space-y-3">
            <h4 className="text-sm font-medium text-[var(--text)]">{t('pulse.groupTitle')}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-[var(--faint)]">
                  <tr>
                    <th className="text-left font-normal"></th>
                    <th className="text-right font-normal">{t('pulse.d1')}</th>
                    <th className="text-right font-normal">{t('pulse.d5')}</th>
                    <th className="text-right font-normal">{t('pulse.d20')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-[var(--muted)]">{t('pulse.avgAll')}</td>
                    {[c.avg1d, c.avg5d, c.avg20d].map((v, i) => <td key={i} className={`text-right ${tone(v)}`}>{signed(v, 2, '%')}</td>)}
                  </tr>
                  {c.groups.map((g) => (
                    <tr key={g.group}>
                      <td className="text-[var(--text)]">{g.label[l]} <span className="text-[var(--faint)]">({g.count})</span></td>
                      {[g.avg1d, g.avg5d, g.avg20d].map((v, i) => <td key={i} className={`text-right ${tone(v)}`}>{signed(v, 2, '%')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h4 className="text-sm font-medium text-[var(--text)] pt-2">{t('sm.heat.title')}</h4>
            <Heatmap
              ariaLabel={t('sm.heat.aria')}
              noDataLabel={t('sm.heat.noData')}
              formatPct={(p) => signed(p, 1, '%')}
              tiles={c.groups.map((g) => ({ id: g.group, label: g.label[l], pct: g.avg1d, sub: `(${g.count})` }))}
            />
            <p className="text-[11px] text-[var(--faint)]">{t('sm.heat.note')}</p>
            <h4 className="text-sm font-medium text-[var(--text)] pt-2">{t('pulse.volTitle')}</h4>
            <div className="space-y-3">
              {c.groups.map((g) => (
                <div key={g.group}>
                  <VolGauge g={g} lang={l} />
                  {g.corrUsd60d !== null && (
                    <p className="text-[11px] text-[var(--faint)] mt-0.5">{t('pulse.corr', { v: fmtFixed(g.corrUsd60d, 2), n: g.corrObservations })}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <FxPanel />

      <Explanations items={data.explanations} lang={l} />
      {data.warnings.length > 0 && <p className="text-[11px] text-[var(--faint)]">{t('pulse.warnings', { v: data.warnings.join('; ') })}</p>}
      <p className="text-xs text-[var(--muted)]">
        <span className="font-medium">{t('pulse.disclaimerLabel')}: </span>
        {text(data.disclaimer, l)}
      </p>
    </div>
  );
}
