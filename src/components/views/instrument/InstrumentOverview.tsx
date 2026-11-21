import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtDate, fmtDateTime, fmtFixed, fmtNum, useI18n, type TKey } from '../../../i18n';
import { atr } from '../../../shared/analytics';
import { getCommodityVisual } from '../../../shared/data/commodityVisuals';
import type { CommodityProfileDossier, CycleTimeframeKey } from '../../../shared/types/cycle';
import type { DriversResponse } from '../../../shared/types/drivers';
import type { MarketCandle } from '../../../shared/types/market';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { CyclePhaseBadge } from '../../common/CyclePhaseBadge';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { WatchButton } from '../../watchlist/WatchButton';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { CandleChart } from '../charts/CandleChart';
import { LegacyModule } from '../LegacyModule';
import { RelatedNews } from './RelatedNews';
import {
  cotLight,
  fundamentalLight,
  seasonalLight,
  trendLight,
  upcomingWarningDays,
  type ContextLight,
  type LightTone,
} from './contextLights';

type RangeKey = '1M' | '6M' | '1Y' | 'ALL';
const RANGE_DAYS: Record<RangeKey, number> = { '1M': 31, '6M': 183, '1Y': 366, ALL: 365 * 60 };
const RANGE_LABEL: Record<RangeKey, 'ins.chart.r1m' | 'ins.chart.r6m' | 'ins.chart.r1y' | 'ins.chart.rall'> = {
  '1M': 'ins.chart.r1m',
  '6M': 'ins.chart.r6m',
  '1Y': 'ins.chart.r1y',
  ALL: 'ins.chart.rall',
};
const DAY_MS = 86_400_000;

