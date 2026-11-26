import { useEffect, useId, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, BookOpen, LogIn, TrendingUp } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { getFirestoreModules, handleFirestoreError, OperationType } from '../../../firebase';
import { fmtFixed, fmtInt, useT } from '../../../i18n';
import {
  computeTradePerformance,
  parseJournalTimestampMs,
  type NormalizedJournalTrade,
  type TradePerformancePoint,
  type InstrumentPerformance,
} from '../../../shared/utils/tradePerformance';
import { EmptyState } from '../../ui/EmptyState';
import { usePaperStore } from '../papertrade/usePaperStore';

type JournalSource = 'journal' | 'paper';
type Currency = 'USD' | 'VND';

interface JournalRecord {
  id: string;
  instrument: string;
  direction: 'LONG' | 'SHORT';
  strategy: string;
  realizedPnl: number;
  resultInR: number;
  entryTimestamp: string;
  exitTimestamp: string;
  status: 'OPEN' | 'CLOSED';
}

function formatMoney(value: number, currency: Currency, signed = false): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  if (currency === 'USD') {
    return `${sign}$${fmtFixed(abs, 2)}`;
  }
  return `${sign}${fmtInt(abs)} đ`;
}

function formatCompactAxis(value: number, currency: Currency): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (currency === 'USD') {
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
    return `${sign}$${Math.round(abs)}`;
  }
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

