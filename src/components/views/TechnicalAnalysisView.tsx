import { toUserError, type UserError } from '../common/friendlyError';
import { useEffect, useState } from 'react';
import { ObvReadout } from './instrument/ObvLine';
import type { ObvSummary } from '../../shared/types/cycle';
import { useTerminal } from '../../contexts/TerminalContext';
import type { DataQualityStatus, MarketCandle } from '../../shared/types/market';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';
import { InstrumentToolbar } from '../common/InstrumentToolbar';
import { SessionHistoryTable } from '../common/SessionHistoryTable';
import { fmtFixed, tr, useT } from '../../i18n';
import { ErrorNote } from '../common/ErrorNote';

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
  obv?: ObvSummary | null;
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
  const { instruments, selectedSymbol, timeframe, datasets, setActiveModule } = useTerminal();
  const t = useT();
  const [snapshot, setSnapshot] = useState<TechnicalSnapshotPayload | null>(null);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);

  const selectedInst = instruments.find(
    (i) => i.exchangeSymbol.toUpperCase() === selectedSymbol.toUpperCase() || i.id === selectedSymbol
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const sym = encodeURIComponent(selectedSymbol);
        const [techRes, candlesRes] = await Promise.all([
          fetch(`/api/technical/${sym}?timeframe=${timeframe}`),
          fetch(`/api/market/candles/${sym}?timeframe=${timeframe}`).catch(() => null),
        ]);
        const json = await techRes.json();
        if (!techRes.ok) throw new Error(json.message ?? t('ta.err.engine'));
        let nextCandles: MarketCandle[] = [];
        if (candlesRes && candlesRes.ok) {
          const cJson = await candlesRes.json();
          if (Array.isArray(cJson?.candles)) nextCandles = cJson.candles;
        }
        if (!cancelled) {
          setSnapshot(json.snapshot);
          setCandles(nextCandles);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toUserError(err, t('ta.err.load')));
          setCandles([]);
        }
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
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">
            {t('ta.title', { symbol: selectedSymbol, tf: timeframe })}
          </h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('ta.subtitle')}
          </p>
        </div>
        <DataStatusBadge status={snapshot?.status ?? 'UNAVAILABLE'} />
      </div>

      <InstrumentToolbar />

      {error && (
        <div className="bg-[var(--surface)] border border-[var(--negative)]/40 rounded-lg p-4 text-xs font-mono text-[var(--negative)]">
          <ErrorNote error={error} />
        </div>
      )}

      {loading ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center text-xs font-mono text-[var(--text)]/60">
          {t('ta.computing')}
        </div>
      ) : !snapshot || snapshot.status === 'UNAVAILABLE' || snapshot.status === 'INVALID' ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center space-y-3">
          <DataStatusBadge status={snapshot?.status ?? 'UNAVAILABLE'} />
          <p className="text-sm font-mono text-[var(--text-strong)]">
            {snapshot?.reason ?? t('chart.owner.noVerified')}
          </p>
          <button
            type="button"
            onClick={() => setActiveModule('charts')}
            className="px-3.5 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md"
          >
            {t('ta.importInCharts')}
          </button>
        </div>
      ) : (
        <>
          {/* Regime & Structure Strip */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[var(--text)]/55">{t('ta.mainShortTrend')}</p>
              <p className="font-mono text-base font-semibold text-[var(--text-strong)]">
                {snapshot.marketStructure.mainTrend} / {snapshot.marketStructure.shortTermTrend}
              </p>
              <p className="text-[11px] font-mono text-[var(--text)]/50">
                {t('ta.pattern')}: {snapshot.marketStructure.structurePattern}
              </p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[var(--text)]/55">{t('ta.regimeVol')}</p>
              <p className="font-mono text-base font-semibold text-[var(--text-strong)]">
                {snapshot.marketStructure.marketRegime}
              </p>
              <p className="text-[11px] font-mono text-[var(--text)]/50">
                {t('ta.vol')}: {snapshot.marketStructure.volatility} · ATR%: {fmt(snapshot.atrPct, 2)}%
              </p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[var(--text)]/55">{t('ta.lastClose')}</p>
              <p className="font-mono text-base font-semibold text-[var(--text-strong)] tabular-nums">
                {fmt(snapshot.lastClose, 4)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text)]/50">
                {snapshot.lastTimestamp
                  ? formatTimestampInZone(snapshot.lastTimestamp, 'Asia/Ho_Chi_Minh')
                  : t('common.na')}
              </p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-1">
              <p className="text-xs text-[var(--text)]/55">{t('ta.closedBars')}</p>
              <p className="font-mono text-base font-semibold text-[var(--text-strong)] tabular-nums">
                {snapshot.completeCandleCount} / {snapshot.candleCount}
              </p>
              <p className="text-[11px] font-mono text-[var(--text)]/50">
                {snapshot.hasIncompleteTrailingCandle
                  ? t('ta.incompleteExcluded')
                  : t('ta.allComplete')}
              </p>
            </div>
          </section>

          {/* Moving Averages + Momentum/Volatility */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
                {t('ta.maVwap')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div>EMA 9: <span className="text-[var(--text-strong)]">{fmt(snapshot.ema.ema9)}</span></div>
                <div>SMA 20: <span className="text-[var(--text-strong)]">{fmt(snapshot.sma.sma20)}</span></div>
                <div>EMA 20: <span className="text-[var(--text-strong)]">{fmt(snapshot.ema.ema20)}</span></div>
                <div>SMA 50: <span className="text-[var(--text-strong)]">{fmt(snapshot.sma.sma50)}</span></div>
                <div>EMA 50: <span className="text-[var(--text-strong)]">{fmt(snapshot.ema.ema50)}</span></div>
                <div>SMA 200: <span className="text-[var(--text-strong)]">{fmt(snapshot.sma.sma200)}</span></div>
                <div>EMA 100: <span className="text-[var(--text-strong)]">{fmt(snapshot.ema.ema100)}</span></div>
                <div>VWAP: <span className="text-[var(--text-strong)]">{fmt(snapshot.vwap)}</span></div>
                <div>EMA 200: <span className="text-[var(--text-strong)]">{fmt(snapshot.ema.ema200)}</span></div>
              </div>
            </section>

            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
                {t('ta.oscillators')}
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div>RSI (14): <span className="text-[var(--text-strong)]">{fmt(snapshot.rsi14, 2)}</span></div>
                <div>ATR (14): <span className="text-[var(--text-strong)]">{fmt(snapshot.atr14, 4)}</span></div>
                <div>MACD Line: <span className="text-[var(--text-strong)]">{fmt(snapshot.macd.macd, 4)}</span></div>
                <div>ADX (14): <span className="text-[var(--text-strong)]">{fmt(snapshot.adx14.adx, 2)}</span></div>
                <div>MACD Signal: <span className="text-[var(--text-strong)]">{fmt(snapshot.macd.signal, 4)}</span></div>
                <div>+DI / -DI: <span className="text-[var(--text-strong)]">{fmt(snapshot.adx14.plusDI, 1)} / {fmt(snapshot.adx14.minusDI, 1)}</span></div>
                <div>MACD Hist: <span className="text-[var(--text-strong)]">{fmt(snapshot.macd.histogram, 4)}</span></div>
                <div>BB Width%: <span className="text-[var(--text-strong)]">{fmt(snapshot.bollinger.bandwidthPct, 2)}%</span></div>
                <div className="col-span-2">
                  Bollinger (20,2): <span className="text-[var(--text-strong)]">{fmt(snapshot.bollinger.lower)} / {fmt(snapshot.bollinger.middle)} / {fmt(snapshot.bollinger.upper)}</span>
                </div>
              </div>
            </section>
          </div>

          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
              {t('obv.title')}
            </h2>
            <ObvReadout obv={snapshot.obv} />
          </section>

          {/* Pivots, Fibonacci, S/R & Invalidation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2 text-xs font-mono tabular-nums">
              <h2 className="text-sm font-sans font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
                {t('ta.pivots')}
              </h2>
              {snapshot.pivots ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[var(--negative)]"><span>R3</span><span>{fmtFixed(snapshot.pivots.r3, 4)}</span></div>
                  <div className="flex justify-between text-[var(--negative)]"><span>R2</span><span>{fmtFixed(snapshot.pivots.r2, 4)}</span></div>
                  <div className="flex justify-between text-[var(--negative)]"><span>R1</span><span>{fmtFixed(snapshot.pivots.r1, 4)}</span></div>
                  <div className="flex justify-between text-[var(--text-strong)] border-y border-[var(--border)] py-1"><span>PIVOT</span><span>{fmtFixed(snapshot.pivots.pivot, 4)}</span></div>
                  <div className="flex justify-between text-[var(--positive)]"><span>S1</span><span>{fmtFixed(snapshot.pivots.s1, 4)}</span></div>
                  <div className="flex justify-between text-[var(--positive)]"><span>S2</span><span>{fmtFixed(snapshot.pivots.s2, 4)}</span></div>
                  <div className="flex justify-between text-[var(--positive)]"><span>S3</span><span>{fmtFixed(snapshot.pivots.s3, 4)}</span></div>
                </div>
              ) : (
                <p className="text-[var(--text)]/55">{t('ta.noPivots')}</p>
              )}
            </section>

            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-2 text-xs font-mono tabular-nums">
              <h2 className="text-sm font-sans font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
                {t('ta.fib')}
              </h2>
              {snapshot.fibonacci ? (
                <div className="space-y-1.5">
                  <p className="text-[var(--text)]/60">
                    {t('ta.trend')}: {snapshot.fibonacci.trend} ({fmtFixed(snapshot.fibonacci.swingLow, 2)} – {fmtFixed(snapshot.fibonacci.swingHigh, 2)})
                  </p>
                  {Object.entries(snapshot.fibonacci.levels).map(([lvl, price]) => (
                    <div key={lvl} className="flex justify-between text-[var(--text)]">
                      <span>{lvl}</span>
                      <span>{fmtFixed(price, 4)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--text)]/55">{t('ta.noSwing')}</p>
              )}
            </section>

            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3 text-xs font-mono">
              <h2 className="text-sm font-sans font-semibold text-[var(--text-strong)] border-b border-[var(--border)] pb-2">
                {t('ta.srTitle')}
              </h2>
              <div>
                <p className="text-[var(--text)]/55 mb-1">{t('ta.resZones')}</p>
                <p className="text-[var(--negative)]">
                  {snapshot.marketStructure.resistanceZones.length > 0
                    ? snapshot.marketStructure.resistanceZones.map((z) => fmtFixed(z, 4)).join('; ')
                    : t('common.none')}
                </p>
              </div>
              <div>
                <p className="text-[var(--text)]/55 mb-1">{t('ta.supZones')}</p>
                <p className="text-[var(--positive)]">
                  {snapshot.marketStructure.supportZones.length > 0
                    ? snapshot.marketStructure.supportZones.map((z) => fmtFixed(z, 4)).join('; ')
                    : t('common.none')}
                </p>
              </div>
              <div className="pt-2 border-t border-[var(--border)] space-y-1">
                <p>{t('ta.bullInval')}: {fmt(snapshot.marketStructure.bullishInvalidationLevel)}</p>
                <p>{t('ta.bearInval')}: {fmt(snapshot.marketStructure.bearishInvalidationLevel)}</p>
                <p className="text-[var(--text)]/55">
                  {t('ta.confirmedSwings')}: {snapshot.marketStructure.confirmedSwings.length} · {t('ta.unconfirmed')}:{' '}
                  {snapshot.marketStructure.unconfirmedSwings.length}
                </p>
              </div>
            </section>
          </div>

          {candles.length > 0 && (
            <SessionHistoryTable
              mode="candles"
              candles={candles}
              timeframe={timeframe}
              priceUnit={selectedInst?.specification.quotationUnit}
              sourceNote={candles[candles.length - 1]?.source}
            />
          )}
        </>
      )}
    </div>
  );
}
