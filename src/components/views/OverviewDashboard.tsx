import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Database, Lightbulb, RefreshCw, Upload } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { InstrumentDefinition, ProductCategory } from '../../shared/types/instrument';
import type { MarketQuote } from '../../shared/types/market';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { Term } from '../common/Term';
import { fmtFixed, fmtNum, hasKey, useT } from '../../i18n';
import { fmtClock, fmtPrice, hasPrice, plainUnit } from '../common/quoteFormat';

interface OverviewTechSummary {
  status: string;
  mainTrend: string;
  marketRegime: string;
  atr14: number | null;
  rsi14: number | null;
}

const CATEGORY_ORDER: ProductCategory[] = ['AGRICULTURE', 'SOFT_COMMODITIES', 'METALS', 'ENERGY'];
function PriceCard({
  inst,
  quote,
  onOpen,
}: {
  inst: InstrumentDefinition;
  quote: MarketQuote | undefined;
  onOpen: () => void;
}) {
  const t = useT();
  const name = inst.commodityProfile?.vietnameseName ?? inst.productName;
  const priced = hasPrice(quote);
  const clock = priced ? fmtClock(quote.timestamp) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('fr.ov.openChart', { name })}
      className="text-left bg-[#111622] hover:bg-[#151C2B] border border-[#263244] hover:border-[#6366F1]/60 rounded-xl p-4 flex flex-col gap-2 transition-colors min-w-0"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{name}</p>
          <p className="text-[11px] text-[#E5E7EB]/45 mt-0.5">
            {inst.exchange} · {inst.exchangeSymbol}
          </p>
        </div>
      </div>
      {priced ? (
        <div>
          <p className="text-2xl font-semibold text-white tabular-nums leading-tight">
            {fmtPrice(quote.price)}
          </p>
          <p className="text-xs text-[#E5E7EB]/60 mt-0.5">{plainUnit(t, quote)}</p>
        </div>
      ) : (
        <div>
          <p className="text-2xl font-semibold text-[#E5E7EB]/30 leading-tight">—</p>
          <p className="text-xs text-[#E5E7EB]/50 mt-0.5">{t('fr.ov.noPrice')}</p>
        </div>
      )}
      <div className="mt-auto pt-2 border-t border-[#263244]/70 flex flex-col gap-1">
        <DataStatusBadge
          status={quote?.status ?? 'UNAVAILABLE'}
          compact
          sourceQuality={quote?.sourceQuality}
          delayMinutes={quote?.delayMinutes}
        />
        {priced && (
          <p className="text-[11px] text-[#E5E7EB]/50">
            {clock ? t('fr.updatedAt', { time: clock }) : t('fr.noTime')}
          </p>
        )}
      </div>
    </button>
  );
}

