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
import { handleFirestoreError, OperationType } from '../../firebase';
import { db } from '../../firestoreDb';
import type { ExchangeCode, ProductCategory } from '../../shared/types/instrument';
import { fmtFixed, fmtInt, fmtNum, useT } from '../../i18n';

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
  const t = useT();

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
      setError(t('pf.selectInst'));
      return;
    }

    const entry = Number(entryPrice);
    const sl = Number(stopLoss);
    const tp = Number(takeProfit);
    const qty = Math.trunc(Number(contracts));

    if (!(entry > 0 && sl > 0 && tp > 0 && qty >= 1)) {
      setError(t('pf.invalidInputs'));
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
        setError(t('pf.noVerifiedMargin'));
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
        setError(wrapped instanceof Error ? wrapped.message : t('pf.saveFailed'));
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
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('pf.title')}</h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('pf.subtitleGuest')}
          </p>
        </div>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-8 text-center space-y-3">
          <Briefcase className="w-8 h-8 text-[var(--accent)] mx-auto" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('pf.signInTitle')}</h2>
          <p className="text-xs text-[var(--text)]/65 max-w-md mx-auto">
            {t('pf.signInBody')}
          </p>
          <button
            type="button"
            data-signin="" onClick={() => void signInWithGoogle()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md"
          >
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('pf.signInGoogle')}</span>
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('pf.title')}</h2>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('pf.subtitle')}
          </p>
        </div>
      </div>

      {/* Deterministic Exposure Metrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono tabular-nums">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-[var(--text)]/55 font-sans block">{t('pf.openPositions')}</span>
          <span className="text-xl font-bold text-[var(--text-strong)] mt-1 block">
            {analysis?.openPositionCount ?? 0}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-[var(--text)]/55 font-sans block">{t('pf.openRisk')}</span>
          <span className="text-xl font-bold text-[var(--negative)] mt-1 block">
            ${fmtFixed(analysis?.totalEstimatedRiskUsd ?? 0, 2)}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-[var(--text)]/55 font-sans block">{t('pf.verifiedMargin')}</span>
          <span className="text-xl font-bold text-[var(--positive)] mt-1 block">
            ${fmtFixed(analysis?.verifiedMarginUsd ?? 0, 2)}
          </span>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
          <span className="text-[var(--text)]/55 font-sans block">{t('pf.userMargin')}</span>
          <span className="text-xl font-bold text-[var(--warning)] mt-1 block">
            ${fmtFixed(analysis?.unverifiedMarginUsd ?? 0, 2)}
          </span>
        </div>
      </section>

      {analysis && analysis.correlationWarnings.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--warning)]/40 rounded-lg p-4 text-xs space-y-1">
          <p className="font-mono font-semibold text-[var(--warning)]">{t('pf.warnings')}</p>
          {analysis.correlationWarnings.map((w, i) => (
            <p key={i} className="text-[var(--text)]/85">{w}</p>
          ))}
        </div>
      )}

      {/* Add Manual Position Form */}
      <form
        onSubmit={(e) => void handleAddPosition(e)}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4"
      >
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('pf.record')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
          <div className="lg:col-span-2">
            <label htmlFor="pos-inst" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('pf.instrument')}
            </label>
            <select
              id="pos-inst"
              value={selectedInstId}
              onChange={(e) => setSelectedInstId(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            >
              <option value="">{t('pf.selectPh')}</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.productName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pos-dir" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('pf.direction')}
            </label>
            <select
              id="pos-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'LONG' | 'SHORT')}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            >
              <option value="LONG">{t('pf.dir.LONG')}</option>
              <option value="SHORT">{t('pf.dir.SHORT')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="pos-qty" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('pf.contracts')}
            </label>
            <input
              id="pos-qty"
              type="number"
              min="1"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
          <div>
            <label htmlFor="pos-entry" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('pf.entrySlTp')}
            </label>
            <div className="flex gap-1">
              <input
                id="pos-entry"
                type="number"
                step="any"
                placeholder={t('pf.entryPh')}
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
              <input
                aria-label={t('term.stopLoss')}
                type="number"
                step="any"
                placeholder={t('pf.slPh')}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
              <input
                aria-label={t('term.takeProfit')}
                type="number"
                step="any"
                placeholder={t('pf.tpPh')}
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                className="w-1/3 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
            </div>
          </div>
          <div>
            <label htmlFor="pos-margin" className="block text-xs text-[var(--text)]/65 mb-1">
              {verifiedMarginPerContract !== null ? t('pf.marginVerifiedLabel') : t('pf.marginUserLabel')}
            </label>
            {verifiedMarginPerContract !== null ? (
              <p id="pos-margin" className="py-2 text-xs font-mono text-[var(--positive)]">
                {t('pf.marginPerCtr', { v: fmtNum(verifiedMarginPerContract) })}
              </p>
            ) : (
              <input
                id="pos-margin"
                type="number"
                min="0"
                step="any"
                placeholder={t('pf.marginPh')}
                title={t('pf.marginTitle')}
                value={estimatedMargin}
                onChange={(e) => setEstimatedMargin(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? t('pf.saving') : t('pf.add')}</span>
          </button>
        </div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('pf.notesPh')}
          aria-label={t('pf.notesPh')}
          maxLength={500}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-1.5 text-xs text-[var(--text-strong)]"
        />
        {error && <p role="alert" className="text-xs font-mono text-[var(--negative)]">{error}</p>}
      </form>

      {/* Positions Ledger */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('pf.recorded', { n: positions.length })}</h2>
          <span className="text-xs font-mono text-[var(--text)]/50">{t('pf.notSynced')}</span>
        </div>
        {positions.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{t('pf.empty')}</div>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 text-xs text-[var(--text)]/65">
                  <th className="py-2.5 px-4">{t('pf.col.contract')}</th>
                  <th className="py-2.5 px-3">{t('pf.col.dir')}</th>
                  <th className="py-2.5 px-3 text-right">{t('pf.col.qty')}</th>
                  <th className="py-2.5 px-3 text-right">{t('pf.entrySlTp')}</th>
                  <th className="py-2.5 px-3 text-right">{t('pf.col.margin')}</th>
                  <th className="py-2.5 px-3">{t('common.status')}</th>
                  <th className="py-2.5 px-4 text-right">{t('pf.col.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70 text-xs font-mono tabular-nums">
                {positions.map((pos) => (
                  <tr key={pos.id}>
                    <td className="py-2.5 px-4 text-[var(--text-strong)]">
                      {pos.instrumentId} <span className="text-[var(--text)]/55 font-sans">({pos.productName})</span>
                    </td>
                    <td className={`py-2.5 px-3 ${pos.direction === 'LONG' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                      {t(`pf.dir.${pos.direction}`)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-strong)]">{pos.contracts}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--text)]">
                      {fmtNum(pos.entryPrice)} / {fmtNum(pos.stopLoss)} / {fmtNum(pos.takeProfit)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[var(--warning)]">
                      ${fmtInt(pos.estimatedMargin)} ({pos.marginVerified ? t('verify.VERIFIED') : t('pf.userProvided')})
                    </td>
                    <td className="py-2.5 px-3 text-[var(--text)]">{t(`pf.status.${pos.status}`)}</td>
                    <td className="py-2.5 px-4 text-right space-x-2">
                      {pos.status === 'OPEN' && (
                        <button
                          type="button"
                          onClick={() => void handleClosePosition(pos)}
                          className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded text-[11px] text-[var(--text-strong)]"
                        >
                          {t('pf.markClosed')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeletePosition(pos)}
                        aria-label={t('pf.delete')}
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
    </div>
  );
}
