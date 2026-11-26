import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { fmtDateTime, useI18n, type TKey } from '../../../i18n';
import type { Scorecard, ScorecardListResponse } from '../../../shared/types/scorecard';
import type { DataQualityStatus } from '../../../shared/types/market';
import { safeReadJson } from '../../../shared/utils/http';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { SkeletonCards } from '../../ui/Skeleton';
import { ScorecardDrawer } from './ScorecardDrawer';
import { DimBadge, DimBar, QualityDots, ScoreBar, dimOf } from './shared';

type SortKey = 'name' | 'trend' | 'momentum' | 'volatility' | 'cot' | 'clarity' | 'risk' | 'quality';
const QUALITY_RANK: Record<string, number> = { GOOD: 3, LIMITED: 2, POOR: 1, UNAVAILABLE: 0 };

function sortValue(c: Scorecard, key: SortKey): number | string | null {
  switch (key) {
    case 'name': return c.vietnameseName ?? c.productName;
    case 'trend': return dimOf(c, 'trend')?.score ?? null;
    case 'momentum': return dimOf(c, 'momentum')?.score ?? null;
    case 'volatility': return dimOf(c, 'volatility')?.score ?? null;
    case 'cot': return dimOf(c, 'cot')?.score ?? null;
    case 'clarity': return c.overall.trendClarity.score;
    case 'risk': return c.overall.volatilityRisk.score;
    case 'quality': return QUALITY_RANK[c.dataQuality.level] ?? 0;
  }
}

function fmtPrice(v: number | null): string {
  if (v === null) return '—';
  return v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 2 : 4 });
}

const COLS: Array<{ key: SortKey; label: TKey }> = [
  { key: 'name', label: 'sc.col.name' },
  { key: 'trend', label: 'sc.col.trend' },
  { key: 'momentum', label: 'sc.col.momentum' },
  { key: 'volatility', label: 'sc.col.volatility' },
  { key: 'cot', label: 'sc.col.cot' },
  { key: 'clarity', label: 'sc.col.clarity' },
  { key: 'risk', label: 'sc.col.risk' },
  { key: 'quality', label: 'sc.col.quality' },
];
const CATEGORIES = ['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY'] as const;

