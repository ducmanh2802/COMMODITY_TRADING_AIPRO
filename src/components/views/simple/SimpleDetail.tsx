import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, HelpCircle, Mountain, PiggyBank, Shield, Sprout, TrendingUp, Volume2, VolumeX, ArrowDownToLine } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtInt, fmtDate, getLang, useT } from '../../../i18n';
import type { CyclePhase } from '../../../shared/types/cycle';
import type { MarketCandle } from '../../../shared/types/market';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { CommodityHeroImage } from '../../common/CommodityHeroImage';
import { fmtClock } from '../../common/quoteFormat';
import { Gauge } from '../../ui/viz/Gauge';
import { LineChart, type LinePoint } from '../../ui/viz/LineChart';
import { PhaseStrip } from '../../ui/viz/PhaseStrip';
import { RangeBar, rangePosition } from '../../ui/viz/RangeBar';
import { hedgeModule, paperModule } from './links';
import type { SimpleRow, UsdVnd } from './model';
import { BigPrice, LightBadge, fmtPct, primaryUnit, qualityLines, summaryText } from './parts';
import { speak, speechSupported, hasVietnameseVoice, stopSpeaking } from './speak';
import { convertToVnd } from './units';

type Range = '1m' | '3m' | '1y';
const RANGE_BARS: Record<Range, number> = { '1m': 22, '3m': 66, '1y': 252 };

const PHASE_INDEX: Partial<Record<CyclePhase, number>> = {
  PHASE_1_ACCUMULATION: 0,
  PHASE_2_EARLY_RECOVERY: 1,
  PHASE_3_MARKUP: 2,
  PHASE_4_DISTRIBUTION: 3,
};

function useCandles(symbol: string): { candles: MarketCandle[]; loading: boolean } {
  const [state, setState] = useState<{ candles: MarketCandle[]; loading: boolean }>({ candles: [], loading: true });
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ candles: [], loading: true });
    fetchJsonWithRetry<{ candles?: MarketCandle[] }>(`/api/market/candles/${encodeURIComponent(symbol)}?timeframe=D1`, { signal: ctrl.signal })
      .then((d) => !ctrl.signal.aborted && setState({ candles: d?.candles ?? [], loading: false }))
      .catch(() => !ctrl.signal.aborted && setState({ candles: [], loading: false }));
    return () => ctrl.abort();
  }, [symbol]);
  return state;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--surface)] border-2 border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3">
      <h2 className="text-2xl font-bold text-[var(--text-strong)]">{title}</h2>
      {children}
    </section>
  );
}

const bigBtn =
  'min-h-[56px] w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 text-xl font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 transition-colors';

