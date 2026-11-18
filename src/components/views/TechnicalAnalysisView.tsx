import { useEffect, useState } from 'react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { DataQualityStatus } from '../../shared/types/market';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { fmtFixed, tr, useT } from '../../i18n';

interface TechnicalSnapshotPayload {
  symbol: string;
  exchange: string;
  timeframe: string;
  status: DataQualityStatus;
  reason?: string;
  candleCount: number;
  completeCandleCount: number;
  hasIncompleteTrailingCandle: boolean;
  lastTimestamp: string | null;
  lastClose: number | null;
  ema: {
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    ema100: number | null;
    ema200: number | null;
  };
  sma: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  };
  rsi14: number | null;
  macd: { macd: number | null; signal: number | null; histogram: number | null };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    bandwidthPct: number | null;
  };
  atr14: number | null;
  atrPct: number | null;
  adx14: { adx: number | null; plusDI: number | null; minusDI: number | null };
  vwap: number | null;
  pivots: {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  } | null;
  fibonacci: {
    swingHigh: number;
    swingLow: number;
    trend: 'UP' | 'DOWN';
    levels: Record<string, number>;
  } | null;
  marketStructure: {
    mainTrend: string;
    shortTermTrend: string;
    momentum: string;
    volatility: string;
    marketRegime: string;
    structurePattern: string;
    confirmedSwings: Array<{ index: number; timestamp: string; price: number; type: string }>;
    unconfirmedSwings: Array<{ index: number; timestamp: string; price: number; type: string }>;
    supportZones: number[];
    resistanceZones: number[];
    bullishInvalidationLevel: number | null;
    bearishInvalidationLevel: number | null;
  };
}

function fmt(val: number | null | undefined, digits = 4): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return tr('ta.insufficientBars');
  return fmtFixed(val, digits);
}

