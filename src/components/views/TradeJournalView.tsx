import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BookOpen, LogIn, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type { ExchangeCode, InstrumentDefinition, Timeframe } from '../../shared/types/instrument';
import { computeJournalExit, localDateTimeToIso, type JournalExitResult } from './journal/journalMath';
import { fmtFixed, fmtNum, useT } from '../../i18n';

interface JournalDoc {
  id: string;
  userId: string;
  instrument: string;
  exchange: ExchangeCode;
  direction: 'LONG' | 'SHORT';
  strategy: string;
  timeframe: Timeframe;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  positionSize: number;
  entryTimestamp: string;
  exitTimestamp: string;
  exitPrice: number;
  realizedPnl: number;
  tradingCosts: number;
  resultInR: number;
  rationale: string;
  notes: string;
  status: 'OPEN' | 'CLOSED';
}

interface ClosingState {
  id: string;
  exitPrice: string;
  exitTime: string;
  tradingCosts: string;
  notes: string;
  busy: boolean;
  error: string | null;
}

/** Journal docs store exchangeSymbol + exchange; resolve back to the Instrument Master entry. */
function findJournalInstrument(
  instruments: InstrumentDefinition[],
  symbol: string,
  exchange: ExchangeCode
): InstrumentDefinition | undefined {
  return instruments.find((i) => i.exchangeSymbol === symbol && i.exchange === exchange);
}

interface JournalAnalyticsResponse {
  totalClosedTrades: number;
  openTrades: number;
  netRealizedPnl: number;
  totalCosts: number;
  winRatePct: number;
  profitFactor: number | null;
  expectancyUsd: number;
  averageWinnerUsd: number;
  averageLoserUsd: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  maxDrawdownUsd: number;
  byStrategy: Array<{ key: string; trades: number; netPnl: number; winRatePct: number }>;
}