export function OverviewDashboard() {
  const {
    instruments,
    quotesBySymbol,
    providers,
    datasets,
    marketScope,
    timeframe,
    selectedSymbol,
    health,
    searchQuery,
    setActiveModule,
    openInstrumentIn,
    syncProviderFeeds,
    syncing,
    loading,
    loadError,
  } = useTerminal();

  const t = useT();
  const [techSummary, setTechSummary] = useState<OverviewTechSummary | null>(null);
  const [macroCount, setMacroCount] = useState(0);
  const [newsCount, setNewsCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadSecondary() {
      try {
        const [techRes, fundRes] = await Promise.all([
          fetch(`/api/technical/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`),
          fetch('/api/fundamental/records'),
        ]);
        if (cancelled) return;
        if (techRes.ok) {
          const tj = await techRes.json();
          const snap = tj.snapshot;
          setTechSummary({
            status: snap?.status ?? 'UNAVAILABLE',
            mainTrend: snap?.marketStructure?.mainTrend ?? 'UNCERTAIN',
            marketRegime: snap?.marketStructure?.marketRegime ?? 'INSUFFICIENT_DATA',
            atr14: snap?.atr14 ?? null,
            rsi14: snap?.rsi14 ?? null,
          });
        }
        if (fundRes.ok) {
          const fj = await fundRes.json();
          setMacroCount(Array.isArray(fj.records) ? fj.records.length : 0);
          setNewsCount(Array.isArray(fj.news) ? fj.news.length : 0);
        }
      } catch {
        // Ignore transient background fetch error on overview summary
      }
    }
    void loadSecondary();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  const filteredInstruments = useMemo(
    () =>
      instruments.filter((inst) => {
        if (marketScope === 'MXV' && !inst.isMvxListed) return false;
        if (marketScope === 'INTERNATIONAL' && inst.exchange === 'MXV') return false;
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          return (
            inst.productName.toLowerCase().includes(q) ||
            (inst.commodityProfile?.vietnameseName.toLowerCase().includes(q) ?? false) ||
            inst.exchangeSymbol.toLowerCase().includes(q) ||
            (inst.mxvMapping?.mxvSymbol?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      }),
    [instruments, marketScope, searchQuery]
  );

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => ({
        cat,
        items: filteredInstruments.filter((i) => i.category === cat),
      })).filter((g) => g.items.length > 0),
    [filteredInstruments]
  );

  const activeInstrument =
    instruments.find((i) => i.exchangeSymbol === selectedSymbol) ?? filteredInstruments[0] ?? null;
  const activeName = activeInstrument?.commodityProfile?.vietnameseName ?? selectedSymbol;

  const pricedCount = filteredInstruments.filter((i) => hasPrice(quotesBySymbol[i.exchangeSymbol])).length;
  const anyPriceAtAll = Object.values(quotesBySymbol).some((q) => hasPrice(q));
  const connectedProviderCount = providers.filter((p) => p.connectionState === 'CONNECTED').length;
  const overallStatus = health?.capabilities.marketDataOverallStatus ?? 'UNAVAILABLE';

  const trendLabel = (v: string) => {
    const k = `fr.ov.trend.${v}`;
    return hasKey(k) ? t(k) : v;
  };
  const regimeLabel = (v: string) => {
    const k = `fr.ov.regime.${v}`;
    return hasKey(k) ? t(k) : v;
  };

  const linkBtn = 'text-xs font-medium text-[#818CF8] hover:text-[#A5B4FC] hover:underline whitespace-nowrap';
  const card = 'bg-[#111622] border border-[#263244] rounded-xl p-4';

  return (
    <div className="space-y-6">
      {/* Friendly header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">{t('fr.ov.hello')}</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">{t('fr.ov.sub')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DataStatusBadge status={overallStatus} />
          <button
            type="button"
            onClick={() => void syncProviderFeeds({ timeframe })}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{syncing ? t('fr.ov.refreshing') : t('fr.ov.refresh')}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-xl p-4 text-sm text-[#FCA5A5] space-y-1">
          <p>{t('fr.ov.loadError')}</p>
          <details className="text-xs text-[#E5E7EB]/50">
            <summary className="cursor-pointer">{t('fr.ov.loadErrorDetail')}</summary>
            <p className="mt-1 break-words">{loadError}</p>
          </details>
        </div>
      )}

      {/* Compact status line: prices + data sources (details live in Data Health) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#E5E7EB]/70">
        {!loading && (
          <span>{t('fr.ov.pricesCount', { n: pricedCount, total: filteredInstruments.length })}</span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Database className="w-3.5 h-3.5 text-[#E5E7EB]/45" aria-hidden="true" />
          {t('fr.ov.sources', { n: connectedProviderCount, total: providers.length })}
          <button type="button" onClick={() => setActiveModule('data-health')} className={`${linkBtn} inline-flex items-center gap-1`}>
            {t('fr.ov.sourcesLink')}
            <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </span>
        <button type="button" onClick={() => setActiveModule('markets')} className={`${linkBtn} sm:ml-auto`}>
          {t('fr.ov.allMarkets')} →
        </button>
      </div>

      {/* Gentle empty state: only when there are no prices at all */}
      {!loading && !anyPriceAtAll && (
        <section className={`${card} border-[#6366F1]/40 space-y-3`}>
          <h2 className="text-base font-semibold text-white">{t('fr.ov.empty.title')}</h2>
          <p className="text-sm text-[#E5E7EB]/75 leading-relaxed">{t('fr.ov.empty.body')}</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-[#E5E7EB]/75">
            <li>{t('fr.ov.empty.step1')}</li>
            <li>{t('fr.ov.empty.step2')}</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveModule('data-import')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 rounded-md text-xs font-medium text-white"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {t('fr.ov.empty.import')}
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('data-health')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#1E293B] border border-[#263244] rounded-md text-xs font-medium text-[#E5E7EB]"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              {t('fr.ov.empty.health')}
            </button>
          </div>
        </section>
      )}

      {/* Price cards grouped by category */}
      {loading ? (
        <p className="text-sm text-[#E5E7EB]/55">{t('fr.ov.loading')}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-[#E5E7EB]/55">{t('fr.ov.noMatch')}</p>
      ) : (
        groups.map((g) => (
          <section key={g.cat} aria-label={t(`dash.cat.${g.cat}`)} className="space-y-3">
            <h2 className="text-sm font-semibold text-[#E5E7EB]/85">{t(`dash.cat.${g.cat}`)}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {g.items.map((inst) => (
                <PriceCard
                  key={inst.id}
                  inst={inst}
                  quote={quotesBySymbol[inst.exchangeSymbol]}
                  onOpen={() => openInstrumentIn(inst.exchangeSymbol, 'charts')}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Beginner tips */}
      <section className={`${card} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[#FBBF24]" aria-hidden="true" />
            {t('fr.ov.tipsTitle')}
          </h2>
          <button type="button" onClick={() => setActiveModule('learn')} className={linkBtn}>
            {t('fr.ov.learnMore')} →
          </button>
        </div>
        <ul className="space-y-1.5 text-sm text-[#E5E7EB]/80 leading-relaxed list-disc pl-5">
          <li>
            {t('fr.ov.tip1a')} <Term k="futures" /> {t('fr.ov.tip1b')}
          </li>
          <li>
            {t('fr.ov.tip2a')} <Term k="margin" /> {t('fr.ov.tip2b')} <Term k="stopLoss" /> {t('fr.ov.tip2c')}
          </li>
          <li>
            {t('fr.ov.tip3a')} <Term k="frontMonth">{t('fr.ov.tip3term')}</Term>
            {t('fr.ov.tip3b')}
          </li>
        </ul>
      </section>

      {/* Selected commodity brief */}
      {activeInstrument?.commodityProfile && (
        <section aria-label={t('dash.ov.briefAria')} className={`${card} space-y-3`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#263244] pb-2.5">
            <div className="min-w-0">
              <p className="text-[11px] text-[#E5E7EB]/50">{t('fr.ov.selected')}</p>
              <h2 className="text-sm font-semibold text-white">
                {activeInstrument.commodityProfile.vietnameseName}{' '}
                <span className="font-normal text-[#E5E7EB]/50">
                  ({activeInstrument.exchange} · {activeInstrument.exchangeSymbol}
                  {activeInstrument.mxvMapping?.mxvSymbol ? ` · MXV ${activeInstrument.mxvMapping.mxvSymbol}` : ''})
                </span>
              </h2>
              <p className="text-xs text-[#E5E7EB]/60 mt-0.5 break-words">
                {t('dash.ov.sessionIct', { sessions: activeInstrument.commodityProfile.vietnamTradingSessionsIct })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openInstrumentIn(activeInstrument.exchangeSymbol, 'explorer')}
              className={`${linkBtn} self-start sm:self-center`}
            >
              {t('dash.ov.viewContract')}
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.vnRelevance')}</p>
              <p className="text-[#E5E7EB]/85 leading-relaxed">{activeInstrument.commodityProfile.vietnamMarketRelevance}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.drivers')}</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[#E5E7EB]/85">
                {activeInstrument.commodityProfile.fundamentalDrivers.slice(0, 3).map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1">
              <p className="text-[#E5E7EB]/55 font-medium">{t('dash.ov.seasonal')}</p>
              <p className="text-[#E5E7EB]/85 leading-relaxed">{activeInstrument.commodityProfile.seasonalPattern}</p>
              <p className="text-[#FBBF24]/90 leading-relaxed">{activeInstrument.commodityProfile.fxSensitivity}</p>
            </div>
          </div>
        </section>
      )}

      {/* Secondary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {(() => {
                // '{term}' is left unreplaced on purpose so the glossary tooltip can be inserted there.
                const [before, after] = t('fr.ov.trendTitle', { name: activeName }).split('{term}');
                return (
                  <>
                    {before}
                    <Term k="volatility">{t('gl.volatility').toLowerCase()}</Term>
                    {after}
                  </>
                );
              })()}
            </h2>
            <button type="button" onClick={() => setActiveModule('technical')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          {techSummary && techSummary.status !== 'UNAVAILABLE' ? (
            <div className="text-xs text-[#E5E7EB]/80 space-y-1 tabular-nums">
              <DataStatusBadge status={techSummary.status as 'HISTORICAL'} compact />
              <p>
                {t('fr.ov.trendLine', {
                  trend: trendLabel(techSummary.mainTrend),
                  regime: regimeLabel(techSummary.marketRegime),
                })}
              </p>
              <p>
                <Term k="rsi" /> (14): {techSummary.rsi14 !== null ? fmtFixed(techSummary.rsi14, 1) : t('common.na')}
              </p>
              <p>
                <Term k="atr" />: {techSummary.atr14 !== null ? fmtNum(techSummary.atr14, { maximumFractionDigits: 4 }) : t('common.na')}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">{t('fr.ov.trendNeed', { name: activeName })}</p>
          )}
        </section>

        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">{t('fr.ov.oppTitle')}</h2>
            <button type="button" onClick={() => setActiveModule('scanner')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            {datasets.length === 0 ? t('fr.ov.oppNone') : t('fr.ov.oppReady', { n: datasets.length })}
          </p>
        </section>

        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">{t('dash.ov.aiTitle')}</h2>
            <button type="button" onClick={() => setActiveModule('ai-analyst')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">{t('fr.ov.aiDesc')}</p>
        </section>

        <section className={`${card} space-y-2`}>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">{t('dash.ov.calTitle')}</h2>
            <button type="button" onClick={() => setActiveModule('news')} className={linkBtn}>
              {t('fr.ov.open')}
            </button>
          </div>
          <p className="text-xs text-[#E5E7EB]/65 leading-relaxed">
            {macroCount + newsCount > 0 ? t('dash.ov.calHas', { macro: macroCount, news: newsCount }) : t('fr.ov.calDesc')}
          </p>
        </section>
      </div>
    </div>
  );
}
