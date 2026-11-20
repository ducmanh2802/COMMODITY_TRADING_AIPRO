import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { fmtDateTime, useI18n, type TKey } from '../../../i18n';
import type { Scorecard, ScorecardListResponse } from '../../../shared/types/scorecard';
import type { DataQualityStatus } from '../../../shared/types/market';
import { safeReadJson } from '../../../shared/utils/http';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { Badge } from '../../ui/Badge';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { SkeletonCards } from '../../ui/Skeleton';
import { ScorecardDrawer } from './ScorecardDrawer';
import { DimBadge, LEVEL_TONE, dimOf } from './shared';

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
  const [error, setError] = useState<string | null>(null);
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
      setData(await safeReadJson<ScorecardListResponse>(res));
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

  const open = data?.scorecards.find((c) => c.instrumentId === openId) ?? null;

  return (
    <div className="space-y-4 max-w-7xl">
      <SectionHeader
        level={1}
        title={t('sc.title')}
        subtitle={t('sc.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] text-white disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('sc.refresh')}
          </button>
        }
      />

      <Card tone="warning" className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">{t('sc.disclaimer')}</strong> <span className="text-[var(--warning)]/80">{t('sc.disclaimerDetail')}</span>
        </span>
      </Card>

      <div role="group" aria-label={t('sc.filter.label')} className="flex flex-wrap gap-2">
        {['ALL', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1 text-xs rounded-full border ${
              category === c ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {c === 'ALL' ? t('sc.filter.all') : t(`sc.cat.${c}` as TKey)}
          </button>
        ))}
      </div>

      {error && (
        <Card tone="warning" className="flex flex-wrap items-center justify-between gap-2">
          <span>{t('sc.error', { msg: error })}</span>
          <button type="button" onClick={() => void load()} className="text-xs underline">
            {t('sc.retry')}
          </button>
        </Card>
      )}

      {loading && !data && <SkeletonCards count={8} />}

      {data && rows.length === 0 && <EmptyState title={t('sc.empty')} />}

      {data && rows.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                {COLS.map((c) => (
                  <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 font-medium">
                    <button type="button" onClick={() => toggleSort(c.key)} title={t('sc.sortBy', { col: t(c.label) })} className="inline-flex items-center gap-1 hover:text-white">
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
                    <td className="px-3 py-2"><DimBadge dim={dimOf(c, 'momentum')} /></td>
                    <td className="px-3 py-2"><DimBadge dim={dimOf(c, 'volatility')} /></td>
                    <td className="px-3 py-2">{cot?.status === 'OK' ? <DimBadge dim={cot} /> : <span className="text-xs text-[var(--faint)]">{t('sc.noValue')}</span>}</td>
                    <td className="px-3 py-2">
                      {c.overall.trendClarity.level ? <Badge tone={LEVEL_TONE[c.overall.trendClarity.level]}>{c.overall.trendClarity.label[lang]} · {c.overall.trendClarity.score}</Badge> : <span className="text-xs text-[var(--faint)]">{t('sc.noValue')}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {c.overall.volatilityRisk.level ? <Badge tone={LEVEL_TONE[c.overall.volatilityRisk.level]}>{c.overall.volatilityRisk.label[lang]} · {c.overall.volatilityRisk.score}</Badge> : <span className="text-xs text-[var(--faint)]">{t('sc.noValue')}</span>}
                    </td>
                    <td className="px-3 py-2"><Badge tone={LEVEL_TONE[c.dataQuality.level]} title={c.dataQuality.historySource ?? undefined}>{t(`sc.quality.${c.dataQuality.level}` as TKey)}</Badge></td>
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
      )}

      {data && (
        <p className="text-[11px] text-[var(--faint)]">
          {t('sc.summary', { shown: rows.length, total: data.count, time: fmtDateTime(data.generatedAt) })}
        </p>
      )}

      {open && <ScorecardDrawer card={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