export function TradeJournalView() {
  const { user, authReady, signInWithGoogle } = useAuth();
  const { instruments, timeframe } = useTerminal();
  const t = useT();

  const [entries, setEntries] = useState<JournalDoc[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalyticsResponse | null>(null);

  // No pre-filled prices/costs: every number in a journal entry must come from the user (fail-closed).
  const [instrumentId, setInstrumentId] = useState('');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [strategy, setStrategy] = useState('');
  const [tf, setTf] = useState<Timeframe>(timeframe);
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [positionSize, setPositionSize] = useState('1');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [exitPrice, setExitPrice] = useState('');
  const [exitTime, setExitTime] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [tradingCosts, setTradingCosts] = useState('');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<ClosingState | null>(null);

  const selectedInstrument = instruments.find((i) => i.id === instrumentId) ?? null;
  const findSpecFor = (entry: Pick<JournalDoc, 'instrument' | 'exchange'>) =>
    findJournalInstrument(instruments, entry.instrument, entry.exchange)?.specification ?? null;

  // Live preview of the realized result for a CLOSED entry in the log form.
  const formExit: JournalExitResult | null =
    status === 'CLOSED' && selectedInstrument
      ? computeJournalExit(selectedInstrument.specification, {
          direction,
          entryPrice: Number(entryPrice),
          stopLoss: Number(stopLoss),
          exitPrice: exitPrice === '' ? NaN : Number(exitPrice),
          contracts: Math.trunc(Number(positionSize)),
          tradingCosts: tradingCosts === '' ? 0 : Number(tradingCosts),
        })
      : null;

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setEntries([]);
      setAnalytics(null);
      return;
    }

    const q = query(collection(db, 'tradeJournal'), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: JournalDoc[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId),
            instrument: String(data.instrument),
            exchange: data.exchange as ExchangeCode,
            direction: data.direction === 'SHORT' ? 'SHORT' : 'LONG',
            strategy: String(data.strategy),
            timeframe: data.timeframe as Timeframe,
            entryPrice: Number(data.entryPrice),
            stopLoss: Number(data.stopLoss),
            takeProfit: Number(data.takeProfit),
            positionSize: Number(data.positionSize),
            entryTimestamp: String(data.entryTimestamp),
            exitTimestamp: String(data.exitTimestamp ?? ''),
            exitPrice: Number(data.exitPrice ?? 0),
            realizedPnl: Number(data.realizedPnl ?? 0),
            tradingCosts: Number(data.tradingCosts ?? 0),
            resultInR: Number(data.resultInR ?? 0),
            rationale: String(data.rationale ?? ''),
            notes: String(data.notes ?? ''),
            status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
          };
        });
        setEntries(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'tradeJournal');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    if (entries.length === 0) {
      setAnalytics(null);
      return;
    }
    let cancelled = false;
    void fetch('/api/journal/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: entries.map((e) => ({
          instrument: e.instrument,
          strategy: e.strategy,
          timeframe: e.timeframe,
          realizedPnl: e.realizedPnl,
          tradingCosts: e.tradingCosts,
          resultInR: e.resultInR,
          status: e.status,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setAnalytics(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entries]);

  const handleLogTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.emailVerified) return;
    const inst = selectedInstrument;
    if (!inst) {
      setError(t('jr.selectInst'));
      return;
    }

    const ep = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    const qty = Math.trunc(Number(positionSize));
    const costs = tradingCosts === '' ? 0 : Number(tradingCosts);
    if (!(ep > 0 && sl > 0 && tp > 0 && qty >= 1)) {
      setError(t('jr.invalidInputs'));
      return;
    }
    if (!(costs >= 0)) {
      setError(t('jr.costsNonNeg'));
      return;
    }
    // Entry time: user-entered; for an OPEN trade left blank it is the logging time.
    const entryIso = localDateTimeToIso(entryTime) ?? (status === 'OPEN' ? new Date().toISOString() : null);
    if (!entryIso) {
      setError(t('jr.needEntryTime'));
      return;
    }
    let exitIso = '';
    let closed: Extract<JournalExitResult, { ok: true }> | null = null;
    if (status === 'CLOSED') {
      const iso = localDateTimeToIso(exitTime);
      if (!iso) {
        setError(t('jr.needExitTime'));
        return;
      }
      if (Date.parse(iso) < Date.parse(entryIso)) {
        setError(t('jr.exitBeforeEntry'));
        return;
      }
      if (!formExit || !formExit.ok) {
        setError(formExit && !formExit.ok ? formExit.reason : t('jr.needExitPrice'));
        return;
      }
      exitIso = iso;
      closed = formExit;
    }

    setSaving(true);
    setError(null);
    const docId = `jrn_${Date.now()}`;
    const docPath = `tradeJournal/${docId}`;

    try {
      await setDoc(doc(db, 'tradeJournal', docId), {
        userId: user.uid,
        instrument: inst.exchangeSymbol,
        exchange: inst.exchange,
        direction,
        strategy: strategy.trim() || 'DISCRETIONARY',
        timeframe: tf,
        entryPrice: ep,
        stopLoss: sl,
        takeProfit: tp,
        positionSize: qty,
        entryTimestamp: entryIso,
        exitTimestamp: closed ? exitIso : '',
        exitPrice: closed ? Number(exitPrice) : 0,
        realizedPnl: closed ? closed.realizedPnl : 0,
        tradingCosts: costs,
        resultInR: closed ? closed.resultInR : 0,
        rationale: rationale.trim().slice(0, 1000),
        notes: '',
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRationale('');
      setExitPrice('');
      setExitTime('');
      setEntryTime('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, docPath);
      } catch (wrapped) {
        setError(wrapped instanceof Error ? wrapped.message : t('jr.logFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const closingEntry = closing ? entries.find((e) => e.id === closing.id) ?? null : null;
  const closingExit: JournalExitResult | null =
    closing && closingEntry
      ? computeJournalExit(findSpecFor(closingEntry), {
          direction: closingEntry.direction,
          entryPrice: closingEntry.entryPrice,
          stopLoss: closingEntry.stopLoss,
          exitPrice: closing.exitPrice === '' ? NaN : Number(closing.exitPrice),
          contracts: closingEntry.positionSize,
          tradingCosts: closing.tradingCosts === '' ? 0 : Number(closing.tradingCosts),
        })
      : null;

  // Close = record the actual exit. Fields written match the firestore.rules CLOSE transition:
  // status, exitTimestamp, exitPrice, realizedPnl, tradingCosts, resultInR, notes, updatedAt.
  const handleCloseEntry = async () => {
    if (!closing || !closingEntry || closingEntry.status === 'CLOSED') return;
    const exitIso = localDateTimeToIso(closing.exitTime);
    if (!exitIso) {
      setClosing({ ...closing, error: t('jr.needExitTimeShort') });
      return;
    }
    if (Date.parse(exitIso) < Date.parse(closingEntry.entryTimestamp)) {
      setClosing({ ...closing, error: t('jr.exitBeforeEntry') });
      return;
    }
    if (!closingExit || !closingExit.ok) {
      setClosing({ ...closing, error: closingExit && !closingExit.ok ? closingExit.reason : t('jr.needExitPrice') });
      return;
    }
    const docPath = `tradeJournal/${closingEntry.id}`;
    setClosing({ ...closing, busy: true, error: null });
    try {
      await updateDoc(doc(db, 'tradeJournal', closingEntry.id), {
        status: 'CLOSED',
        exitTimestamp: exitIso,
        exitPrice: Number(closing.exitPrice),
        realizedPnl: closingExit.realizedPnl,
        tradingCosts: closing.tradingCosts === '' ? 0 : Number(closing.tradingCosts),
        resultInR: closingExit.resultInR,
        notes: closing.notes.trim().slice(0, 1000),
        updatedAt: serverTimestamp(),
      });
      setClosing(null);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, docPath);
      } catch (wrapped) {
        setClosing((c) => (c ? { ...c, busy: false, error: wrapped instanceof Error ? wrapped.message : t('jr.closeFailed') } : c));
      }
    }
  };

  const handleDelete = async (entry: JournalDoc) => {
    const docPath = `tradeJournal/${entry.id}`;
    try {
      await deleteDoc(doc(db, 'tradeJournal', entry.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('jr.titleGuest')}</h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('jr.subtitleGuest')}
          </p>
        </div>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-[var(--accent)] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('jr.signInTitle')}</h2>
          <p className="text-xs text-[var(--text)]/65 max-w-md mx-auto">
            {t('jr.signInBody')}
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('jr.signInGoogle')}</span>
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('jr.title')}</h1>
        <p className="text-sm text-[var(--text)]/65 mt-1">
          {t('jr.subtitle')}
        </p>
      </div>

      {/* Analytics Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-mono tabular-nums">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.netPnl')}</span>
          <span className={`text-base font-bold ${(analytics?.netRealizedPnl ?? 0) >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
            ${fmtFixed(analytics?.netRealizedPnl ?? 0, 2)}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.winRate')}</span>
          <span className="text-base font-bold text-[var(--text-strong)]">
            {fmtFixed(analytics?.winRatePct ?? 0, 1)}%
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.profitFactor')}</span>
          <span className="text-base font-bold text-[var(--text-strong)]">
            {analytics?.profitFactor !== null && analytics?.profitFactor !== undefined
              ? fmtFixed(analytics.profitFactor, 2)
              : t('common.na')}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.expectancy')}</span>
          <span className="text-base font-bold text-[var(--text-strong)]">
            ${fmtFixed(analytics?.expectancyUsd ?? 0, 2)}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.maxDd')}</span>
          <span className="text-base font-bold text-[var(--negative)]">
            ${fmtFixed(analytics?.maxDrawdownUsd ?? 0, 2)}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
          <span className="text-[var(--text)]/55 font-sans block">{t('jr.closedOpen')}</span>
          <span className="text-base font-bold text-[var(--text-strong)]">
            {analytics?.totalClosedTrades ?? 0} / {analytics?.openTrades ?? 0}
          </span>
        </div>
      </section>

      {/* Log Trade Entry Form */}
      <form
        onSubmit={(e) => void handleLogTrade(e)}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('jr.logEntry')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label htmlFor="jrn-sym" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('jr.instrument')}
            </label>
            <select
              id="jrn-sym"
              value={instrumentId}
              onChange={(e) => setInstrumentId(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            >
              <option value="">{t('jr.selectPh')}</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.exchange}:{i.exchangeSymbol} · {i.productName} ({i.specification.verificationStatus === 'VERIFIED' ? t('verify.VERIFIED') : i.specification.verificationStatus === 'UNVERIFIED' ? t('verify.UNVERIFIED') : i.specification.verificationStatus})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jrn-dir" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('jr.dirTf')}
            </label>
            <div className="flex gap-1.5">
              <select
                id="jrn-dir"
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'LONG' | 'SHORT')}
                className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-2 text-xs font-mono text-[var(--text-strong)]"
              >
                <option value="LONG">{t('jr.dir.LONG')}</option>
                <option value="SHORT">{t('jr.dir.SHORT')}</option>
              </select>
              <select
                aria-label={t('jr.timeframe')}
                value={tf}
                onChange={(e) => setTf(e.target.value as Timeframe)}
                className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2 py-2 text-xs font-mono text-[var(--text-strong)]"
              >
                {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as Timeframe[]).map((x) => (
                  <option key={x} value={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="jrn-strat" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('jr.strategyTag')}
            </label>
            <input
              id="jrn-strat"
              type="text"
              value={strategy}
              placeholder={t('jr.strategyPh')}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
          <div>
            <label htmlFor="jrn-entry" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('jr.entrySlTp')}
            </label>
            <div className="flex gap-1">
              <input
                id="jrn-entry"
                type="number"
                step="any"
                placeholder={t('jr.entryPh')}
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
              <input
                aria-label={t('term.stopLoss')}
                type="number"
                step="any"
                placeholder={t('jr.slPh')}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
              <input
                aria-label={t('term.takeProfit')}
                type="number"
                step="any"
                placeholder={t('jr.tpPh')}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
            </div>
          </div>
          <div>
            <label htmlFor="jrn-size" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('jr.sizeStatus')}
            </label>
            <div className="flex gap-1.5">
              <input
                id="jrn-size"
                type="number"
                min="1"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
              <select
                aria-label={t('jr.tradeStatus')}
                value={status}
                onChange={(e) => setStatus(e.target.value as 'OPEN' | 'CLOSED')}
                className="w-1/2 bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-2 text-xs font-mono text-[var(--text-strong)]"
              >
                <option value="OPEN">{t('jr.status.OPEN')}</option>
                <option value="CLOSED">{t('jr.status.CLOSED')}</option>
              </select>
            </div>
          </div>
          <div>
            <span className="block text-xs text-[var(--text)]/65 mb-1">{t('jr.computed')}</span>
            <div className="text-xs font-mono py-2 text-[var(--text)]/80" aria-live="polite">
              {status === 'OPEN'
                ? t('jr.openTrade')
                : formExit?.ok
                  ? `${fmtFixed(formExit.realizedPnl, 2)} ${formExit.currency} · ${fmtFixed(formExit.resultInR, 2)}R`
                  : t('jr.needsExit')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-center">
          <input
            type="datetime-local"
            aria-label={t('jr.entryTime')}
            title={t('jr.entryTimeTitle')}
            value={entryTime}
            onChange={(e) => setEntryTime(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)]"
          />
          <input
            type="number"
            step="any"
            min="0"
            aria-label={t('jr.exitPrice')}
            placeholder={t('jr.exitPrice')}
            disabled={status === 'OPEN'}
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)] disabled:opacity-40"
          />
          <input
            type="datetime-local"
            aria-label={t('jr.exitTime')}
            disabled={status === 'OPEN'}
            value={exitTime}
            onChange={(e) => setExitTime(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)] disabled:opacity-40"
          />
          <input
            type="number"
            step="any"
            min="0"
            aria-label={t('jr.costs')}
            placeholder={t('jr.costsPh')}
            value={tradingCosts}
            onChange={(e) => setTradingCosts(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)]"
          />
          <input
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder={t('jr.rationalePh')}
            maxLength={1000}
            className="sm:col-span-2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs text-[var(--text-strong)]"
          />
        </div>

        {status === 'CLOSED' && formExit && !formExit.ok && (
          <p className="text-xs font-mono text-[var(--warning)]">{formExit.reason}</p>
        )}
        {status === 'CLOSED' &&
          formExit?.ok &&
          formExit.warnings.map((w) => (
            <p key={w} className="text-xs font-mono text-[var(--warning)]">
              {w}
            </p>
          ))}
        <p className="text-[11px] text-[var(--text)]/45">
          {t('jr.formula')}
        </p>
        {error && <p className="text-xs font-mono text-[var(--negative)]">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? t('jr.logging') : t('jr.save')}</span>
          </button>
        </div>
      </form>

      {/* Journal Ledger Table */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('jr.entries', { n: entries.length })}</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{t('jr.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                  <th className="py-2.5 px-4">{t('jr.col.symbol')}</th>
                  <th className="py-2.5 px-3">{t('jr.col.strategy')}</th>
                  <th className="py-2.5 px-3">{t('jr.col.dirTf')}</th>
                  <th className="py-2.5 px-3 text-right">{t('jr.col.size')}</th>
                  <th className="py-2.5 px-3 text-right">{t('jr.col.netPnl')}</th>
                  <th className="py-2.5 px-3 text-right">R</th>
                  <th className="py-2.5 px-3">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-right">{t('jr.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs font-mono tabular-nums">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 px-4 text-[var(--text-strong)]">{e.instrument}</td>
                    <td className="py-2.5 px-3 text-[var(--text)]/85">{e.strategy}</td>
                    <td className={`py-2.5 px-3 ${e.direction === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                      {t(`jr.dir.${e.direction}`)} · {e.timeframe}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-strong)]">{e.positionSize}</td>
                    <td className={`py-2.5 px-3 text-right ${e.realizedPnl >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                      ${fmtFixed(e.realizedPnl, 2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-strong)]">{fmtFixed(e.resultInR, 2)}R</td>
                    <td className="py-2.5 px-3 text-[var(--text)]">{t(`jr.status.${e.status}`)}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {e.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() =>
                            setClosing({
                              id: e.id,
                              exitPrice: '',
                              exitTime: '',
                              tradingCosts: String(e.tradingCosts),
                              notes: e.notes,
                              busy: false,
                              error: null,
                            })
                          }
                          className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[11px] text-[var(--text-strong)]"
                        >
                          {t('jr.close')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDelete(e)}
                        aria-label={t('jr.deleteEntry')}
                        className="p-1 text-[var(--negative)] hover:bg-[var(--negative)]/15 rounded inline-flex align-middle"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {closing && closingEntry && (
        <section aria-label={t('jr.closeSection')} className="bg-[var(--surface)] border border-[var(--accent)]/50 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">
            {t('jr.closeTitle', {
              sym: closingEntry.instrument,
              dir: closingEntry.direction,
              n: closingEntry.positionSize,
              entry: fmtNum(closingEntry.entryPrice),
              stop: fmtNum(closingEntry.stopLoss),
            })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="number"
              step="any"
              min="0"
              aria-label={t('jr.closeExitPrice')}
              placeholder={t('jr.exitPrice')}
              value={closing.exitPrice}
              onChange={(ev) => setClosing({ ...closing, exitPrice: ev.target.value, error: null })}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="datetime-local"
              aria-label={t('jr.closeExitTime')}
              value={closing.exitTime}
              onChange={(ev) => setClosing({ ...closing, exitTime: ev.target.value, error: null })}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="number"
              step="any"
              min="0"
              aria-label={t('jr.closeCosts')}
              placeholder={t('jr.costs')}
              value={closing.tradingCosts}
              onChange={(ev) => setClosing({ ...closing, tradingCosts: ev.target.value, error: null })}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="text"
              aria-label={t('jr.closeNotes')}
              placeholder={t('jr.postNotesPh')}
              maxLength={1000}
              value={closing.notes}
              onChange={(ev) => setClosing({ ...closing, notes: ev.target.value })}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs text-[var(--text-strong)]"
            />
          </div>
          <p className="text-xs font-mono text-[var(--text)]/80" aria-live="polite">
            {closingExit?.ok
              ? t('jr.realized', {
                  pnl: fmtFixed(closingExit.realizedPnl, 2),
                  cur: closingExit.currency,
                  gross: fmtFixed(closingExit.grossPnl, 2),
                  r: fmtFixed(closingExit.resultInR, 2),
                })
              : closingExit && closing.exitPrice !== ''
                ? closingExit.reason
                : t('jr.enterExit')}
          </p>
          {closingExit?.ok &&
            closingExit.warnings.map((w) => (
              <p key={w} className="text-xs font-mono text-[var(--warning)]">
                {w}
              </p>
            ))}
          {closing.error && <p className="text-xs font-mono text-[var(--negative)]">{closing.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setClosing(null)}
              className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs text-[var(--text)]/80"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={closing.busy || !closingExit?.ok || !closing.exitTime}
              onClick={() => void handleCloseEntry()}
              className="px-3 py-1.5 bg-[var(--accent)] rounded-md text-xs text-white disabled:opacity-40"
            >
              {closing.busy ? t('jr.savingClose') : t('jr.recordExit')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
