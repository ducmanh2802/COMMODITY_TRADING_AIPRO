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
import type { ExchangeCode, Timeframe } from '../../shared/types/instrument';

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

  const [entries, setEntries] = useState<JournalDoc[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalyticsResponse | null>(null);

  const [instrument, setInstrument] = useState('GC');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [strategy, setStrategy] = useState('TREND_FOLLOWING');
  const [tf, setTf] = useState<Timeframe>(timeframe);
  const [entryPrice, setEntryPrice] = useState('2350');
  const [stopLoss, setStopLoss] = useState('2335');
  const [takeProfit, setTakeProfit] = useState('2385');
  const [positionSize, setPositionSize] = useState('1');
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [exitPrice, setExitPrice] = useState('2380');
  const [realizedPnl, setRealizedPnl] = useState('2995');
  const [tradingCosts, setTradingCosts] = useState('5');
  const [resultInR, setResultInR] = useState('2.0');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const inst = instruments.find((i) => i.exchangeSymbol === instrument) ?? instruments[0];
    if (!inst) return;

    const ep = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    const qty = Math.trunc(Number(positionSize));
    if (!(ep > 0 && sl > 0 && tp > 0 && qty >= 1)) {
      setError('Entry, SL, TP must be positive and position size >= 1.');
      return;
    }

    setSaving(true);
    setError(null);
    const nowIso = new Date().toISOString();
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
        entryTimestamp: nowIso,
        exitTimestamp: status === 'CLOSED' ? nowIso : '',
        exitPrice: status === 'CLOSED' ? Math.max(0, Number(exitPrice) || 0) : 0,
        realizedPnl: status === 'CLOSED' ? Number(realizedPnl) || 0 : 0,
        tradingCosts: Math.max(0, Number(tradingCosts) || 0),
        resultInR: status === 'CLOSED' ? Number(resultInR) || 0 : 0,
        rationale: rationale.trim().slice(0, 1000),
        notes: '',
        status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRationale('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, docPath);
      } catch (wrapped) {
        setError(wrapped instanceof Error ? wrapped.message : 'Failed to log trade.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCloseEntry = async (entry: JournalDoc) => {
    if (entry.status === 'CLOSED') return;
    const docPath = `tradeJournal/${entry.id}`;
    try {
      await updateDoc(doc(db, 'tradeJournal', entry.id), {
        status: 'CLOSED',
        exitTimestamp: new Date().toISOString(),
        exitPrice: entry.takeProfit,
        realizedPnl: 0,
        tradingCosts: entry.tradingCosts,
        resultInR: 0,
        notes: entry.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
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
          <h1 className="text-xl font-semibold text-white tracking-tight">Trade Journal & Analytics</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Private, owner-isolated futures trade journal with deterministic win rate, expectancy, and attribution.
          </p>
        </div>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-[#6366F1] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">Sign In Required for Trade Journal</h2>
          <p className="text-xs text-[#E5E7EB]/65 max-w-md mx-auto">
            Journal entries persist strictly under your authenticated Firebase UID in Cloud Firestore.
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign In with Google</span>
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Trade Journal & Attribution</h1>
        <p className="text-sm text-[#E5E7EB]/65 mt-1">
          Log executed trades, track R-multiples, and compute deterministic expectancy and strategy attribution.
        </p>
      </div>

      {/* Analytics Strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-xs font-mono tabular-nums">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Net Realized PnL</span>
          <span className={`text-base font-bold ${(analytics?.netRealizedPnl ?? 0) >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
            ${(analytics?.netRealizedPnl ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Win Rate</span>
          <span className="text-base font-bold text-white">
            {(analytics?.winRatePct ?? 0).toFixed(1)}%
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Profit Factor</span>
          <span className="text-base font-bold text-white">
            {analytics?.profitFactor !== null && analytics?.profitFactor !== undefined
              ? analytics.profitFactor.toFixed(2)
              : 'N/A'}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Expectancy</span>
          <span className="text-base font-bold text-white">
            ${(analytics?.expectancyUsd ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Max Drawdown</span>
          <span className="text-base font-bold text-[#EF4444]">
            ${(analytics?.maxDrawdownUsd ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-3">
          <span className="text-[#E5E7EB]/55 font-sans block">Closed / Open</span>
          <span className="text-base font-bold text-white">
            {analytics?.totalClosedTrades ?? 0} / {analytics?.openTrades ?? 0}
          </span>
        </div>
      </section>

      {/* Log Trade Entry Form */}
      <form
        onSubmit={(e) => void handleLogTrade(e)}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
      >
        <h2 className="text-sm font-semibold text-white">Log Trade Entry</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label htmlFor="jrn-sym" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Instrument
            </label>
            <select
              id="jrn-sym"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            >
              {instruments.map((i) => (
                <option key={i.id} value={i.exchangeSymbol}>
                  {i.exchangeSymbol} · {i.productName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="jrn-dir" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Direction & TF
            </label>
            <div className="flex gap-1.5">
              <select
                id="jrn-dir"
                value={direction}
                onChange={(e) => setDirection(e.target.value as 'LONG' | 'SHORT')}
                className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded-md px-2 py-2 text-xs font-mono text-white"
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </select>
              <select
                aria-label="Timeframe"
                value={tf}
                onChange={(e) => setTf(e.target.value as Timeframe)}
                className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded-md px-2 py-2 text-xs font-mono text-white"
              >
                {(['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as Timeframe[]).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="jrn-strat" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Strategy Tag
            </label>
            <input
              id="jrn-strat"
              type="text"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label htmlFor="jrn-entry" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Entry / SL / TP
            </label>
            <div className="flex gap-1">
              <input
                id="jrn-entry"
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
              <input
                aria-label="Stop loss"
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
              <input
                aria-label="Take profit"
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>
          <div>
            <label htmlFor="jrn-size" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Size / Status
            </label>
            <div className="flex gap-1.5">
              <input
                id="jrn-size"
                type="number"
                min="1"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded px-2 py-2 text-xs font-mono text-white"
              />
              <select
                aria-label="Trade status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'OPEN' | 'CLOSED')}
                className="w-1/2 bg-[#0B0E14] border border-[#263244] rounded px-2 py-2 text-xs font-mono text-white"
              >
                <option value="CLOSED">CLOSED</option>
                <option value="OPEN">OPEN</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="jrn-pnl" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Net PnL ($) / R
            </label>
            <div className="flex gap-1.5">
              <input
                id="jrn-pnl"
                type="number"
                step="any"
                disabled={status === 'OPEN'}
                value={realizedPnl}
                onChange={(e) => setRealizedPnl(e.target.value)}
                className="w-2/3 bg-[#0B0E14] border border-[#263244] rounded px-2 py-2 text-xs font-mono text-white disabled:opacity-40"
              />
              <input
                aria-label="Result in R"
                type="number"
                step="0.1"
                disabled={status === 'OPEN'}
                value={resultInR}
                onChange={(e) => setResultInR(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-2 py-2 text-xs font-mono text-white disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
          <input
            type="number"
            step="any"
            min="0"
            aria-label="Exit price"
            placeholder="Exit price"
            disabled={status === 'OPEN'}
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            className="bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-1.5 text-xs font-mono text-white disabled:opacity-40"
          />
          <input
            type="number"
            step="any"
            min="0"
            aria-label="Trading costs"
            placeholder="Trading costs ($)"
            value={tradingCosts}
            onChange={(e) => setTradingCosts(e.target.value)}
            className="bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-1.5 text-xs font-mono text-white"
          />
          <input
            type="text"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Setup rationale & post-trade notes..."
            maxLength={1000}
            className="sm:col-span-2 bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-1.5 text-xs text-white"
          />
        </div>

        {error && <p className="text-xs font-mono text-[#EF4444]">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'Logging...' : 'Save Journal Entry'}</span>
          </button>
        </div>
      </form>

      {/* Journal Ledger Table */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#263244]">
          <h2 className="text-sm font-semibold text-white">Journal Entries ({entries.length})</h2>
        </div>
        {entries.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[#E5E7EB]/60">No journal entries logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                  <th className="py-2.5 px-4">Symbol</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Dir / TF</th>
                  <th className="py-2.5 px-3 text-right">Size</th>
                  <th className="py-2.5 px-3 text-right">Net PnL</th>
                  <th className="py-2.5 px-3 text-right">R</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs font-mono tabular-nums">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 px-4 text-white">{e.instrument}</td>
                    <td className="py-2.5 px-3 text-[#E5E7EB]/85">{e.strategy}</td>
                    <td className={`py-2.5 px-3 ${e.direction === 'LONG' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      {e.direction} · {e.timeframe}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white">{e.positionSize}</td>
                    <td className={`py-2.5 px-3 text-right ${e.realizedPnl >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      ${e.realizedPnl.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white">{e.resultInR.toFixed(2)}R</td>
                    <td className="py-2.5 px-3 text-[#E5E7EB]">{e.status}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {e.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => void handleCloseEntry(e)}
                          className="px-2 py-1 bg-[#172033] border border-[#263244] rounded text-[11px] text-white"
                        >
                          Close
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDelete(e)}
                        aria-label="Delete entry"
                        className="p-1 text-[#EF4444] hover:bg-[#EF4444]/15 rounded inline-flex align-middle"
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
    </div>
  );
}