function formatR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${fmtFixed(Math.abs(value), 2)}R`;
}

interface EquityTooltipPayloadItem {
  payload?: TradePerformancePoint;
}

function EquityTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: EquityTooltipPayloadItem[];
  currency: Currency;
}) {
  const t = useT();
  const pt = payload?.[0]?.payload;
  if (!active || !pt) return null;
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-[var(--shadow-card)] tabular-nums">
      <div className="flex items-center justify-between gap-4 font-semibold text-[var(--text-strong)]">
        <span>
          {t('tp.chart.tradeLabel', { n: pt.index })} · {pt.symbol}
        </span>
        <span className="text-[var(--muted)] font-normal">{pt.shortDate}</span>
      </div>
      {pt.strategy && (
        <div className="text-[11px] text-[var(--muted)] mt-0.5">{pt.strategy}</div>
      )}
      <div className="mt-1.5 space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--muted)]">{t('tp.tooltip.pnl')}</span>
          <span className={pt.pnl >= 0 ? 'text-[var(--positive)] font-mono' : 'text-[var(--negative)] font-mono'}>
            {formatMoney(pt.pnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--muted)]">{t('tp.tooltip.cumPnl')}</span>
          <span className={pt.cumulativePnl >= 0 ? 'text-[var(--positive)] font-mono font-semibold' : 'text-[var(--negative)] font-mono font-semibold'}>
            {formatMoney(pt.cumulativePnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--muted)]">{t('tp.tooltip.dd')}</span>
          <span className={pt.drawdownAbs > 0 ? 'text-[var(--negative)] font-mono' : 'text-[var(--muted)] font-mono'}>
            {pt.drawdownAbs > 0 ? `−${formatMoney(pt.drawdownAbs, currency)}` : formatMoney(0, currency)}
            {pt.drawdownPct !== null && pt.drawdownAbs > 0 ? ` (${fmtFixed(pt.drawdownPct, 1)}%)` : ''}
          </span>
        </div>
        {pt.rMultiple !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--muted)]">{t('tp.tooltip.r')}</span>
            <span className="font-mono text-[var(--text-strong)]">{formatR(pt.rMultiple)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SymbolTooltipPayloadItem {
  payload?: InstrumentPerformance;
}

function SymbolTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: SymbolTooltipPayloadItem[];
  currency: Currency;
}) {
  const t = useT();
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs shadow-[var(--shadow-card)] tabular-nums">
      <div className="font-semibold text-[var(--text-strong)]">{row.symbol}</div>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--muted)]">{t('tp.kpi.netPnl')}</span>
          <span className={row.netPnl >= 0 ? 'text-[var(--positive)] font-mono font-semibold' : 'text-[var(--negative)] font-mono font-semibold'}>
            {formatMoney(row.netPnl, currency, true)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--muted)]">{t('tp.tooltip.winRate')}</span>
          <span className="font-mono text-[var(--text-strong)]">
            {fmtFixed(row.winRatePct, 0)}% ({row.wins}W · {row.losses}L)
          </span>
        </div>
        {row.avgR !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--muted)]">{t('tp.tooltip.r')}</span>
            <span className="font-mono text-[var(--text-strong)]">{formatR(row.avgR)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Recharts-based trade performance, win/loss ratio, and drawdown visualization
 * embedded inside the Analysis Hub.
 */
export function TradePerformanceChart() {
  const t = useT();
  const gradUid = useId().replace(/:/g, '');
  const { user, authReady, signInWithGoogle } = useAuth();
  const { setActiveModule, instruments } = useTerminal();
  const paper = usePaperStore();

  const [journalEntries, setJournalEntries] = useState<JournalRecord[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [sourceChoice, setSourceChoice] = useState<JournalSource | null>(null);
  const [symbolFilter, setSymbolFilter] = useState<string>('ALL');

  const isVerifiedSignedIn = Boolean(authReady && user && user.emailVerified);

  useEffect(() => {
    if (!isVerifiedSignedIn || !user) {
      setJournalEntries([]);
      setJournalLoading(false);
      setJournalError(null);
      return;
    }

    let disposed = false;
    let unsub: (() => void) | null = null;
    setJournalLoading(true);
    setJournalError(null);

    void getFirestoreModules()
      .then(({ db, collection, onSnapshot, query, where }) => {
        if (disposed) return;
        const q = query(collection(db, 'tradeJournal'), where('userId', '==', user.uid));
        unsub = onSnapshot(
          q,
          (snap) => {
            if (disposed) return;
            const rows: JournalRecord[] = snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                instrument: String(data.instrument ?? ''),
                direction: data.direction === 'SHORT' ? 'SHORT' : 'LONG',
                strategy: String(data.strategy ?? ''),
                realizedPnl: Number(data.realizedPnl ?? 0),
                resultInR: Number(data.resultInR ?? 0),
                entryTimestamp: String(data.entryTimestamp ?? ''),
                exitTimestamp: String(data.exitTimestamp ?? ''),
                status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
              };
            });
            setJournalEntries(rows);
            setJournalLoading(false);
          },
          (err) => {
            if (disposed) return;
            const info = handleFirestoreError(err, OperationType.LIST, 'tradeJournal');
            setJournalError(info.userMessage);
            setJournalLoading(false);
          }
        );
      })
      .catch((err: unknown) => {
        if (disposed) return;
        const info = handleFirestoreError(err, OperationType.LIST, 'tradeJournal');
        setJournalError(info.userMessage);
        setJournalLoading(false);
      });

    return () => {
      disposed = true;
      unsub?.();
    };
  }, [isVerifiedSignedIn, user]);

  const instrumentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of instruments) {
      map.set(inst.id, inst.exchangeSymbol);
    }
    return map;
  }, [instruments]);

  const normalizedJournal = useMemo<NormalizedJournalTrade[]>(() => {
    return journalEntries
      .filter((e) => e.status === 'CLOSED')
      .map((e) => ({
        id: e.id,
        symbol: e.instrument,
        direction: e.direction,
        strategy: e.strategy || undefined,
        timestampMs: parseJournalTimestampMs(e.exitTimestamp, e.entryTimestamp),
        pnl: e.realizedPnl,
        rMultiple: Number.isFinite(e.resultInR) ? e.resultInR : null,
      }));
  }, [journalEntries]);

  const normalizedPaper = useMemo<NormalizedJournalTrade[]>(() => {
    return paper.state.trades.map((tr) => ({
      id: tr.id,
      symbol: instrumentMap.get(tr.instrumentId) ?? tr.instrumentId,
      direction: tr.side,
      timestampMs: tr.closedAtMs,
      pnl: tr.pnlVnd,
      rMultiple: tr.stopLoss !== null && tr.stopLoss !== undefined ? tr.rMultiple : null,
    }));
  }, [paper.state.trades, instrumentMap]);

  // Smart default: prefer whichever source actually has closed trades (journal if signed in with trades, else paper).
  const activeSource: JournalSource = useMemo(() => {
    if (sourceChoice !== null) return sourceChoice;
    if (normalizedJournal.length > 0) return 'journal';
    if (normalizedPaper.length > 0) return 'paper';
    return isVerifiedSignedIn ? 'journal' : 'paper';
  }, [sourceChoice, normalizedJournal.length, normalizedPaper.length, isVerifiedSignedIn]);

  const currency: Currency = activeSource === 'journal' ? 'USD' : 'VND';
  const rawTrades = activeSource === 'journal' ? normalizedJournal : normalizedPaper;

  const availableSymbols = useMemo(() => {
    const set = new Set(rawTrades.map((tr) => tr.symbol).filter(Boolean));
    return Array.from(set).sort();
  }, [rawTrades]);

  const activeSymbolFilter =
    symbolFilter === 'ALL' || availableSymbols.includes(symbolFilter) ? symbolFilter : 'ALL';

  const filteredTrades = useMemo(() => {
    if (activeSymbolFilter === 'ALL') return rawTrades;
    return rawTrades.filter((tr) => tr.symbol === activeSymbolFilter);
  }, [rawTrades, activeSymbolFilter]);

  const startingCapital = useMemo(() => {
    if (activeSource !== 'paper') return null;
    const total = paper.state.sessions.reduce((sum, s) => sum + (s.startingCapitalVnd || 0), 0);
    return total > 0 ? total : null;
  }, [activeSource, paper.state.sessions]);

  const perf = useMemo(
    () => computeTradePerformance(filteredTrades, { startingCapital }),
    [filteredTrades, startingCapital]
  );

  const isLoading = (activeSource === 'journal' && journalLoading) || (activeSource === 'paper' && !paper.ready);
  const activeError = activeSource === 'journal' ? journalError : paper.error;

  const equityGradId = `tp-eq-${gradUid}`;
  const ddGradId = `tp-dd-${gradUid}`;

  return (
    <section className="space-y-4" aria-label={t('tp.title')}>
      {/* Header + Source / Symbol Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--text-strong)]">{t('tp.title')}</h2>
            {activeSource === 'paper' && (
              <span className="text-[11px] font-medium text-[var(--warning)]">{t('tp.practiceBadge')}</span>
            )}
          </div>
          <p className="text-xs text-[var(--muted)] max-w-2xl">{t('tp.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
            role="group"
            aria-label={t('tp.source.label')}
          >
            <button
              type="button"
              aria-pressed={activeSource === 'journal'}
              onClick={() => {
                setSourceChoice('journal');
                setSymbolFilter('ALL');
              }}
              className={`px-3 min-h-9 text-xs tabular-nums transition-colors ${
                activeSource === 'journal'
                  ? 'bg-[var(--accent-soft)] text-[var(--text-strong)] font-medium'
                  : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
              }`}
            >
              {t('tp.source.journal')} ({normalizedJournal.length})
            </button>
            <button
              type="button"
              aria-pressed={activeSource === 'paper'}
              onClick={() => {
                setSourceChoice('paper');
                setSymbolFilter('ALL');
              }}
              className={`px-3 min-h-9 text-xs tabular-nums border-l border-[var(--border)] transition-colors ${
                activeSource === 'paper'
                  ? 'bg-[var(--accent-soft)] text-[var(--text-strong)] font-medium'
                  : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
              }`}
            >
              {t('tp.source.paper')} ({normalizedPaper.length})
            </button>
          </div>

          {availableSymbols.length > 1 && (
            <select
              aria-label={t('tp.filter.aria')}
              value={activeSymbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs text-[var(--text-strong)]"
            >
              <option value="ALL">{t('tp.filter.all')}</option>
              {availableSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {activeError && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--negative)]/40 bg-[var(--surface)] px-4 py-3 text-xs text-[var(--negative)]"
        >
          {t('tp.error', { msg: activeError })}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
          <div className="h-4 w-48 skeleton" />
          <div className="h-64 w-full skeleton" />
        </div>
      ) : perf.totalTrades === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-8 h-8" aria-hidden="true" />}
          title={t('tp.empty.title')}
          description={
            activeSource === 'journal'
              ? isVerifiedSignedIn
                ? t('tp.empty.journalSignedDesc')
                : t('tp.empty.journalGuestDesc')
              : t('tp.empty.paperDesc')
          }
          action={
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {activeSource === 'journal' && !isVerifiedSignedIn && (
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-3.5 min-h-9 text-xs font-medium text-[var(--on-accent)] hover:opacity-90"
                >
                  <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('tp.cta.signIn')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModule(activeSource === 'journal' ? 'journal' : 'paper')}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3.5 min-h-9 text-xs font-medium text-[var(--text-strong)] hover:bg-[var(--surface-2)]"
              >
                {activeSource === 'journal' ? (
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {activeSource === 'journal' ? t('tp.cta.journal') : t('tp.cta.paper')}
              </button>
            </div>
          }
        />
      ) : (
        <>
          {/* Single-elevation KPI Strip separated by hairline grid dividers */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-px rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--border)] overflow-hidden shadow-[var(--shadow-card)]">
            <div className="bg-[var(--surface)] p-3.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--muted)]">{t('tp.kpi.netPnl')}</div>
              <div
                className={`mt-1 text-base xl:text-lg font-semibold font-mono tabular-nums ${
                  perf.netPnl > 0
                    ? 'text-[var(--positive)]'
                    : perf.netPnl < 0
                    ? 'text-[var(--negative)]'
                    : 'text-[var(--text-strong)]'
                }`}
              >
                {formatMoney(perf.netPnl, currency, true)}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)] tabular-nums">
                {t('tp.kpi.expectancy', {
                  val: perf.expectancy === null ? '—' : formatMoney(perf.expectancy, currency, true),
                })}
              </div>
            </div>

            <div className="bg-[var(--surface)] p-3.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--muted)]">{t('tp.kpi.winLossRatio')}</div>
              <div className="mt-1 text-base xl:text-lg font-semibold font-mono tabular-nums text-[var(--text-strong)]">
                {perf.winLossRatio !== null
                  ? fmtFixed(perf.winLossRatio, 2)
                  : perf.winCount > 0
                  ? `${perf.winCount}:0`
                  : '—'}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)] tabular-nums">
                {perf.lossCount === 0 && perf.winCount > 0
                  ? t('tp.kpi.allWins', { w: perf.winCount })
                  : t('tp.kpi.winRate', {
                      pct: perf.winRatePct === null ? '0' : fmtFixed(perf.winRatePct, 1),
                      w: perf.winCount,
                      l: perf.lossCount,
                    })}
              </div>
            </div>

            <div className="bg-[var(--surface)] p-3.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--muted)]">{t('tp.kpi.maxDd')}</div>
              <div
                className={`mt-1 text-base xl:text-lg font-semibold font-mono tabular-nums ${
                  perf.maxDrawdown > 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'
                }`}
              >
                {perf.maxDrawdown > 0 ? `−${formatMoney(perf.maxDrawdown, currency)}` : formatMoney(0, currency)}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)] tabular-nums">
                {perf.maxDrawdownPct !== null && perf.maxDrawdown > 0 ? `${fmtFixed(perf.maxDrawdownPct, 1)}% · ` : ''}
                {perf.isAtPeak
                  ? t('tp.kpi.atPeak')
                  : t('tp.kpi.curDd', { val: formatMoney(perf.currentDrawdown, currency) })}
              </div>
            </div>

            <div className="bg-[var(--surface)] p-3.5 min-w-0">
              <div className="text-[11px] font-medium text-[var(--muted)]">{t('tp.kpi.payoff')}</div>
              <div className="mt-1 text-base xl:text-lg font-semibold font-mono tabular-nums text-[var(--text-strong)]">
                {perf.payoffRatio !== null ? `${fmtFixed(perf.payoffRatio, 2)}x` : '—'}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)] tabular-nums">
                {perf.profitFactor !== null
                  ? t('tp.kpi.pfDetail', { pf: fmtFixed(perf.profitFactor, 2), avgR: formatR(perf.avgR) })
                  : t('tp.kpi.pfNone', { avgR: formatR(perf.avgR) })}
              </div>
            </div>

            <div className="bg-[var(--surface)] p-3.5 min-w-0 col-span-2 lg:col-span-1">
              <div className="text-[11px] font-medium text-[var(--muted)]">{t('tp.kpi.streaks')}</div>
              <div className="mt-1 text-base xl:text-lg font-semibold font-mono tabular-nums text-[var(--text-strong)]">
                {t('tp.kpi.streakVal', { w: perf.maxWinStreak, l: perf.maxLossStreak })}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)] tabular-nums">
                {t('tp.chart.avgWin', { val: perf.avgWin === null ? '—' : formatMoney(perf.avgWin, currency) })}
              </div>
            </div>
          </div>

          {/* Primary Recharts Visualization: Cumulative Equity Curve + Underwater Drawdown */}
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] space-y-3 min-w-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('tp.chart.equityTitle')}</h3>
                <p className="text-xs text-[var(--muted)]">{t('tp.chart.equityHint')}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[var(--muted)] shrink-0">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--positive)]" aria-hidden="true" />
                  {t('tp.chart.cumPnl')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-[var(--negative)]" aria-hidden="true" />
                  {t('tp.chart.drawdown')}
                </span>
              </div>
            </div>

            <div className="h-72 sm:h-80 w-full min-w-0" data-testid="trade-perf-equity-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={perf.points} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id={equityGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="var(--positive)" stopOpacity={0.03} />
                    </linearGradient>
                    <linearGradient id={ddGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.05} />
                      <stop offset="95%" stopColor="var(--negative)" stopOpacity={0.34} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tickFormatter={(v) => `#${v}`}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--chart-axis)' }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCompactAxis(v, currency)}
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                  />
                  <ReferenceLine y={0} stroke="var(--chart-axis)" strokeWidth={1} />
                  <Tooltip content={<EquityTooltip currency={currency} />} />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    name={t('tp.chart.drawdown')}
                    stroke="var(--negative)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fill={`url(#${ddGradId})`}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePnl"
                    name={t('tp.chart.cumPnl')}
                    stroke="var(--positive)"
                    strokeWidth={2.25}
                    fill={`url(#${equityGradId})`}
                    activeDot={{ r: 4, fill: 'var(--positive)', stroke: 'var(--surface)', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Recharts Panels: Per-Trade P&L Bars + Performance by Instrument */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] space-y-3 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('tp.chart.tradePnlTitle')}</h3>
                  <p className="text-xs text-[var(--muted)]">{t('tp.chart.tradePnlHint')}</p>
                </div>
                <div className="text-right text-[11px] text-[var(--muted)] tabular-nums">
                  <span className="text-[var(--positive)]">
                    {t('tp.chart.avgWin', { val: perf.avgWin === null ? '—' : formatMoney(perf.avgWin, currency) })}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span className="text-[var(--negative)]">
                    {t('tp.chart.avgLoss', { val: perf.avgLoss === null ? '—' : formatMoney(perf.avgLoss, currency) })}
                  </span>
                </div>
              </div>

              <div className="h-60 w-full min-w-0" data-testid="trade-perf-pnl-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={perf.points} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="index"
                      tickFormatter={(v) => `#${v}`}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--chart-axis)' }}
                      tickLine={false}
                      minTickGap={8}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatCompactAxis(v, currency)}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <ReferenceLine y={0} stroke="var(--chart-axis)" />
                    <Tooltip content={<EquityTooltip currency={currency} />} />
                    <Bar dataKey="pnl" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {perf.points.map((pt) => (
                        <Cell
                          key={pt.id}
                          fill={
                            pt.pnl > 0
                              ? 'var(--positive)'
                              : pt.pnl < 0
                              ? 'var(--negative)'
                              : 'var(--muted)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] space-y-3 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('tp.chart.bySymbolTitle')}</h3>
                  <p className="text-xs text-[var(--muted)]">{t('tp.chart.bySymbolHint')}</p>
                </div>
                <div className="text-[11px] text-[var(--muted)] tabular-nums">
                  {t('tp.chart.win')}: <strong className="text-[var(--positive)]">{perf.winCount}</strong>
                  {' · '}
                  {t('tp.chart.loss')}: <strong className="text-[var(--negative)]">{perf.lossCount}</strong>
                  {perf.breakevenCount > 0 ? ` · ${t('tp.chart.even')}: ${perf.breakevenCount}` : ''}
                </div>
              </div>

              <div className="h-60 w-full min-w-0" data-testid="trade-perf-symbol-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={perf.byInstrument.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 6, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => formatCompactAxis(v, currency)}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--chart-axis)' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="symbol"
                      tick={{ fill: 'var(--text-strong)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={56}
                    />
                    <ReferenceLine x={0} stroke="var(--chart-axis)" />
                    <Tooltip content={<SymbolTooltip currency={currency} />} />
                    <Bar dataKey="netPnl" radius={3} isAnimationActive={false}>
                      {perf.byInstrument.slice(0, 8).map((row) => (
                        <Cell
                          key={row.symbol}
                          fill={row.netPnl >= 0 ? 'var(--positive)' : 'var(--negative)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
