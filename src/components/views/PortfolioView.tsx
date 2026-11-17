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
import { Briefcase, LogIn, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTerminal } from '../../contexts/TerminalContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import type { ExchangeCode, ProductCategory } from '../../shared/types/instrument';

interface PositionRecord {
  id: string;
  userId: string;
  instrumentId: string;
  productName: string;
  category: ProductCategory;
  exchange: ExchangeCode;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  estimatedMargin: number;
  marginVerified: boolean;
  status: 'OPEN' | 'CLOSED';
  notes: string;
}

interface PortfolioAnalysisResponse {
  openPositionCount: number;
  totalEstimatedRiskUsd: number;
  totalEstimatedMarginUsd: number;
  verifiedMarginUsd: number;
  unverifiedMarginUsd: number;
  exposureByProduct: Array<{ key: string; contracts: number; riskUsd: number }>;
  exposureByCategory: Array<{ key: string; contracts: number; riskUsd: number }>;
  exposureByExchange: Array<{ key: string; contracts: number; riskUsd: number }>;
  correlationWarnings: string[];
  brokerSyncNotice: string;
}

export function PortfolioView() {
  const { user, authReady, signInWithGoogle } = useAuth();
  const { instruments } = useTerminal();

  const [positions, setPositions] = useState<PositionRecord[]>([]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysisResponse | null>(null);
  // No pre-filled prices or margin (fail-closed): the user enters every number.
  const [selectedInstId, setSelectedInstId] = useState('');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [contracts, setContracts] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [estimatedMargin, setEstimatedMargin] = useState('');

  const selectedInst = instruments.find((i) => i.id === selectedInstId) ?? null;
  // Per-contract margin from the Instrument Master only when the spec is VERIFIED and in USD.
  const verifiedMarginPerContract =
    selectedInst &&
    selectedInst.specification.verificationStatus === 'VERIFIED' &&
    selectedInst.specification.marginRequirement !== null &&
    selectedInst.specification.marginCurrency === 'USD'
      ? selectedInst.specification.marginRequirement
      : null;
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setPositions([]);
      setAnalysis(null);
      return;
    }

    const q = query(collection(db, 'positions'), where('userId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PositionRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: String(data.userId),
            instrumentId: String(data.instrumentId),
            productName: String(data.productName),
            category: data.category as ProductCategory,
            exchange: data.exchange as ExchangeCode,
            direction: data.direction === 'SHORT' ? 'SHORT' : 'LONG',
            contracts: Number(data.contracts),
            entryPrice: Number(data.entryPrice),
            stopLoss: Number(data.stopLoss),
            takeProfit: Number(data.takeProfit),
            estimatedMargin: Number(data.estimatedMargin),
            marginVerified: Boolean(data.marginVerified),
            status: data.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
            notes: String(data.notes ?? ''),
          };
        });
        setPositions(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'positions');
      }
    );
    return () => unsub();
  }, [authReady, user]);

  useEffect(() => {
    if (positions.length === 0) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    void fetch('/api/portfolio/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positions: positions.map((p) => ({
          id: p.id,
          instrumentId: p.instrumentId,
          productName: p.productName,
          category: p.category,
          exchange: p.exchange,
          direction: p.direction,
          contracts: p.contracts,
          entryPrice: p.entryPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          estimatedMargin: p.estimatedMargin,
          marginVerified: p.marginVerified,
          status: p.status,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setAnalysis(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [positions]);

  const handleAddPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.emailVerified) return;
    const inst = selectedInst;
    if (!inst) {
      setError('Select an instrument.');
      return;
    }

    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    const qty = Math.trunc(Number(contracts));

    if (!(entry > 0 && sl > 0 && tp > 0 && qty >= 1)) {
      setError('Contracts >= 1 and positive Entry / SL / TP prices are required.');
      return;
    }
    // Margin: verified spec x contracts, otherwise the user's own figure (stored marginVerified=false).
    let margin: number;
    let marginVerified: boolean;
    if (verifiedMarginPerContract !== null) {
      margin = verifiedMarginPerContract * qty;
      marginVerified = true;
    } else {
      const userMargin = Number(estimatedMargin);
      if (estimatedMargin.trim() === '' || !(userMargin >= 0)) {
        setError('No verified margin for this instrument — enter your broker margin (USD, total for the position).');
        return;
      }
      margin = userMargin;
      marginVerified = false;
    }

    setSaving(true);
    setError(null);
    const posId = `pos_${Date.now()}`;
    const posPath = `positions/${posId}`;
    try {
      await setDoc(doc(db, 'positions', posId), {
        userId: user.uid,
        instrumentId: inst.id,
        productName: inst.productName.slice(0, 80),
        category: inst.category,
        exchange: inst.exchange,
        direction,
        contracts: qty,
        entryPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
        estimatedMargin: margin,
        marginVerified,
        status: 'OPEN',
        notes: notes.trim().slice(0, 500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotes('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, posPath);
      } catch (wrapped) {
        setError(wrapped instanceof Error ? wrapped.message : 'Failed to save position.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClosePosition = async (pos: PositionRecord) => {
    if (pos.status === 'CLOSED') return;
    const posPath = `positions/${pos.id}`;
    try {
      await updateDoc(doc(db, 'positions', pos.id), {
        status: 'CLOSED',
        notes: pos.notes,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, posPath);
    }
  };

  const handleDeletePosition = async (pos: PositionRecord) => {
    const posPath = `positions/${pos.id}`;
    try {
      await deleteDoc(doc(db, 'positions', pos.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, posPath);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Portfolio & Exposure</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Manual futures position tracking and deterministic exposure analytics. Not synchronized with any live broker.
          </p>
        </div>

        <section className="bg-[#111622] border border-[#263244] rounded-lg p-8 text-center space-y-3">
          <Briefcase className="w-8 h-8 text-[#6366F1] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-white">Sign In Required for Private Portfolio Persistence</h2>
          <p className="text-xs text-[#E5E7EB]/65 max-w-md mx-auto">
            Portfolio positions are stored privately under your verified Firebase account in Cloud Firestore with owner-only security rules.
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Portfolio & Exposure</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Manual position ledger stored in Cloud Firestore. Not broker-synced; exchange margin values marked ESTIMATED unless clearing-verified.
          </p>
        </div>
      </div>

      {/* Deterministic Exposure Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4">
          <span className="text-[#E5E7EB]/55 font-sans block">Open Positions</span>
          <span className="text-xl font-bold text-white mt-1 block">
            {analysis?.openPositionCount ?? 0}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4">
          <span className="text-[#E5E7EB]/55 font-sans block">Open Stop-Loss Risk</span>
          <span className="text-xl font-bold text-[#EF4444] mt-1 block">
            ${(analysis?.totalEstimatedRiskUsd ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4">
          <span className="text-[#E5E7EB]/55 font-sans block">Verified Margin</span>
          <span className="text-xl font-bold text-[#22C55E] mt-1 block">
            ${(analysis?.verifiedMarginUsd ?? 0).toFixed(2)}
          </span>
        </div>
        <div className="bg-[#111622] border border-[#263244] rounded-lg p-4">
          <span className="text-[#E5E7EB]/55 font-sans block">User-Estimated Margin</span>
          <span className="text-xl font-bold text-[#F59E0B] mt-1 block">
            ${(analysis?.unverifiedMarginUsd ?? 0).toFixed(2)}
          </span>
        </div>
      </section>

      {analysis && analysis.correlationWarnings.length > 0 && (
        <div className="bg-[#111622] border border-[#F59E0B]/40 rounded-lg p-4 text-xs space-y-1">
          <p className="font-mono font-semibold text-[#F59E0B]">CORRELATION / CONCENTRATION WARNINGS</p>
          {analysis.correlationWarnings.map((w, i) => (
            <p key={i} className="text-[#E5E7EB]/85">{w}</p>
          ))}
        </div>
      )}

      {/* Add Manual Position Form */}
      <form
        onSubmit={(e) => void handleAddPosition(e)}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-4"
      >
        <h2 className="text-sm font-semibold text-white">Record Manual Position</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
          <div className="lg:col-span-2">
            <label htmlFor="pos-inst" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Instrument
            </label>
            <select
              id="pos-inst"
              value={selectedInstId}
              onChange={(e) => setSelectedInstId(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            >
              <option value="">Select instrument…</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.productName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pos-dir" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Direction
            </label>
            <select
              id="pos-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'LONG' | 'SHORT')}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            >
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>
          <div>
            <label htmlFor="pos-qty" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Contracts
            </label>
            <input
              id="pos-qty"
              type="number"
              min="1"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label htmlFor="pos-entry" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Entry / SL / TP
            </label>
            <div className="flex gap-1">
              <input
                id="pos-entry"
                type="number"
                step="any"
                placeholder="Entry"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
              <input
                aria-label="Stop Loss"
                type="number"
                step="any"
                placeholder="SL"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
              <input
                aria-label="Take Profit"
                type="number"
                step="any"
                placeholder="TP"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-1/3 bg-[#0B0E14] border border-[#263244] rounded px-1.5 py-2 text-xs font-mono text-white"
              />
            </div>
          </div>
          <div>
            <label htmlFor="pos-margin" className="block text-xs text-[#E5E7EB]/65 mb-1">
              {verifiedMarginPerContract !== null ? 'Margin (VERIFIED spec)' : 'Margin USD (user-provided)'}
            </label>
            {verifiedMarginPerContract !== null ? (
              <p id="pos-margin" className="py-2 text-xs font-mono text-[#22C55E]">
                {verifiedMarginPerContract} USD x contracts
              </p>
            ) : (
              <input
                id="pos-margin"
                type="number"
                min="0"
                step="any"
                placeholder="Your broker margin"
                title="No verified margin in the Instrument Master — value is stored as user-provided (marginVerified=false)."
                value={estimatedMargin}
                onChange={(e) => setEstimatedMargin(e.target.value)}
                className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Add Position'}</span>
          </button>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional thesis or execution notes..."
          maxLength={500}
          className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-1.5 text-xs text-white"
        />
        {error && <p className="text-xs font-mono text-[#EF4444]">{error}</p>}
      </form>

      {/* Positions Ledger */}
      <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#263244] flex justify-between items-center">
          <h2 className="text-sm font-semibold text-white">Recorded Positions ({positions.length})</h2>
          <span className="text-xs font-mono text-[#E5E7EB]/50">Not Live Broker Synced</span>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[#E5E7EB]/60">No manual positions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[#263244] bg-[#172033]/50 text-xs text-[#E5E7EB]/65">
                  <th className="py-2.5 px-4">Contract</th>
                  <th className="py-2.5 px-3">Dir</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Entry / SL / TP</th>
                  <th className="py-2.5 px-3 text-right">Margin</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#263244]/70 text-xs font-mono tabular-nums">
                {positions.map((pos) => (
                  <tr key={pos.id}>
                    <td className="py-2.5 px-4 text-white">
                      {pos.instrumentId} <span className="text-[#E5E7EB]/55 font-sans">({pos.productName})</span>
                    </td>
                    <td className={`py-2.5 px-3 ${pos.direction === 'LONG' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                      {pos.direction}
                    </td>
                    <td className="py-2.5 px-3 text-right text-white">{pos.contracts}</td>
                    <td className="py-2.5 px-3 text-right text-[#E5E7EB]">
                      {pos.entryPrice} / {pos.stopLoss} / {pos.takeProfit}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#F59E0B]">
                      ${pos.estimatedMargin.toFixed(0)} ({pos.marginVerified ? 'VERIFIED' : 'USER_PROVIDED'})
                    </td>
                    <td className="py-2.5 px-3 text-[#E5E7EB]">{pos.status}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {pos.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => void handleClosePosition(pos)}
                          className="px-2 py-1 bg-[#172033] border border-[#263244] rounded text-[11px] text-white"
                        >
                          Mark Closed
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeletePosition(pos)}
                        aria-label="Delete position"
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