/** "Đánh giá các mã": descriptive scorecard of every instrument (GET /api/scorecard). */
export function ScorecardView({ onOpenInstrument }: { onOpenInstrument?: (exchangeSymbol: string) => void } = {}) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<ScorecardListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);
  const [category, setCategory] = useState<string>('ALL');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [openId, setOpenId] = useState<string | null>(null);

  const pick = (instrumentId: string, exchangeSymbol: string) => {
    if (onOpenInstrument) onOpenInstrument(exchangeSymbol);
    else setOpenId(instrumentId);
  };

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scorecard', { signal });
      const body = await safeReadJson<ScorecardListResponse>(res);
      // Empty/malformed payload (e.g. {}): normalise to an empty list, never crash.
      setData({ ...body, scorecards: Array.isArray(body?.scorecards) ? body.scorecards : [], count: body?.count ?? 0 });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(toUserError(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const rows = useMemo(() => {
    const all = (data?.scorecards ?? []).filter((c) => category === 'ALL' || c.category === category);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...all].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // missing data always last
      if (vb === null) return -1;
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), lang) * dir;
      return (va - (vb as number)) * dir;
    });
  }, [data, category, sort, lang]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  const legendDims = useMemo(() => {
    const ids = ['trend', 'momentum', 'volatility', 'cot'] as const;
    return ids.flatMap((id) => {
      const dim = (data?.scorecards ?? []).map((c) => dimOf(c, id)).find((d) => d && d.status === 'OK' && d.explanation);
      return dim ? [{ id, dim }] : [];
    });
  }, [data]);

  const open = data?.scorecards.find((c) => c.instrumentId === openId) ?? null;

  return (
    <div className="space-y-4 max-w-7xl">
      <SectionHeader
        level={1}
        title={t('sc.title')}
        subtitle={t('sc2.intro')}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-10 sm:min-h-0 text-xs rounded-md bg-[var(--accent)] text-white disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('sc.refresh')}
          </button>
        }
      />

      <div role="group" aria-label={t('sc.filter.label')} className="flex flex-wrap gap-2">
        {['ALL', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1 min-h-10 sm:min-h-0 text-xs rounded-full border ${
              category === c ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text-strong)]'
            }`}
          >
            {c === 'ALL' ? t('sc.filter.all') : t(`sc.cat.${c}` as TKey)}
          </button>
        ))}
      </div>


      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer select-none text-[var(--accent-text)]">{t('sc2.explain')}</summary>
        <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
          <p>{t('sc2.subtitleFull')}</p>
          <p className="font-medium text-[var(--text-strong)]">{t('sc2.legend.title')}</p>
          <ul className="space-y-1">
            {legendDims.map(({ id, dim }) => (
              <li key={id}><b className="text-[var(--text)]">{t(`sc.dim.${id}` as TKey)}:</b> {dim.explanation[lang]}</li>
            ))}
          </ul>
          <p>{t('sc2.legend.bar')}</p>
          <p>{t('sc2.legend.quality')}</p>
          <p>{t('sc2.legend.hint')}</p>
        </div>
      </details>

      {error && (
        <Card tone="warning" className="flex flex-wrap items-center justify-between gap-2">
          <ErrorNote error={error} text={t('sc.error', { msg: error.message })} />
          <button type="button" onClick={() => void load()} className="text-xs underline">
            {t('sc.retry')}
          </button>
        </Card>
      )}

      {loading && !data && <SkeletonCards count={8} />}

      {data && rows.length === 0 && <EmptyState title={t('sc.empty')} />}

      {data && rows.length > 0 && (
        <>
        <ul className="sm:hidden space-y-2" aria-label={t('sc.title')}>
          {rows.map((c) => {
            const name = lang === 'vi' && c.vietnameseName ? c.vietnameseName : c.productName;
            const cot = dimOf(c, 'cot');
            const none = <span className="text-xs text-[var(--faint)]">{t('sc.noValue')}</span>;
            const clar = c.overall.trendClarity;
            const risk = c.overall.volatilityRisk;
            const pairs: Array<[string, React.ReactNode]> = [
              [t('sc.col.trend'), <DimBadge dim={dimOf(c, 'trend')} />],
              [t('sc.col.momentum'), <DimBar dim={dimOf(c, 'momentum')} />],
              [t('sc.col.volatility'), <DimBar dim={dimOf(c, 'volatility')} />],
              [t('sc.col.cot'), cot?.status === 'OK' ? <DimBar dim={cot} /> : none],
              [t('sc.col.clarity'), <ScoreBar score={clar.level ? clar.score : null} level={clar.level} label={clar.label[lang]} />],
              [t('sc.col.risk'), <ScoreBar score={risk.level ? risk.score : null} level={risk.level} label={risk.label[lang]} />],
              [t('sc.col.quality'), <QualityDots level={c.dataQuality.level} label={t(`sc.quality.${c.dataQuality.level}` as TKey)} hint={c.dataQuality.historySource ?? undefined} />],
            ];
            return (
              <li key={c.instrumentId}>
                <Card
                  className="cursor-pointer space-y-2 min-h-10"
                  role="button"
                  tabIndex={0}
                  onClick={() => pick(c.instrumentId, c.exchangeSymbol)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick(c.instrumentId, c.exchangeSymbol);
                    }
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 font-medium text-[var(--text-strong)] truncate">{name}</div>
                    <div className="tabular-nums text-[var(--text-strong)] shrink-0">{fmtPrice(c.price.value)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] font-mono text-[var(--faint)]">{c.exchangeSymbol} · {c.instrumentId.split(':')[0]}</span>
                    <DataStatusBadge status={c.price.status as DataQualityStatus} sourceQuality={c.price.sourceQuality ?? undefined} compact />
                  </div>
                  <dl className="grid grid-cols-1 gap-y-2 text-xs">
                    {pairs.map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between gap-2 min-w-0">
                        <dt className="text-[var(--muted)] shrink-0">{label}</dt>
                        <dd className="min-w-0 flex flex-wrap justify-end gap-1">{val}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </li>
            );
          })}
        </ul>
        <Card padded={false} className="overflow-x-auto hidden sm:block">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                {COLS.map((c) => (
                  <th key={c.key} scope="col" title={t(c.label)} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 font-medium">
                    <button type="button" onClick={() => toggleSort(c.key)} title={t('sc.sortBy', { col: t(c.label) })} className="inline-flex items-center gap-1 hover:text-[var(--text-strong)]">
                      {t(c.label)}
                      {sort.key === c.key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium">{t('sc.col.price')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const name = lang === 'vi' && c.vietnameseName ? c.vietnameseName : c.productName;
                const cot = dimOf(c, 'cot');
                return (
                  <tr
                    key={c.instrumentId}
                    tabIndex={0}
                    onClick={() => pick(c.instrumentId, c.exchangeSymbol)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(c.instrumentId, c.exchangeSymbol);
                      }
                    }}
                    className="border-b border-[var(--border)]/60 hover:bg-[var(--surface-2)] cursor-pointer focus:outline-none focus:bg-[var(--surface-2)]"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--text-strong)]">{name}</div>
                      <div className="text-[11px] font-mono text-[var(--faint)]">{c.exchangeSymbol} · {c.instrumentId.split(':')[0]}</div>
                    </td>
                    <td className="px-3 py-2"><DimBadge dim={dimOf(c, 'trend')} /></td>
                    <td className="px-3 py-2"><DimBar dim={dimOf(c, 'momentum')} /></td>
                    <td className="px-3 py-2"><DimBar dim={dimOf(c, 'volatility')} /></td>
                    <td className="px-3 py-2"><DimBar dim={cot} /></td>
                    <td className="px-3 py-2"><ScoreBar score={c.overall.trendClarity.level ? c.overall.trendClarity.score : null} level={c.overall.trendClarity.level} label={c.overall.trendClarity.label[lang]} /></td>
                    <td className="px-3 py-2"><ScoreBar score={c.overall.volatilityRisk.level ? c.overall.volatilityRisk.score : null} level={c.overall.volatilityRisk.level} label={c.overall.volatilityRisk.label[lang]} /></td>
                    <td className="px-3 py-2"><QualityDots level={c.dataQuality.level} label={t(`sc.quality.${c.dataQuality.level}` as TKey)} hint={c.dataQuality.historySource ?? undefined} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="tabular-nums text-[var(--text-strong)]">{fmtPrice(c.price.value)}</div>
                      <DataStatusBadge status={c.price.status as DataQualityStatus} sourceQuality={c.price.sourceQuality ?? undefined} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        </>
      )}

      {data && (
        <p className="text-[11px] text-[var(--faint)]">
          {t('sc.summary', { shown: rows.length, total: data.count, time: fmtDateTime(data.generatedAt) })} · {t('sc2.disclaimer')}
        </p>
      )}

      {open && <ScorecardDrawer card={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