function sortCandles(candles: MarketCandle[]): MarketCandle[] {
  const byDay = new Map<string, MarketCandle>();
  for (const c of candles) if (c.isComplete !== false) byDay.set(c.timestamp.slice(0, 10), c);
  return [...byDay.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function decimalsFor(tick: number | null | undefined): number {
  if (!tick || tick <= 0) return 2;
  const s = String(tick);
  const dot = s.indexOf('.');
  return Math.max(2, dot < 0 ? 0 : s.length - dot - 1);
}

/** Collapsible "Xem thêm" section: children mount only when opened (heavy expert views stay lazy). */
function MoreSection({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`ins-more-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left min-h-[44px]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text-strong)]">{title}</span>
          <span className="block text-xs text-[var(--muted)]">{hint}</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={`ins-more-${id}`} className="border-t border-[var(--border)] p-4 overflow-x-auto">
          {children}
        </div>
      )}
    </section>
  );
}

function StatTile({ label, value, say, tone, children }: { label: string; value: string; say: string; tone?: string; children?: ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-2 min-w-0">
      <span className="text-xs font-semibold text-[var(--muted)]">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${tone ?? 'text-[var(--text-strong)]'}`}>{value}</span>
      {children}
      <span className="text-xs leading-relaxed text-[var(--text)]">{say}</span>
    </div>
  );
}

const TONE_VAR: Record<LightTone, string> = {
  green: 'var(--positive)',
  yellow: 'var(--warning)',
  red: 'var(--negative)',
  grey: 'var(--muted)',
};

/** One of the 4 context cards: colored dot + one sentence + "?" tooltip with method, source and date. */
function ContextCard({ light, t }: { light: ContextLight; t: (k: TKey, p?: Record<string, string | number>) => string }) {
  const [tip, setTip] = useState(false);
  const color = TONE_VAR[light.tone];
  const sentence = t(`ins.ctx.${light.id}.${light.msg}` as TKey, light.params);
  const meta = [
    light.source ? t('ins.ctx.src', { s: light.source }) : null,
    light.asOf ? t('ins.ctx.asOf', { d: light.asOf.length >= 10 ? fmtDate(light.asOf.slice(0, 10)) : light.asOf }) : t('ins.ctx.noDate'),
  ].filter(Boolean);
  const tipId = `ins-ctx-tip-${light.id}`;
  return (
    <li className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 min-w-0 flex flex-col gap-1.5" data-testid={`ctx-light-${light.id}`} data-tone={light.tone}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs font-semibold text-[var(--muted)] truncate">{t(`ins.ctx.label.${light.id}` as TKey)}</span>
        </span>
        <button
          type="button"
          aria-label={t('ins.ctx.help')}
          aria-expanded={tip}
          aria-controls={tipId}
          onClick={() => setTip((v) => !v)}
          onBlur={() => setTip(false)}
          className="shrink-0 w-7 h-7 -m-1 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text-strong)]"
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-sm leading-snug text-[var(--text-strong)]">{sentence}</p>
      {tip && (
        <div id={tipId} role="tooltip" className="text-xs leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 space-y-1">
          <p>{t(`ins.ctx.${light.id}.help` as TKey)}</p>
          <p className="text-[var(--muted)]">{meta.join(' · ')}</p>
        </div>
      )}
    </li>
  );
}

/**
 * Per-instrument detail "Tổng quan" (T77): header + price, "why up/down", key stats, chart, contract spec,
 * and collapsible expert details. Everything is built from data the app already serves; nothing is invented.
 */
export function InstrumentOverview() {
  const { t, lang } = useI18n();
  const { selectedSymbol, setActiveModule } = useTerminal();
  const [dossier, setDossier] = useState<CommodityProfileDossier | null>(null);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [drivers, setDrivers] = useState<DriversResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('6M');
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setDrivers(null);
    const sym = encodeURIComponent(selectedSymbol);
    fetchJsonWithRetry<CommodityProfileDossier>(`/api/cycle/profile/${sym}`, { signal: ctrl.signal })
      .then((d) => {
        if (!ctrl.signal.aborted) setDossier(d);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) {
          setDossier(null);
          setError(e instanceof Error ? e.message : 'error');
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    fetchJsonWithRetry<{ candles?: MarketCandle[] }>(`/api/market/candles/${sym}?timeframe=D1`, { signal: ctrl.signal })
      .then((d) => !ctrl.signal.aborted && setCandles(Array.isArray(d?.candles) ? d.candles : []))
      .catch(() => !ctrl.signal.aborted && setCandles([]));
    fetchJsonWithRetry<DriversResponse>(`/api/drivers/${sym}`, { signal: ctrl.signal })
      .then((d) => !ctrl.signal.aborted && setDrivers(d))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [selectedSymbol, nonce]);

  const sorted = useMemo(() => sortCandles(candles), [candles]);
  const visible = useMemo(() => {
    if (sorted.length === 0 || range === 'ALL') return sorted;
    const cutoff = Date.parse(sorted[sorted.length - 1].timestamp) - RANGE_DAYS[range] * DAY_MS;
    return sorted.filter((c) => Date.parse(c.timestamp) >= cutoff);
  }, [sorted, range]);

  const stats = useMemo(() => {
    if (sorted.length === 0) return null;
    const last = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const cutoff = Date.parse(last.timestamp) - 365 * DAY_MS;
    const year = sorted.filter((c) => Date.parse(c.timestamp) >= cutoff);
    const lo = Math.min(...year.map((c) => c.low));
    const hi = Math.max(...year.map((c) => c.high));
    const a = atr(sorted, 14);
    const atrLast = a.status === 'OK' ? a.values[a.values.length - 1] : null;
    return {
      last,
      changePct: prev && prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : null,
      lo,
      hi,
      atrLast: typeof atrLast === 'number' ? atrLast : null,
    };
  }, [sorted]);

  if (loading && !dossier) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t('ins.loading')}>
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (error || !dossier) {
    return (
      <Card className="space-y-2 text-sm">
        <p className="text-[var(--negative)]">{t('ins.error', { msg: error ?? '—' })}</p>
        <button type="button" onClick={retry} className="underline text-[var(--accent-text)]">
          {t('drv.retry')}
        </button>
      </Card>
    );
  }

  const { summary, timeframes, cotSnapshot } = dossier;
  const { instrument, quote } = summary;
  const spec = instrument.specification;
  const visual = getCommodityVisual(instrument.id);
  const nameVi = visual?.nameVi ?? instrument.commodityProfile?.vietnameseName ?? instrument.productName;
  const isBenchmark = quote.kind === 'BENCHMARK';
  const decimals = decimalsFor(spec.minimumTickSize);
  const fmtPrice = (v: number) => fmtFixed(v, decimals);

  // Header price: the live/delayed quote when present; otherwise the last historical close, labelled HISTORICAL.
  const hasQuote = quote.price !== null;
  const price = hasQuote ? quote.price : stats ? stats.last.close : null;
  const priceStatus = hasQuote ? quote.status : stats ? ('HISTORICAL' as const) : ('UNAVAILABLE' as const);
  const updatedIso = hasQuote ? (quote.timestamp ?? quote.retrievedAt) : stats ? stats.last.timestamp : null;
  const updatedText = hasQuote
    ? fmtDateTime(updatedIso)
    : stats
      ? fmtDate(stats.last.timestamp.slice(0, 10))
      : null;
  // Units like "cents/bushel" or "USD/barrel" already carry the currency; only prefix a bare unit.
  const rawUnit = (hasQuote ? quote.unit : spec.quotationUnit) || '';
  const rawCurrency = (hasQuote ? quote.currency : spec.tradingCurrency) || '';
  const unitText = rawUnit.includes('/') || !rawCurrency ? rawUnit : `${rawCurrency}/${rawUnit}`;
  // A continuous quote can roll to the next month before the daily history does — flag big gaps instead of hiding them.
  const mismatchPct =
    hasQuote && quote.price !== null && stats && stats.last.close !== 0
      ? ((quote.price - stats.last.close) / stats.last.close) * 100
      : null;
  const showMismatch = !isBenchmark && mismatchPct !== null && Math.abs(mismatchPct) >= 1.5;
  const changePct = !isBenchmark && stats ? stats.changePct : null;

  const daily = timeframes.DAILY;
  const trend = daily.available ? daily.trendDirection : 'UNAVAILABLE';
  const trendTone =
    trend === 'UP' ? 'text-[var(--positive)]' : trend === 'DOWN' ? 'text-[var(--negative)]' : 'text-[var(--text-strong)]';

  const atrPct = daily.atrPct;
  const volText =
    atrPct !== null && stats && stats.atrLast !== null
      ? t('ins.stat.volSay', { atr: fmtPrice(stats.atrLast), pct: fmtFixed(atrPct, 2) })
      : atrPct !== null
        ? t('ins.stat.volPctOnly', { pct: fmtFixed(atrPct, 2) })
        : '—';

  const rangePos = stats && stats.hi > stats.lo ? ((stats.last.close - stats.lo) / (stats.hi - stats.lo)) * 100 : null;
  const rangeWord =
    rangePos === null ? '—' : rangePos <= 25 ? t('ins.stat.rangeLow') : rangePos >= 75 ? t('ins.stat.rangeHigh') : t('ins.stat.rangeMid');

  const nextEvent = drivers?.events.upcoming[0] ?? null;
  const eventDays = upcomingWarningDays(nextEvent?.date);
  const weekly = timeframes.WEEKLY;
  const lastDailyDate = stats ? stats.last.timestamp.slice(0, 10) : null;
  const lights: ContextLight[] = [
    trendLight(
      { available: daily.available, trendDirection: daily.trendDirection, asOf: lastDailyDate },
      { available: weekly.available, trendDirection: weekly.trendDirection },
    ),
    fundamentalLight({ bias: summary.supplyDemandBias, matrix: dossier.supplyDemandMatrix }),
    seasonalLight(drivers?.seasonality, drivers?.asOf ?? null),
    cotLight(cotSnapshot),
  ];
  const attribution = drivers?.attribution;
  const whySentence =
    attribution && attribution.status !== 'UNAVAILABLE' && attribution.horizons.length > 0
      ? (attribution.horizons.find((h) => h.days === 1) ?? attribution.horizons[0]).sentence[lang === 'en' ? 'en' : 'vi']
      : null;

  const specRows: Array<[string, string]> = [];
  if (spec.contractSize !== null) specRows.push([t('ins.spec.size'), `${fmtNum(spec.contractSize)} ${spec.contractSizeUnit}`]);
  if (spec.quotationUnit) specRows.push([t('ins.spec.quote'), spec.quotationUnit]);
  if (spec.minimumTickSize !== null) specRows.push([t('ins.spec.tick'), fmtNum(spec.minimumTickSize)]);
  if (spec.tickValue !== null) specRows.push([t('ins.spec.tickValue'), `${fmtNum(spec.tickValue)} ${spec.tradingCurrency}`]);
  if (spec.tradingCurrency) specRows.push([t('ins.spec.currency'), spec.tradingCurrency]);
  if (spec.tradingHoursSummary) specRows.push([t('ins.spec.hours'), spec.tradingHoursSummary]);
  if (spec.expirationDate) specRows.push([t('ins.spec.expiry'), fmtDate(spec.expirationDate)]);
  if (spec.marginRequirement !== null)
    specRows.push([t('ins.spec.margin'), `${fmtNum(spec.marginRequirement)} ${spec.marginCurrency ?? ''}`.trim()]);
  if (spec.settlementMethod === 'PHYSICAL' || spec.settlementMethod === 'CASH')
    specRows.push([t('ins.spec.settle'), t(spec.settlementMethod === 'PHYSICAL' ? 'ins.spec.PHYSICAL' : 'ins.spec.CASH')]);

  const initials = instrument.exchangeSymbol.slice(0, 3).toUpperCase();

  return (
    <div className="space-y-5 max-w-6xl min-w-0">
      {/* Header: name, code, exchange, big price + change + data-quality badge + timestamp */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <span
            aria-hidden="true"
            className="w-14 h-14 sm:w-[72px] sm:h-[72px] shrink-0 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--accent-text)] flex items-center justify-center font-extrabold text-lg sm:text-xl"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-strong)] break-words">{nameVi}</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)] break-words">
              {t('ins.exchangeLine', { exchange: instrument.exchange, code: instrument.exchangeSymbol })}
              {instrument.mxvMapping?.mxvSymbol ? ` · ${t('ins.mxvLine', { code: instrument.mxvMapping.mxvSymbol })}` : ''}
              {spec.contractSize !== null ? ` · ${t('ins.contractLine', { size: fmtNum(spec.contractSize), unit: spec.contractSizeUnit })}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CyclePhaseBadge phase={summary.cyclePhase} />
              <WatchButton symbol={instrument.exchangeSymbol} />
            </div>
          </div>
        </div>

        <div className="sm:text-right min-w-0" data-testid="instrument-price">
          {price !== null ? (
            <p className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums text-[var(--text-strong)]">
              {fmtPrice(price)} <span className="text-base sm:text-lg font-semibold text-[var(--muted)]">{unitText}</span>
            </p>
          ) : (
            <p className="text-2xl font-bold text-[var(--muted)]">{t('ins.noPrice')}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
            {changePct !== null && (
              <span
                title={stats ? t('ins.changeAsOf', { d: fmtDate(stats.last.timestamp.slice(0, 10)) }) : undefined}
                className={`px-2.5 py-1 rounded-lg text-sm font-bold tabular-nums bg-[var(--surface-2)] ${
                  changePct >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                }`}
              >
                {changePct >= 0 ? '▲ +' : '▼ '}
                {t('ins.change', { v: fmtFixed(changePct, 2) })}
              </span>
            )}
            <DataStatusBadge
              status={priceStatus}
              sourceQuality={hasQuote ? quote.sourceQuality : undefined}
              delayMinutes={hasQuote ? quote.delayMinutes : undefined}
              kind={isBenchmark ? 'BENCHMARK' : undefined}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {updatedText ? t('ins.updatedAt', { v: updatedText }) : t('ins.noPriceHint')}
            {!hasQuote && stats ? ` · ${t('ins.priceFromCandle')}` : ''}
            {hasQuote && quote.contractMonth ? ` · ${t('ins.contractViewed', { m: lang === 'en' ? (quote.contractLabel ?? quote.contractMonth) : `${Number(quote.contractMonth.slice(5, 7))}/${quote.contractMonth.slice(0, 4)}` })}` : ''}
          </p>
          {eventDays !== null && nextEvent && (
            <p className="mt-1.5 sm:flex sm:justify-end" data-testid="instrument-event-chip">
              <span
                title={t('ins.ctx.eventTip', { label: nextEvent.label[lang === 'en' ? 'en' : 'vi'], d: fmtDate(nextEvent.date) })}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--warning)] text-[var(--warning)] bg-[var(--surface-2)]"
              >
                <span aria-hidden="true">⏰</span>
                {eventDays === 0 ? t('ins.ctx.eventToday', { kind: nextEvent.kind }) : t('ins.ctx.event', { n: eventDays, kind: nextEvent.kind })}
              </span>
            </p>
          )}
          {showMismatch && stats && mismatchPct !== null && (
            <p className="mt-1.5 max-w-md sm:ml-auto text-xs text-[var(--warning)]" data-testid="instrument-roll-mismatch">
              ⚠ {quote.contractMonth
                ? t('ins.rollMismatchContract', { quote: fmtPrice(quote.price ?? 0), contract: lang === 'en' ? (quote.contractLabel ?? quote.contractMonth) : `${Number(quote.contractMonth.slice(5, 7))}/${quote.contractMonth.slice(0, 4)}`, close: fmtPrice(stats.last.close), pct: fmtFixed(Math.abs(mismatchPct), 1) })
                : t('ins.rollMismatch', { quote: fmtPrice(quote.price ?? 0), close: fmtPrice(stats.last.close), pct: fmtFixed(Math.abs(mismatchPct), 1) })}
            </p>
          )}
        </div>
      </section>

      {/* Bảng 4 yếu tố: context clarity lights (not buy/sell) */}
      <section aria-label={t('ins.ctx.title')} className="space-y-2" data-testid="context-lights">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('ins.ctx.title')}</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {lights.map((l) => (
            <ContextCard key={l.id} light={l} t={t} />
          ))}
        </ul>
        <p className="text-[11px] text-[var(--faint)]">{t('ins.ctx.note')}</p>
      </section>

      {/* Why up/down + key stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 space-y-2.5" tone="accent" aria-labelledby="ins-why">
          <h2 id="ins-why" className="text-sm font-semibold text-[var(--text-strong)]">
            {t('ins.why.title')}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text)]">{whySentence ?? t('ins.why.none')}</p>
          <p className="text-xs text-[var(--muted)]">{t('ins.why.cycle', { v: summary.cyclePhaseLabelVi })}</p>
          <p className="text-[11px] text-[var(--faint)]">{t('ins.why.more')}</p>
        </Card>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4" aria-label={t('ins.stat.trend')}>
          <StatTile label={t('ins.stat.trend')} value={t(`ins.stat.trend${trend}`)} say={t('ins.stat.trendSay')} tone={trendTone} />
          <StatTile
            label={t('ins.stat.vol')}
            value={atrPct !== null ? `${fmtFixed(atrPct, 2)}%` : '—'}
            say={volText}
          />
          <StatTile
            label={t('ins.stat.range')}
            value={rangePos !== null ? `${fmtFixed(rangePos, 0)}% · ${rangeWord}` : '—'}
            say={stats ? t('ins.stat.rangeSay', { lo: fmtPrice(stats.lo), hi: fmtPrice(stats.hi) }) : '—'}
          >
            {rangePos !== null && (
              <div className="h-2 rounded-full bg-[var(--surface-2)] border border-[var(--border)] relative" role="img" aria-label={`${fmtFixed(rangePos, 0)}%`}>
                <span
                  className="absolute top-1/2 w-3 h-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] border-2 border-[var(--surface)]"
                  style={{ left: `${Math.min(100, Math.max(0, rangePos))}%` }}
                />
              </div>
            )}
          </StatTile>
          <StatTile
            label={t('ins.stat.next')}
            value={nextEvent ? fmtDate(nextEvent.date) : t('ins.stat.nextNone')}
            say={nextEvent ? `${nextEvent.label[lang === 'en' ? 'en' : 'vi']} · ${t('ins.stat.nextSay', { v: nextEvent.source })}` : '—'}
          />
        </div>
      </div>

      <RelatedNews symbol={selectedSymbol} />

      {/* Main price chart (T76 plugs a benchmark fallback into the empty-state branch below) */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3 min-w-0" aria-label={t('ins.chart.title')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--text-strong)]">{t('ins.chart.title')}</h2>
          <div role="group" aria-label={t('ins.chart.range')} className="flex flex-wrap gap-1.5">
            {(['1M', '6M', '1Y', 'ALL'] as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={range === k}
                onClick={() => setRange(k)}
                className={`h-9 px-3 rounded-full text-sm border ${
                  range === k
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white font-semibold'
                    : 'border-[var(--border)] text-[var(--text)] hover:text-[var(--text-strong)]'
                }`}
              >
                {t(RANGE_LABEL[k])}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden border border-[var(--border)] min-w-0" data-testid="instrument-chart">
          {visible.length > 0 ? (
            <CandleChart candles={visible} timeframe="D1" overlays={[]} lowerPane={null} showVolume={false} />
          ) : (
            <div
              data-testid="instrument-chart-empty"
              className="min-h-[260px] flex flex-col items-center justify-center gap-3 text-center px-6 py-8"
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">{t('ins.chart.emptyTitle')}</p>
              <p className="text-xs text-[var(--muted)] max-w-md">{t('ins.chart.emptyBody')}</p>
              <button
                type="button"
                onClick={() => setActiveModule('data-import')}
                className="px-3 py-2 rounded-md bg-[var(--accent)] text-white text-xs font-medium"
              >
                {t('ins.chart.import')}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--muted)]">{t('ins.chart.note')}</p>
      </section>

      {/* Contract spec mini-table */}
      {specRows.length > 0 && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 min-w-0" aria-label={t('ins.spec.title')}>
          <h2 className="text-base font-bold text-[var(--text-strong)] mb-2">{t('ins.spec.title')}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-sm">
            {specRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-[var(--border)] min-w-0">
                <dt className="text-[var(--muted)] shrink-0">{k}</dt>
                <dd className="text-[var(--text-strong)] text-right tabular-nums break-words min-w-0">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-[var(--faint)]">{t('ins.spec.status', { v: spec.verificationStatus })}</p>
        </section>
      )}

      {/* Expert details, collapsed by default */}
      <section className="space-y-3" aria-label={t('ins.more.title')}>
        <h2 className="text-base font-bold text-[var(--text-strong)]">{t('ins.more.title')}</h2>

        <MoreSection id="indicators" title={t('ins.more.indicators')} hint={t('ins.more.indicatorsHint')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(['MONTHLY', 'WEEKLY', 'DAILY', 'H4'] as CycleTimeframeKey[]).map((k) => {
              const tf = timeframes[k];
              return (
                <div key={k} className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-[var(--text-strong)]">{k}</span>
                    <span className="font-mono text-[11px] text-[var(--faint)]">{tf.candleCount}</span>
                  </div>
                  <CyclePhaseBadge phase={tf.phase} compact />
                  {tf.available && (
                    <div className="grid grid-cols-2 gap-1 pt-2 border-t border-[var(--border)] font-mono text-[11px] text-[var(--muted)] tabular-nums">
                      <span>EMA20: {tf.ema20 ?? '—'}</span>
                      <span>EMA50: {tf.ema50 ?? '—'}</span>
                      <span>EMA200: {tf.ema200 ?? '—'}</span>
                      <span>RSI14: {tf.rsi14 ?? '—'}</span>
                      <span>ATR%: {tf.atrPct !== null ? `${tf.atrPct}%` : '—'}</span>
                      <span>MACD: {tf.macdHist ?? '—'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MoreSection>

        <MoreSection id="term" title={t('ins.more.term')} hint={t('ins.more.termHint')}>
          <LegacyModule id="term-structure" />
        </MoreSection>

        <MoreSection id="cot" title={t('ins.more.cot')} hint={t('ins.more.cotHint')}>
          <div className="space-y-4">
            <p className="text-xs text-[var(--muted)]">
              COT Index: {cotSnapshot.cotIndex !== null ? `${fmtFixed(cotSnapshot.cotIndex, 1)}%` : '—'} · {cotSnapshot.note}
            </p>
            <LegacyModule id="cot" />
          </div>
        </MoreSection>

        <MoreSection id="profile" title={t('ins.more.profile')} hint={t('ins.more.profileHint')}>
          <LegacyModule id="commodity-profile" />
        </MoreSection>

        <MoreSection id="raw" title={t('ins.more.raw')} hint={t('ins.more.rawHint')}>
          <ul className="space-y-1.5 text-xs text-[var(--text)] break-words">
            <li>{t('ins.raw.quote', { src: quote.source || '—', at: fmtDateTime(quote.retrievedAt) })}</li>
            {quote.timestamp && <li>{t('ins.raw.quoteTime', { v: fmtDateTime(quote.timestamp) })}</li>}
            {quote.statusReason && <li>{t('ins.raw.reason', { v: quote.statusReason })}</li>}
            <li>
              {stats
                ? t('ins.raw.candles', {
                    n: sorted.length,
                    from: fmtDate(sorted[0].timestamp.slice(0, 10)),
                    to: fmtDate(stats.last.timestamp.slice(0, 10)),
                    src: stats.last.source,
                  })
                : t('ins.raw.none')}
            </li>
            {summary.missingInputs.length > 0 && <li>{t('ins.raw.missing', { v: summary.missingInputs.join(', ') })}</li>}
          </ul>
        </MoreSection>
      </section>

      <p className="text-xs text-[var(--faint)] text-center">{t('ins.disclaimer')}</p>
    </div>
  );
}