/** "Hôm nay {hàng} thế nào?" - one screen: price, chart, 52-week bar, swings gauge, cycle strip, 3 facts, big buttons. */
export function SimpleDetail({ row, fx, onBack }: { row: SimpleRow; fx: UsdVnd | null; onBack: () => void }) {
  const t = useT();
  const { openInstrumentIn, setActiveModule, setSelectedSymbol } = useTerminal();
  const [range, setRange] = useState<Range>('3m');
  const [showFormula, setShowFormula] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { candles, loading: candlesLoading } = useCandles(row.symbol);
  const quote = row.quote;
  const lines = qualityLines(t, row);
  const summary = summaryText(t, row);

  useEffect(() => () => stopSpeaking(), []);

  // Values shown in the same unit as the big price (VND per kg/tonne when exactly convertible, else exchange unit).
  const unit = primaryUnit(row);
  const conv = (native: number): number | null => {
    if (!quote) return null;
    const c = convertToVnd(row.symbol, quote.unit, quote.currency, native, fx?.rate ?? null);
    return c ? (unit === 'kg' ? c.vndPerKg : c.vndPerTon) : null;
  };
  const show = (native: number): string => {
    const v = conv(native);
    if (v !== null) return `${fmtInt(v)} ${unit === 'kg' ? 'đ/kg' : 'đ/tấn'}`;
    return fmtInt(native);
  };

  // Candles are only trusted when they are in the same unit scale as the quote (sanity check, never rescaled).
  const usableCandles = useMemo(() => {
    const sorted = [...candles].filter((c) => Number.isFinite(c.close)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted.length < 2) return [];
    const last = sorted[sorted.length - 1].close;
    if (quote?.price && last > 0 && (quote.price / last > 1.6 || quote.price / last < 0.625)) return [];
    return sorted;
  }, [candles, quote?.price]);

  const points: LinePoint[] = useMemo(
    () => usableCandles.slice(-RANGE_BARS[range]).map((c) => ({ t: c.timestamp, v: c.close })),
    [usableCandles, range]
  );

  const year = usableCandles.slice(-252);
  const spanDays =
    year.length > 1 ? (Date.parse(year[year.length - 1].timestamp) - Date.parse(year[0].timestamp)) / 86_400_000 : 0;
  const lo = year.length ? Math.min(...year.map((c) => c.close)) : null;
  const hi = year.length ? Math.max(...year.map((c) => c.close)) : null;
  const cur = year.length ? year[year.length - 1].close : null;
  const pos = lo !== null && hi !== null && cur !== null ? rangePosition(lo, hi, cur) : null;
  const pct10 = row.cycle?.percentile10Y ?? null;

  const vol = row.scorecard?.dimensions.find((d) => d.id === 'volatility');
  const volLevel = vol && vol.status === 'OK' ? vol.level : null;
  const volIdx = volLevel === 'LOW' ? 0 : volLevel === 'MEDIUM' ? 1 : volLevel === 'HIGH' ? 2 : null;
  const volNeedle = volIdx === null ? null : vol?.score !== null && vol?.score !== undefined ? vol.score : [16, 50, 84][volIdx];
  const volLabels: [string, string, string] = [t('sm.d.volLow'), t('sm.d.volMid'), t('sm.d.volHigh')];

  const phaseIdx = row.cycle ? (PHASE_INDEX[row.cycle.cyclePhase] ?? null) : null;

  const facts: string[] = [];
  if (quote?.kind === 'BENCHMARK') facts.push(t('sm.f.bench'));
  if (row.hasPrice && !row.conv && !fx && quote && convertToVnd(row.symbol, quote.unit, quote.currency, 1, 1)) facts.push(t('sm.f.fxless'));
  const spec = row.instrument.specification;
  if (spec.contractSize) facts.push(t('sm.f.contract', { size: fmtInt(spec.contractSize), unit: spec.contractSizeUnit }));
  if (row.cycle?.returns.m1 !== null && row.cycle?.returns.m1 !== undefined) facts.push(t('sm.f.m1', { pct: fmtPct(row.cycle.returns.m1) }));
  if (row.cycle?.returns.y1 !== null && row.cycle?.returns.y1 !== undefined) facts.push(t('sm.f.y1', { pct: fmtPct(row.cycle.returns.y1) }));
  const shownFacts = facts.slice(0, 3);

  const go = (id: ReturnType<typeof paperModule>) => {
    if (!id) return;
    setSelectedSymbol(row.symbol);
    setActiveModule(id);
  };
  const paper = paperModule();
  const hedge = hedgeModule();

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const ok = speak(summary, getLang() === 'vi' ? 'vi-VN' : 'en-US', () => setSpeaking(false));
    setSpeaking(ok);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[48px] inline-flex items-center gap-2 px-4 rounded-xl border-2 border-[var(--border)] text-lg font-semibold text-[var(--text-strong)] hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
      >
        <ArrowLeft className="w-6 h-6" aria-hidden="true" />
        {t('sm.backList')}
      </button>

      <CommodityHeroImage symbol={row.id} name={row.name} category={row.instrument.category} className="h-40 sm:h-56 w-full rounded-2xl" priority />

      <h1 className="text-3xl sm:text-4xl font-extrabold text-[var(--text-strong)] leading-tight">{t('sm.d.title', { name: row.name })}</h1>

      <Section title={row.name}>
        <BigPrice row={row} t={t} size="detail" />
        <div className="flex flex-wrap items-center gap-3">
          <LightBadge light={row.light} t={t} big />
          {row.changePct !== null && row.period && (
            <span className="text-2xl font-bold tabular-nums text-[var(--text-strong)]">
              {t('sm.d.change', { pct: fmtPct(row.changePct), period: t(row.period === 'd1' ? 'sm.per.d1' : 'sm.per.w1') })}
            </span>
          )}
        </div>
        <p className="text-xl text-[var(--text-strong)] leading-snug">{summary}</p>
        <p className="text-lg text-[var(--text)] leading-snug">
          {lines[0]}
          <br />
          {lines[1]}
          {quote?.timestamp && <span className="block text-base text-[var(--muted)]">{fmtClock(quote.timestamp)}</span>}
        </p>
        <div className="flex flex-wrap gap-3">
          {speechSupported() && (
            <button
              type="button"
              onClick={toggleSpeak}
              aria-pressed={speaking}
              className={`${bigBtn} sm:w-auto border-[var(--accent-text)] text-[#E0E7FF] hover:bg-[var(--accent)]/20`}
            >
              {speaking ? <VolumeX className="w-6 h-6" aria-hidden="true" /> : <Volume2 className="w-6 h-6" aria-hidden="true" />}
              {speaking ? t('sm.b.stop') : t('sm.b.read')}
            </button>
          )}
          {row.conv && (
            <button
              type="button"
              onClick={() => setShowFormula((v) => !v)}
              aria-expanded={showFormula}
              className={`${bigBtn} sm:w-auto border-[var(--border)] text-[var(--text-strong)] hover:bg-[var(--surface-2)]`}
            >
              {showFormula ? t('sm.formula.hide') : t('sm.formula.show')}
            </button>
          )}
        </div>
        {speechSupported() && !hasVietnameseVoice() && getLang() === 'vi' && speaking && (
          <p className="text-base text-[var(--muted)]">{t('sm.b.noVoice')}</p>
        )}
        {showFormula && row.conv && (
          <div className="rounded-xl bg-[var(--bg)] border border-[var(--border)] p-4 text-lg text-[var(--text-strong)] space-y-2">
            <p className="font-semibold">{t('sm.formula.title')}</p>
            <p className="font-mono text-base break-words">{row.conv.formula}</p>
            {fx?.asOf && <p className="text-base text-[var(--text)]">{t('sm.formula.fx', { time: fmtClock(fx.asOf) ?? '—' })}</p>}
          </div>
        )}
      </Section>

      <Section title={t('sm.d.chart')}>
        <div role="group" className="grid grid-cols-3 gap-2">
          {(['1m', '3m', '1y'] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={`min-h-[48px] rounded-xl border-2 text-lg font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 ${
                range === r ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] text-white hover:bg-[var(--surface-2)]'
              }`}
            >
              {t(`sm.d.r${r}` as 'sm.d.r1m')}
            </button>
          ))}
        </div>
        {points.length >= 2 ? (
          <LineChart
            points={points}
            height={180}
            ariaLabel={t('sm.d.chartAria', { name: row.name, range: t(`sm.d.r${range}` as 'sm.d.r1m') })}
            formatValue={(v) => show(v)}
          />
        ) : (
          <p className="text-xl text-[var(--text)]">{candlesLoading ? t('sm.home.loading') : t('sm.d.noChart')}</p>
        )}
      </Section>

      <Section title={t('sm.d.pos')}>
        {pos !== null && lo !== null && hi !== null ? (
          <>
            <RangeBar
              low={lo}
              high={hi}
              current={cur as number}
              lowLabel={t('sm.d.posLow', { price: show(lo) })}
              highLabel={t('sm.d.posHigh', { price: show(hi) })}
              ariaLabel={t('sm.d.posAria', { pct: fmtInt(pos) })}
            />
            <p className="text-xl text-[var(--text-strong)]">{t('sm.d.posAt', { pct: fmtInt(pos) })}</p>
            {spanDays < 330 && <p className="text-base text-[var(--muted)]">{t('sm.d.posDays', { n: year.length })}</p>}
          </>
        ) : pct10 !== null ? (
          <p className="text-xl text-[var(--text-strong)]">{t('sm.d.pos10y', { pct: fmtInt(pct10) })}</p>
        ) : (
          <p className="text-xl text-[var(--text)]">{t('sm.d.posNone')}</p>
        )}
      </Section>

      <Section title={t('sm.d.vol')}>
        {volIdx !== null ? (
          <>
            <Gauge value={volNeedle} labels={volLabels} ariaLabel={t('sm.d.volAria', { level: volLabels[volIdx] })} />
            <p className="text-lg text-[var(--text)]">{t('sm.d.volHint')}</p>
          </>
        ) : (
          <p className="text-xl text-[var(--text)]">{t('sm.d.volNone')}</p>
        )}
      </Section>

      <Section title={t('sm.d.cycle')}>
        {phaseIdx !== null ? (
          <>
            <PhaseStrip
              ariaLabel={t('sm.d.cycleAria')}
              active={phaseIdx}
              steps={[
                { label: t('sm.ph.1'), Icon: ArrowDownToLine },
                { label: t('sm.ph.2'), Icon: Sprout },
                { label: t('sm.ph.3'), Icon: TrendingUp },
                { label: t('sm.ph.4'), Icon: Mountain },
              ]}
            />
            <p className="text-base text-[var(--muted)]">{t('sm.ph.note')}</p>
          </>
        ) : (
          <p className="text-xl text-[var(--text)]">{t('sm.ph.none')}</p>
        )}
      </Section>

      {shownFacts.length > 0 && (
        <Section title={t('sm.d.facts')}>
          <ul className="list-disc pl-6 space-y-2 text-xl text-[var(--text-strong)]">
            {shownFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => openInstrumentIn(row.symbol, 'brief')}
          className={`${bigBtn} border-[var(--accent)] bg-[var(--accent)] text-white hover:brightness-110`}
        >
          <HelpCircle className="w-6 h-6" aria-hidden="true" />
          {t('sm.b.why')}
        </button>
        {paper && (
          <button type="button" onClick={() => go(paper)} className={`${bigBtn} border-[var(--accent-text)] text-[var(--text-strong)] hover:bg-[var(--accent)]/20`}>
            <PiggyBank className="w-6 h-6" aria-hidden="true" />
            {t('sm.b.paper')}
          </button>
        )}
        {hedge && (
          <button type="button" onClick={() => go(hedge)} className={`${bigBtn} border-[var(--accent-text)] text-[var(--text-strong)] hover:bg-[var(--accent)]/20`}>
            <Shield className="w-6 h-6" aria-hidden="true" />
            {t('sm.b.hedge')}
          </button>
        )}
        <button type="button" onClick={() => setActiveModule('learn')} className={`${bigBtn} border-[var(--border)] text-[var(--text-strong)] hover:bg-[var(--surface-2)]`}>
          <BookOpen className="w-6 h-6" aria-hidden="true" />
          {t('sm.b.learn')}
        </button>
      </div>

      <p className="text-base text-[var(--muted)] pb-4">
        {t('sm.disc')} {quote?.timestamp ? fmtDate(quote.timestamp) : ''}
      </p>
    </div>
  );
}