export function TechnicalAnalysisView() {
  const { selectedSymbol, timeframe, datasets, setActiveModule } = useTerminal();
  const t = useT();
  const [snapshot, setSnapshot] = useState<TechnicalSnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/technical/${encodeURIComponent(selectedSymbol)}?timeframe=${timeframe}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? t('ta.err.engine'));
        if (!cancelled) setSnapshot(json.snapshot);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('ta.err.load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, datasets.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {t('ta.title', { symbol: selectedSymbol, tf: timeframe })}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            {t('ta.subtitle')}
          </p>
        </div>
        <DataStatusBadge status={snapshot?.status ?? 'UNAVAILABLE'} />
      </div>

      <InstrumentToolbar />

      {error && (
        <div className="bg-[#111622] border border-[#EF4444]/40 rounded-lg p-4 text-xs font-mono text-[#EF4444]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center text-xs font-mono text-[#E5E7EB]/60">
          {t('ta.computing')}
        </div>
      ) : !snapshot || snapshot.status === 'UNAVAILABLE' || snapshot.status === 'INVALID' ? (
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center space-y-3">
          <DataStatusBadge status={snapshot?.status ?? 'UNAVAILABLE'} />
          <p className="text-sm font-mono text-white">
            {snapshot?.reason ?? t('chart.owner.noVerified')}
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3.5 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md"
          >
            {t('ta.importInCharts')}
          </button>
        </div>
      ) : (
        <>
          {/* Regime & Structure Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[#E5E7EB]/55">{t('ta.mainShortTrend')}</p>
              <p className="font-mono text-base font-semibold text-white">
                {snapshot.marketStructure.mainTrend} / {snapshot.marketStructure.shortTermTrend}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                {t('ta.pattern')}: {snapshot.marketStructure.structurePattern}
              </p>
            </div>

            <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[#E5E7EB]/55">{t('ta.regimeVol')}</p>
              <p className="font-mono text-base font-semibold text-white">
                {snapshot.marketStructure.marketRegime}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                {t('ta.vol')}: {snapshot.marketStructure.volatility} · ATR%: {fmt(snapshot.atrPct, 2)}%
              </p>
            </div>

            <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[#E5E7EB]/55">{t('ta.lastClose')}</p>
              <p className="font-mono text-base font-semibold text-white tabular-nums">
                {fmt(snapshot.lastClose, 4)}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                {snapshot.lastTimestamp
                  ? formatTimestampInZone(snapshot.lastTimestamp, 'Asia/Ho_Chi_Minh')
                  : t('common.na')}
              </p>
            </div>

            <div className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[#E5E7EB]/55">{t('ta.closedBars')}</p>
              <p className="font-mono text-base font-semibold text-white tabular-nums">
                {snapshot.completeCandleCount} / {snapshot.candleCount}
              </p>
              <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                {snapshot.hasIncompleteTrailingCandle
                  ? t('ta.incompleteExcluded')
                  : t('ta.allComplete')}
              </p>
            </div>
          </section>

          {/* Moving Averages + Momentum/Volatility */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                {t('ta.maVwap')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div>EMA 9: <span className="text-white">{fmt(snapshot.ema.ema9)}</span></div>
                <div>SMA 20: <span className="text-white">{fmt(snapshot.sma.sma20)}</span></div>
                <div>EMA 20: <span className="text-white">{fmt(snapshot.ema.ema20)}</span></div>
                <div>SMA 50: <span className="text-white">{fmt(snapshot.sma.sma50)}</span></div>
                <div>EMA 50: <span className="text-white">{fmt(snapshot.ema.ema50)}</span></div>
                <div>SMA 200: <span className="text-white">{fmt(snapshot.sma.sma200)}</span></div>
                <div>EMA 100: <span className="text-white">{fmt(snapshot.ema.ema100)}</span></div>
                <div>VWAP: <span className="text-white">{fmt(snapshot.vwap)}</span></div>
                <div>EMA 200: <span className="text-white">{fmt(snapshot.ema.ema200)}</span></div>
              </div>
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white border-b border-[#263244] pb-2">
                {t('ta.oscillators')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div>RSI (14): <span className="text-white">{fmt(snapshot.rsi14, 2)}</span></div>
                <div>ATR (14): <span className="text-white">{fmt(snapshot.atr14, 4)}</span></div>
                <div>MACD Line: <span className="text-white">{fmt(snapshot.macd.macd, 4)}</span></div>
                <div>ADX (14): <span className="text-white">{fmt(snapshot.adx14.adx, 2)}</span></div>
                <div>MACD Signal: <span className="text-white">{fmt(snapshot.macd.signal, 4)}</span></div>
                <div>+DI / -DI: <span className="text-white">{fmt(snapshot.adx14.plusDI, 1)} / {fmt(snapshot.adx14.minusDI, 1)}</span></div>
                <div>MACD Hist: <span className="text-white">{fmt(snapshot.macd.histogram, 4)}</span></div>
                <div>BB Width%: <span className="text-white">{fmt(snapshot.bollinger.bandwidthPct, 2)}%</span></div>
                <div className="col-span-2">
                  Bollinger (20,2): <span className="text-white">{fmt(snapshot.bollinger.lower)} / {fmt(snapshot.bollinger.middle)} / {fmt(snapshot.bollinger.upper)}</span>
                </div>
              </div>
            </section>
          </div>

          {/* Pivots, Fibonacci, S/R & Invalidation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs font-mono tabular-nums">
              <h2 className="text-sm font-sans font-semibold text-white border-b border-[#263244] pb-2">
                {t('ta.pivots')}
              </h2>
              {snapshot.pivots ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[#EF4444]"><span>R3</span><span>{fmtFixed(snapshot.pivots.r3, 4)}</span></div>
                  <div className="flex justify-between text-[#EF4444]"><span>R2</span><span>{fmtFixed(snapshot.pivots.r2, 4)}</span></div>
                  <div className="flex justify-between text-[#EF4444]"><span>R1</span><span>{fmtFixed(snapshot.pivots.r1, 4)}</span></div>
                  <div className="flex justify-between text-white border-y border-[#263244] py-1"><span>PIVOT</span><span>{fmtFixed(snapshot.pivots.pivot, 4)}</span></div>
                  <div className="flex justify-between text-[#22C55E]"><span>S1</span><span>{fmtFixed(snapshot.pivots.s1, 4)}</span></div>
                  <div className="flex justify-between text-[#22C55E]"><span>S2</span><span>{fmtFixed(snapshot.pivots.s2, 4)}</span></div>
                  <div className="flex justify-between text-[#22C55E]"><span>S3</span><span>{fmtFixed(snapshot.pivots.s3, 4)}</span></div>
                </div>
              ) : (
                <p className="text-[#E5E7EB]/55">{t('ta.noPivots')}</p>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-2 text-xs font-mono tabular-nums">
              <h2 className="text-sm font-sans font-semibold text-white border-b border-[#263244] pb-2">
                {t('ta.fib')}
              </h2>
              {snapshot.fibonacci ? (
                <div className="space-y-1.5">
                  <p className="text-[#E5E7EB]/60">
                    {t('ta.trend')}: {snapshot.fibonacci.trend} ({fmtFixed(snapshot.fibonacci.swingLow, 2)} – {fmtFixed(snapshot.fibonacci.swingHigh, 2)})
                  </p>
                  {Object.entries(snapshot.fibonacci.levels).map(([lvl, price]) => (
                    <div key={lvl} className="flex justify-between text-[#E5E7EB]">
                      <span>{lvl}</span>
                      <span>{fmtFixed(price, 4)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#E5E7EB]/55">{t('ta.noSwing')}</p>
              )}
            </section>

            <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3 text-xs font-mono">
              <h2 className="text-sm font-sans font-semibold text-white border-b border-[#263244] pb-2">
                {t('ta.srTitle')}
              </h2>
              <div>
                <p className="text-[#E5E7EB]/55 mb-1">{t('ta.resZones')}</p>
                <p className="text-[#EF4444]">
                  {snapshot.marketStructure.resistanceZones.length > 0
                    ? snapshot.marketStructure.resistanceZones.map((z) => fmtFixed(z, 4)).join('; ')
                    : t('common.none')}
                </p>
              </div>
              <div>
                <p className="text-[#E5E7EB]/55 mb-1">{t('ta.supZones')}</p>
                <p className="text-[#22C55E]">
                  {snapshot.marketStructure.supportZones.length > 0
                    ? snapshot.marketStructure.supportZones.map((z) => fmtFixed(z, 4)).join('; ')
                    : t('common.none')}
                </p>
              </div>
              <div className="pt-2 border-t border-[#263244] space-y-1">
                <p>{t('ta.bullInval')}: {fmt(snapshot.marketStructure.bullishInvalidationLevel)}</p>
                <p>{t('ta.bearInval')}: {fmt(snapshot.marketStructure.bearishInvalidationLevel)}</p>
                <p className="text-[#E5E7EB]/55">
                  {t('ta.confirmedSwings')}: {snapshot.marketStructure.confirmedSwings.length} · {t('ta.unconfirmed')}:{' '}
                  {snapshot.marketStructure.unconfirmedSwings.length}
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
