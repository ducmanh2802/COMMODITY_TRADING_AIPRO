import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AlertTriangle, GraduationCap, LogIn } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useTerminal } from '../../../contexts/TerminalContext';
import { db } from '../../../firebase';
import { fmtDateTime, fmtFixed, fmtInt, useT, type TKey } from '../../../i18n';
import {
  DEFAULT_CAPITAL_VND,
  accountSnapshot,
  balanceAfterClose,
  checkOrder,
  checkQuoteTradable,
  computeClose,
  contractValueUsd,
  fillPrice,
  marginPerContractUsd,
  pnlBreakdown,
  runAutoClose,
  unrealisedUsd,
  validateSpec,
  type OrderCheck,
  type PaperSettings,
  type PricedPosition,
  type Side,
  type ValidSpec,
} from './paperMath';
import {
  PAPER_LIMITS,
  closeOps,
  closeSessionOps,
  deleteSessionOps,
  newPaperId,
  newSession,
  openOps,
  resetSessionOps,
  sanitizeSettings,
  validateCapital,
  validateSessionName,
  type PaperPosition,
  type PaperSession,
} from './paperModel';
import { SessionHistory } from './SessionHistory';
import { SessionReport, type NoteOption } from './SessionReport';
import { Stat, bigBtn, cardCls, fmtPct, fmtVnd, inputCls, labelCls, pnlColor, signedVnd } from './paperUi';
import { usePaperStore } from './usePaperStore';

interface FxState {
  rate: number | null;
  asOf: string | null;
}

/** Vietcombank posted USD/VND (UNOFFICIAL), refreshed every 5 minutes. */
function useVcbRate(): FxState {
  const [fx, setFx] = useState<FxState>({ rate: null, asOf: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/macro/fx');
        if (!res.ok) return;
        const json = (await res.json()) as { items?: { id: string; value: number | null; status: string; asOf: string | null }[] };
        const item = json.items?.find((i) => i.id === 'USDVND_VCB');
        if (alive && item && typeof item.value === 'number' && item.value > 0 && item.status !== 'UNAVAILABLE' && item.status !== 'INVALID') {
          setFx({ rate: item.value, asOf: item.asOf });
        }
      } catch {
        /* keep previous */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 300_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return fx;
}

/** Research notes of the signed-in owner, for linking a trade journal to a note (cloud mode only). */
function useNoteOptions(enabled: boolean, uid: string | null): NoteOption[] {
  const [notes, setNotes] = useState<NoteOption[]>([]);
  useEffect(() => {
    if (!enabled || !uid) {
      setNotes([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'researchNotes'), where('userId', '==', uid)),
      (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? d.id), instrumentId: String(d.data().instrumentId ?? '') }))),
      () => setNotes([])
    );
  }, [enabled, uid]);
  return notes;
}

const numOrNull = (s: string): number | null | 'bad' => {
  const v = s.trim();
  if (v === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 'bad';
};

interface PendingOrder {
  instId: string;
  side: Side;
  contracts: number;
  quote: number;
  fill: number;
  stopLoss: number | null;
  takeProfit: number | null;
  explicitMarginUsd: number | null;
  check: Extract<OrderCheck, { ok: true }>;
  delayed: boolean;
}

/** T58 "Giao dịch thử": paper trading with virtual money in practice sessions. LEARNING ONLY — no broker. */
export function PaperTradingView() {
  const t = useT();
  const { user, signInWithGoogle } = useAuth();
  const { instruments, quotesBySymbol, refreshQuotes } = useTerminal();
  const store = usePaperStore();
  const { state, dispatch } = store;
  const cloud = store.mode === 'cloud';
  const vcb = useVcbRate();
  const notes = useNoteOptions(cloud, user?.uid ?? null);

  const [tab, setTab] = useState<'trade' | 'history'>('trade');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importDismissed, setImportDismissed] = useState(false);
  const [manualFx, setManualFx] = useState('');

  // new-session form
  const [newName, setNewName] = useState(() => t('pt.session.defaultName', { date: new Date().toLocaleDateString('vi-VN') }));
  const [newCapital, setNewCapital] = useState(String(DEFAULT_CAPITAL_VND));
  const [formError, setFormError] = useState<string | null>(null);

  // order form
  const [instId, setInstId] = useState('');
  const [side, setSide] = useState<Side>('LONG');
  const [qty, setQty] = useState('1');
  const [slText, setSlText] = useState('');
  const [tpText, setTpText] = useState('');
  const [marginText, setMarginText] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrder | null>(null);

  // position editing + settings draft
  const [editPos, setEditPos] = useState<{ id: string; sl: string; tp: string; journal: string; noteId: string } | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<keyof PaperSettings, string> | null>(null);

  const instById = useMemo(() => new Map(instruments.map((i) => [i.id, i])), [instruments]);
  const instrumentName = useCallback((id: string) => {
    const i = instById.get(id);
    return i ? `${i.productName} (${i.exchangeSymbol})` : id;
  }, [instById]);

  const activeSessions = useMemo(() => state.sessions.filter((s) => s.status === 'active').sort((a, b) => b.createdAtMs - a.createdAtMs), [state.sessions]);
  const session = activeSessions.find((s) => s.id === selectedId) ?? activeSessions[0] ?? null;
  const positions = useMemo(() => (session ? state.positions.filter((p) => p.sessionId === session.id) : []), [state.positions, session]);
  const trades = useMemo(() => (session ? state.trades.filter((x) => x.sessionId === session.id) : []), [state.trades, session]);

  const manual = Number(manualFx.replace(',', '.'));
  const fx: number | null = manual > 0 ? manual : vcb.rate;
  const fxForView = fx ?? positions[0]?.entryFxRate ?? 0;

  const priced = useMemo<PricedPosition[]>(() => {
    const out: PricedPosition[] = [];
    for (const p of positions) {
      const inst = instById.get(p.instrumentId);
      const sp = inst ? validateSpec(inst.specification) : null;
      if (!inst || !sp || !sp.ok) continue;
      const gate = checkQuoteTradable(quotesBySymbol[inst.exchangeSymbol]);
      out.push({ pos: p, spec: sp.spec, price: gate.ok ? gate.price : null });
    }
    return out;
  }, [positions, instById, quotesBySymbol]);

  const snap = useMemo(() => (session ? accountSnapshot(session.balanceVnd, priced, fxForView, session.settings) : null), [session, priced, fxForView]);
  const breakdown = useMemo(
    () =>
      session && snap
        ? pnlBreakdown(session.startingCapitalVnd, snap, positions, trades.map((x) => ({ instrumentId: x.instrumentId, pnlVnd: x.pnlVnd, feesVnd: x.feesVnd, rMultiple: x.rMultiple, closedAtMs: x.closedAtMs })))
        : null,
    [session, snap, positions, trades]
  );

  // Automatic stop-loss / take-profit / forced close, evaluated on every quote refresh.
  const autoBusy = useRef(false);
  useEffect(() => {
    if (!session || !fx || autoBusy.current || priced.length === 0 || !store.ready) return;
    const r = runAutoClose(session.balanceVnd, priced, fx, session.settings);
    if (r.closes.length === 0) return;
    autoBusy.current = true;
    const now = Date.now();
    const specs = r.closes.flatMap((c) => {
      const position = positions.find((p) => p.id === c.positionId);
      return position ? [{ position, exitPrice: c.exitPrice, calc: c.calc, reason: c.reason }] : [];
    });
    void dispatch(closeOps(session, specs, r.balanceVnd, fx, now)).then((err) => {
      autoBusy.current = false;
      setMessage(err ?? t('pt.auto.closed', { n: specs.length }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced, fx, session?.balanceVnd, session?.id, store.ready]);

  // ----- selected instrument for the order form
  const inst = instById.get(instId) ?? null;
  const specRes = inst ? validateSpec(inst.specification) : null;
  const gate = inst ? checkQuoteTradable(quotesBySymbol[inst.exchangeSymbol]) : null;

  const createSession = async () => {
    const name = validateSessionName(newName);
    if (name) return setFormError(t(`pt.err.${name}` as TKey));
    const cap = Number(newCapital.replace(/[.,\s]/g, ''));
    if (validateCapital(cap)) return setFormError(t('pt.err.capitalRange', { min: fmtInt(PAPER_LIMITS.capitalMin), max: fmtInt(PAPER_LIMITS.capitalMax) }));
    setFormError(null);
    const s = newSession(newPaperId('ses'), newName, cap);
    const err = await dispatch([{ t: 'sessionCreate', session: s }]);
    if (err) setFormError(err);
    else {
      setSelectedId(s.id);
      setMessage(null);
    }
  };

  const prepareOrder = () => {
    setOrderError(null);
    if (!session || !snap || !inst) return setOrderError(t('pt.err.pickInstrument'));
    if (!specRes || !specRes.ok) return setOrderError(t(`pt.specBlock.${specRes ? specRes.reason : 'NO_SPEC'}` as TKey));
    if (!gate || !gate.ok) return setOrderError(t(`pt.block.${gate ? gate.reason : 'NO_QUOTE'}` as TKey));
    if (!fx) return setOrderError(t('pt.err.noFx'));
    const contracts = Number(qty);
    const sl = numOrNull(slText);
    const tp = numOrNull(tpText);
    const mg = numOrNull(marginText);
    if (sl === 'bad' || tp === 'bad' || mg === 'bad') return setOrderError(t('pt.err.badNumber'));
    const fill = fillPrice(specRes.spec, side, gate.price, session.settings.slippageTicks, true);
    const check = checkOrder(specRes.spec, { side, contracts, fill, stopLoss: sl, takeProfit: tp, explicitMarginUsd: mg }, snap, fx, session.settings);
    if (!check.ok) return setOrderError(t(`pt.order.${check.reason}` as TKey));
    setPending({ instId: inst.id, side, contracts, quote: gate.price, fill, stopLoss: sl, takeProfit: tp, explicitMarginUsd: mg, check, delayed: gate.delayed });
  };

  const confirmOrder = async () => {
    if (!pending || !session || !fx || !specRes || !specRes.ok) return;
    const perContract = marginPerContractUsd(specRes.spec, pending.fill, session.settings.marginPct, pending.explicitMarginUsd);
    const position: PaperPosition = {
      id: newPaperId('pos'),
      sessionId: session.id,
      instrumentId: pending.instId,
      side: pending.side,
      contracts: pending.contracts,
      entryPrice: pending.fill,
      stopLoss: pending.stopLoss,
      takeProfit: pending.takeProfit,
      marginPerContractUsd: perContract,
      entryFeeVnd: pending.check.feeVnd,
      entryFxRate: fx,
      journal: '',
      researchNoteId: '',
      openedAtMs: Date.now(),
    };
    const err = await dispatch(openOps(session, position));
    setPending(null);
    if (err) setOrderError(err);
    else {
      setMessage(t('pt.order.filled'));
      setSlText('');
      setTpText('');
    }
  };

  const closeManually = async (p: PaperPosition) => {
    if (!session) return;
    const pi = priced.find((x) => x.pos.id === p.id);
    const instOfPos = instById.get(p.instrumentId);
    const gateP = instOfPos ? checkQuoteTradable(quotesBySymbol[instOfPos.exchangeSymbol]) : null;
    if (!gateP || !gateP.ok) return setMessage(t(`pt.block.${gateP ? gateP.reason : 'NO_QUOTE'}` as TKey));
    if (!pi) return setMessage(t('pt.block.NO_QUOTE'));
    if (!fx) return setMessage(t('pt.err.noFx'));
    const exit = fillPrice(pi.spec, p.side, gateP.price, session.settings.slippageTicks, false);
    const calc = computeClose(pi.spec, p, exit, fx, session.settings);
    if (!window.confirm(t('pt.close.confirm', { price: fmtFixed(exit, 2), pnl: signedVnd(calc.pnlVnd) }))) return;
    const err = await dispatch(closeOps(session, [{ position: p, exitPrice: exit, calc, reason: 'MANUAL' }], balanceAfterClose(session.balanceVnd, p, calc), fx, Date.now()));
    setMessage(err ?? t('pt.close.done'));
  };

  const savePosition = async () => {
    if (!editPos) return;
    const sl = numOrNull(editPos.sl);
    const tp = numOrNull(editPos.tp);
    if (sl === 'bad' || tp === 'bad') return setMessage(t('pt.err.badNumber'));
    const err = await dispatch([{ t: 'positionUpdate', id: editPos.id, patch: { stopLoss: sl, takeProfit: tp, journal: editPos.journal.slice(0, PAPER_LIMITS.journalMax), researchNoteId: editPos.noteId } }]);
    if (err) setMessage(err);
    else setEditPos(null);
  };

  const saveSettings = async () => {
    if (!session || !settingsDraft) return;
    const num = (k: keyof PaperSettings) => Number(settingsDraft[k].replace(',', '.'));
    const next = sanitizeSettings({ marginPct: num('marginPct'), feePerContractUsd: num('feePerContractUsd'), slippageTicks: num('slippageTicks'), marginCallPct: num('marginCallPct'), stopOutPct: num('stopOutPct') });
    if (next.stopOutPct >= next.marginCallPct) return setMessage(t('pt.err.thresholds'));
    const err = await dispatch([{ t: 'sessionUpdate', id: session.id, patch: { settings: next } }]);
    if (err) setMessage(err);
    else setSettingsDraft(null);
  };

  const resetSession = async () => {
    if (!session || !window.confirm(t('pt.session.resetConfirm'))) return;
    const err = await dispatch(resetSessionOps(state, session.id));
    setMessage(err ?? t('pt.session.resetDone'));
  };

  const closeSession = async () => {
    if (!session) return;
    if (positions.length > 0) return setMessage(t('pt.session.closeNeedsFlat'));
    if (!window.confirm(t('pt.session.closeConfirm', { name: session.name }))) return;
    const err = await dispatch(closeSessionOps(session, Date.now()));
    setMessage(err ?? t('pt.session.closeDone'));
  };

  const deleteSession = async (s: PaperSession) => {
    if (!window.confirm(t('pt.session.deleteConfirm', { name: s.name }))) return;
    const err = await dispatch(deleteSessionOps(state, s.id));
    if (err) setMessage(err);
  };

  const updateTrade = (id: string, patch: { journal?: string; researchNoteId?: string }) => {
    void dispatch([{ t: 'tradeUpdate', id, patch }]).then((err) => err && setMessage(err));
  };

  const mgText = (spec: ValidSpec, price: number, s: PaperSettings) => fmtFixed(marginPerContractUsd(spec, price, s.marginPct, null), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#6366F1]" aria-hidden="true" />
          {t('pt.title')}
        </h1>
        <p className="text-sm text-[#E5E7EB]/70 mt-1">{t('pt.subtitle')}</p>
      </div>

      <div role="note" className="flex gap-2 items-start bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-lg p-3 text-xs text-[#FCD34D]">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <p>{t('pt.disclaimer')}</p>
      </div>

      {/* Sign-in / storage mode */}
      {!user ? (
        <div className={`${cardCls} flex flex-wrap items-center gap-3`}>
          <button type="button" onClick={() => void signInWithGoogle()} className={`${bigBtn} bg-[#6366F1] hover:bg-[#6366F1]/90 text-white`}>
            <LogIn className="w-4 h-4" aria-hidden="true" />
            {t('pt.auth.signIn')}
          </button>
          <p className="text-xs text-[#E5E7EB]/70 flex-1 min-w-[14rem]">{t('pt.auth.localNote')}</p>
        </div>
      ) : !user.emailVerified ? (
        <div className={`${cardCls} text-xs text-[#F59E0B]`}>{t('pt.auth.verify')}</div>
      ) : (
        <p className="text-[11px] text-[#4ADE80]">{t('pt.auth.cloud')}</p>
      )}

      {cloud && store.localPending.sessions.length > 0 && !importDismissed && (
        <div className={`${cardCls} space-y-2 border-[#6366F1]/50`}>
          <p className="text-sm text-white">{t('pt.import.title', { n: store.localPending.sessions.length })}</p>
          <p className="text-xs text-[#E5E7EB]/70">{t('pt.import.body')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`${bigBtn} bg-[#6366F1] text-white`}
              onClick={() => void store.importLocal().then((err) => setMessage(err ?? t('pt.import.done')))}
            >
              {t('pt.import.yes')}
            </button>
            <button type="button" className={`${bigBtn} border border-[#263244]`} onClick={() => setImportDismissed(true)}>{t('pt.import.later')}</button>
            <button type="button" className={`${bigBtn} border border-[#263244] text-[#F87171]`} onClick={() => window.confirm(t('pt.import.discardConfirm')) && store.discardLocal()}>{t('pt.import.discard')}</button>
          </div>
        </div>
      )}

      {store.error && <p className="text-xs text-[#F87171]" role="alert">{store.error}</p>}
      {message && <p className="text-xs text-[#A5B4FC]" role="status">{message}</p>}

      <div className="flex gap-2" role="tablist">
        {(['trade', 'history'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm rounded-md border ${tab === k ? 'bg-[#6366F1] border-[#6366F1] text-white' : 'border-[#263244] text-[#E5E7EB]/80'}`}
          >
            {t(k === 'trade' ? 'pt.tab.trade' : 'pt.tab.history')}
          </button>
        ))}
      </div>

      {!store.ready ? (
        <p className="text-sm text-[#E5E7EB]/60">{t('pt.loading')}</p>
      ) : tab === 'history' ? (
        <SessionHistory
          state={state}
          notes={notes}
          instrumentName={instrumentName}
          onUpdateTrade={updateTrade}
          onDeleteSession={(s) => void deleteSession(s)}
          onRenameSession={(s, name) => void dispatch([{ t: 'sessionUpdate', id: s.id, patch: { name } }]).then((err) => err && setMessage(err))}
        />
      ) : (
        <div className="space-y-5">
          {/* Session picker / creator */}
          <div className={`${cardCls} space-y-3`}>
            <h2 className="text-sm font-semibold text-white">{t('pt.session.title')}</h2>
            {activeSessions.length > 0 && (
              <div>
                <label htmlFor="pt-session" className={labelCls}>{t('pt.session.pick')}</label>
                <select id="pt-session" value={session?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)} className={inputCls}>
                  {activeSessions.map((s) => <option key={s.id} value={s.id}>{s.name} · {fmtDateTime(s.createdAtMs)}</option>)}
                </select>
              </div>
            )}
            <form
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void createSession();
              }}
            >
              <div>
                <label htmlFor="pt-name" className={labelCls}>{t('pt.session.name')}</label>
                <input id="pt-name" value={newName} maxLength={PAPER_LIMITS.nameMax} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="pt-capital" className={labelCls}>{t('pt.session.capital')}</label>
                <input id="pt-capital" inputMode="numeric" value={newCapital} onChange={(e) => setNewCapital(e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <button type="submit" className={`${bigBtn} bg-[#22C55E] hover:bg-[#22C55E]/90 text-[#05210F]`}>{t('pt.session.create')}</button>
            </form>
            {formError && <p className="text-xs text-[#F87171]" role="alert">{formError}</p>}
          </div>

          {session && snap && (
            <>
              {/* Account */}
              <div className={`${cardCls} space-y-3`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">{session.name}</h2>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="px-3 py-2 border border-[#263244] text-xs rounded-md" onClick={() => void resetSession()}>{t('pt.session.reset')}</button>
                    <button type="button" className="px-3 py-2 border border-[#263244] text-xs rounded-md" onClick={() => void closeSession()}>{t('pt.session.close')}</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Stat label={t('pt.acc.start')} value={fmtVnd(session.startingCapitalVnd)} />
                  <Stat label={t('pt.acc.balance')} value={fmtVnd(session.balanceVnd)} hint={t('pt.acc.balanceHint')} />
                  <Stat label={t('pt.acc.equity')} value={fmtVnd(snap.equityVnd)} hint={t('pt.acc.equityHint')} />
                  <Stat label={t('pt.acc.unrealised')} value={signedVnd(snap.unrealisedVnd)} tone={pnlColor(snap.unrealisedVnd)} />
                  <Stat label={t('pt.acc.margin')} value={fmtVnd(snap.usedMarginVnd)} hint={t('pt.acc.marginHint')} />
                  <Stat label={t('pt.acc.free')} value={fmtVnd(snap.freeMarginVnd)} hint={t('pt.acc.freeHint')} />
                  <Stat label={t('pt.acc.level')} value={snap.marginLevelPct === null ? '—' : fmtPct(snap.marginLevelPct, 0)} hint={t('pt.acc.levelHint')} />
                  <Stat label={t('pt.acc.fx')} value={fx ? `${fmtInt(fx)} đ` : '—'} hint={t('pt.acc.fxHint')} />
                </div>
                {snap.status === 'MARGIN_CALL' && (
                  <p role="alert" className="text-xs text-[#FCD34D] bg-[#F59E0B]/10 border border-[#F59E0B]/40 rounded-md p-2">{t('pt.warn.marginCall', { pct: session.settings.marginCallPct, stop: session.settings.stopOutPct })}</p>
                )}
                {snap.status === 'STOP_OUT' && (
                  <p role="alert" className="text-xs text-[#FCA5A5] bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-md p-2">{t('pt.warn.stopOut', { stop: session.settings.stopOutPct })}</p>
                )}
                <div className="text-[11px] text-[#E5E7EB]/55 flex flex-wrap items-center gap-2">
                  <span>{t('pt.fx.source')}{vcb.asOf ? ` (${vcb.asOf.slice(0, 16).replace('T', ' ')})` : ''}</span>
                  <label htmlFor="pt-fx" className="sr-only">{t('pt.fx.manual')}</label>
                  <input id="pt-fx" inputMode="decimal" placeholder={t('pt.fx.manual')} value={manualFx} onChange={(e) => setManualFx(e.target.value)} className="w-40 bg-[#0B0E14] border border-[#263244] rounded-md px-2 py-1 text-xs text-white" />
                </div>
                <details className="text-xs" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && !settingsDraft && setSettingsDraft({ marginPct: String(session.settings.marginPct), feePerContractUsd: String(session.settings.feePerContractUsd), slippageTicks: String(session.settings.slippageTicks), marginCallPct: String(session.settings.marginCallPct), stopOutPct: String(session.settings.stopOutPct) })}>
                  <summary className="cursor-pointer text-[#A5B4FC]">{t('pt.settings.title')}</summary>
                  {settingsDraft && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[#E5E7EB]/60">{t('pt.settings.note')}</p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {(['marginPct', 'feePerContractUsd', 'slippageTicks', 'marginCallPct', 'stopOutPct'] as const).map((k) => (
                          <div key={k}>
                            <label htmlFor={`pt-set-${k}`} className={labelCls}>{t(`pt.settings.${k}` as TKey)}</label>
                            <input id={`pt-set-${k}`} inputMode="decimal" value={settingsDraft[k]} onChange={(e) => setSettingsDraft({ ...settingsDraft, [k]: e.target.value })} className={`${inputCls} font-mono`} />
                          </div>
                        ))}
                      </div>
                      <p className="text-[#E5E7EB]/60">{t('pt.settings.stopOutExplain')}</p>
                      <button type="button" className="px-4 py-2 bg-[#6366F1] text-white rounded-md" onClick={() => void saveSettings()}>{t('pt.save')}</button>
                    </div>
                  )}
                </details>
              </div>

              {/* Order ticket */}
              <div className={`${cardCls} space-y-3`}>
                <h2 className="text-sm font-semibold text-white">{t('pt.order.title')}</h2>
                <div>
                  <label htmlFor="pt-inst" className={labelCls}>{t('pt.order.instrument')}</label>
                  <select id="pt-inst" value={instId} onChange={(e) => { setInstId(e.target.value); setOrderError(null); }} className={inputCls}>
                    <option value="">{t('pt.order.pick')}</option>
                    {instruments.filter((i) => i.enabled).map((i) => <option key={i.id} value={i.id}>{i.productName} · {i.exchangeSymbol}</option>)}
                  </select>
                </div>
                {inst && specRes && gate && (
                  <div className="text-xs space-y-1">
                    {!specRes.ok ? (
                      <p className="text-[#FCA5A5]">{t(`pt.specBlock.${specRes.reason}` as TKey)}</p>
                    ) : gate.ok ? (
                      <>
                        <p className="text-white">
                          {t('pt.order.lastPrice')}: <span className="font-mono">{fmtFixed(gate.price, 2)}</span> {inst.specification.quotationUnit}
                          {gate.delayed && <span className="ml-2 text-[#FCD34D]">{t('pt.order.delayed', { min: gate.delayMinutes })}</span>}
                        </p>
                        <p className="text-[#E5E7EB]/65">
                          {t('pt.order.contractValue')}: {fmtFixed(contractValueUsd(specRes.spec, gate.price), 0)} USD{fx ? ` ≈ ${fmtVnd(contractValueUsd(specRes.spec, gate.price) * fx)}` : ''}
                          {' · '}{t('pt.order.defaultMargin', { usd: mgText(specRes.spec, gate.price, session.settings) })}
                        </p>
                      </>
                    ) : (
                      <p className="text-[#FCA5A5]" role="alert">{t(`pt.block.${gate.reason}` as TKey)}</p>
                    )}
                    <button type="button" className="text-[#A5B4FC] underline" onClick={() => void refreshQuotes()}>{t('pt.order.refresh')}</button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" aria-pressed={side === 'LONG'} onClick={() => setSide('LONG')} className={`${bigBtn} border ${side === 'LONG' ? 'bg-[#22C55E] border-[#22C55E] text-[#05210F]' : 'border-[#263244] text-[#E5E7EB]'}`}>{t('pt.side.buy')}</button>
                  <button type="button" aria-pressed={side === 'SHORT'} onClick={() => setSide('SHORT')} className={`${bigBtn} border ${side === 'SHORT' ? 'bg-[#EF4444] border-[#EF4444] text-white' : 'border-[#263244] text-[#E5E7EB]'}`}>{t('pt.side.sell')}</button>
                </div>
                <p className="text-[11px] text-[#E5E7EB]/60">{side === 'LONG' ? t('pt.side.buyExplain') : t('pt.side.sellExplain')}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="pt-qty" className={labelCls}>{t('pt.order.qty')}</label>
                    <input id="pt-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label htmlFor="pt-sl" className={labelCls}>{t('pt.order.sl')}</label>
                    <input id="pt-sl" inputMode="decimal" value={slText} onChange={(e) => setSlText(e.target.value)} className={`${inputCls} font-mono`} placeholder={t('pt.order.optional')} />
                  </div>
                  <div>
                    <label htmlFor="pt-tp" className={labelCls}>{t('pt.order.tp')}</label>
                    <input id="pt-tp" inputMode="decimal" value={tpText} onChange={(e) => setTpText(e.target.value)} className={`${inputCls} font-mono`} placeholder={t('pt.order.optional')} />
                  </div>
                  <div>
                    <label htmlFor="pt-margin" className={labelCls}>{t('pt.order.margin')}</label>
                    <input id="pt-margin" inputMode="decimal" value={marginText} onChange={(e) => setMarginText(e.target.value)} className={`${inputCls} font-mono`} placeholder={t('pt.order.marginDefault', { pct: session.settings.marginPct })} />
                  </div>
                </div>
                <p className="text-[11px] text-[#E5E7EB]/60">{t('pt.order.marginAssumed')}</p>
                <button type="button" onClick={prepareOrder} className={`${bigBtn} w-full bg-[#6366F1] hover:bg-[#6366F1]/90 text-white`}>{t('pt.order.review')}</button>
                {orderError && <p className="text-xs text-[#F87171]" role="alert">{orderError}</p>}
              </div>

              {/* Open positions */}
              <div className={cardCls}>
                <h2 className="text-sm font-semibold text-white mb-2">{t('pt.pos.title')}</h2>
                {positions.length === 0 ? (
                  <p className="text-xs text-[#E5E7EB]/60">{t('pt.pos.none')}</p>
                ) : (
                  <ul className="space-y-3">
                    {positions.map((p) => {
                      const pi = priced.find((x) => x.pos.id === p.id);
                      const upl = pi ? unrealisedUsd(pi) : null;
                      const editing = editPos?.id === p.id;
                      const instNotes = notes.filter((n) => n.instrumentId === p.instrumentId || n.id === p.researchNoteId);
                      return (
                        <li key={p.id} className="border border-[#263244] rounded-md p-3 text-xs space-y-2">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="text-white font-semibold">{instrumentName(p.instrumentId)}</span>
                            <span className={p.side === 'LONG' ? 'text-[#4ADE80]' : 'text-[#F87171]'}>{p.side === 'LONG' ? t('pt.side.long') : t('pt.side.short')} × {p.contracts}</span>
                            <span className="font-mono">{t('pt.pos.entry')} {fmtFixed(p.entryPrice, 2)}</span>
                            <span className="font-mono">{t('pt.pos.now')} {pi?.price != null ? fmtFixed(pi.price, 2) : t('pt.pos.noPrice')}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span className={`font-mono font-semibold ${upl === null ? '' : pnlColor(upl)}`}>
                              {upl === null ? t('pt.pos.noPnl') : `${upl >= 0 ? '+' : ''}${fmtFixed(upl, 2)} USD ≈ ${signedVnd(upl * fxForView)}`}
                            </span>
                            <span className="text-[#E5E7EB]/70">{t('pt.pos.margin')}: {fmtVnd(p.marginPerContractUsd * p.contracts * fxForView)}</span>
                            <span className="text-[#E5E7EB]/70">SL {p.stopLoss ?? '—'} · TP {p.takeProfit ?? '—'}</span>
                          </div>
                          {editing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className={labelCls} htmlFor={`pt-esl-${p.id}`}>{t('pt.order.sl')}</label>
                                  <input id={`pt-esl-${p.id}`} className={`${inputCls} font-mono`} inputMode="decimal" value={editPos.sl} onChange={(e) => setEditPos({ ...editPos, sl: e.target.value })} />
                                </div>
                                <div>
                                  <label className={labelCls} htmlFor={`pt-etp-${p.id}`}>{t('pt.order.tp')}</label>
                                  <input id={`pt-etp-${p.id}`} className={`${inputCls} font-mono`} inputMode="decimal" value={editPos.tp} onChange={(e) => setEditPos({ ...editPos, tp: e.target.value })} />
                                </div>
                              </div>
                              <textarea className={`${inputCls} h-16`} maxLength={PAPER_LIMITS.journalMax} value={editPos.journal} placeholder={t('pt.journal.placeholder')} aria-label={t('pt.journal.title')} onChange={(e) => setEditPos({ ...editPos, journal: e.target.value })} />
                              {instNotes.length > 0 && (
                                <select className={inputCls} value={editPos.noteId} aria-label={t('pt.journal.link')} onChange={(e) => setEditPos({ ...editPos, noteId: e.target.value })}>
                                  <option value="">{t('pt.journal.noLink')}</option>
                                  {instNotes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                                </select>
                              )}
                              <div className="flex gap-2">
                                <button type="button" className="px-3 py-2 bg-[#6366F1] text-white rounded-md" onClick={() => void savePosition()}>{t('pt.save')}</button>
                                <button type="button" className="px-3 py-2 border border-[#263244] rounded-md" onClick={() => setEditPos(null)}>{t('pt.cancel')}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {p.journal && <p className="text-[#E5E7EB]/75 whitespace-pre-wrap">{p.journal}</p>}
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={`${bigBtn} !py-2 bg-[#EF4444] text-white`} onClick={() => void closeManually(p)}>{t('pt.pos.close')}</button>
                                <button type="button" className="px-3 py-2 border border-[#263244] rounded-md" onClick={() => setEditPos({ id: p.id, sl: p.stopLoss === null ? '' : String(p.stopLoss), tp: p.takeProfit === null ? '' : String(p.takeProfit), journal: p.journal, noteId: p.researchNoteId })}>{t('pt.pos.edit')}</button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <SessionReport
                startingCapitalVnd={session.startingCapitalVnd}
                trades={trades}
                breakdown={breakdown}
                notes={notes}
                instrumentName={instrumentName}
                onUpdateTrade={updateTrade}
              />
            </>
          )}
        </div>
      )}

      {/* Confirm dialog: shows the money at risk before any order is placed. */}
      {pending && session && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('pt.confirm.title')}>
          <div className="bg-[#111622] border border-[#263244] rounded-lg p-5 w-full max-w-md space-y-3">
            <h2 className="text-base font-semibold text-white">{t('pt.confirm.title')}</h2>
            <p className="text-sm text-white">
              <span className={pending.side === 'LONG' ? 'text-[#4ADE80]' : 'text-[#F87171]'}>{pending.side === 'LONG' ? t('pt.side.buy') : t('pt.side.sell')}</span>
              {' '}{pending.contracts} × {instrumentName(pending.instId)}
            </p>
            <dl className="text-xs grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
              <dt className="text-[#E5E7EB]/60">{t('pt.confirm.fill')}</dt>
              <dd className="font-mono text-right">{fmtFixed(pending.fill, 2)} <span className="text-[#E5E7EB]/50">({t('pt.confirm.quote')} {fmtFixed(pending.quote, 2)})</span></dd>
              <dt className="text-[#E5E7EB]/60">{t('pt.order.contractValue')}</dt>
              <dd className="font-mono text-right">{fmtVnd(pending.check.contractValueVnd)}</dd>
              <dt className="text-[#E5E7EB]/60">{t('pt.confirm.margin')}</dt>
              <dd className="font-mono text-right">{fmtVnd(pending.check.marginVnd)}</dd>
              <dt className="text-[#E5E7EB]/60">{t('pt.confirm.fee')}</dt>
              <dd className="font-mono text-right">{fmtVnd(pending.check.feeVnd)}</dd>
              <dt className="text-[#E5E7EB]/60">SL / TP</dt>
              <dd className="font-mono text-right">{pending.stopLoss ?? '—'} / {pending.takeProfit ?? '—'}</dd>
            </dl>
            <p className="text-sm font-semibold text-[#FCA5A5]">
              {pending.check.riskVnd === null ? t('pt.confirm.riskNoStop', { margin: fmtVnd(pending.check.marginVnd) }) : t('pt.confirm.risk', { risk: fmtVnd(pending.check.riskVnd) })}
            </p>
            <p className="text-[11px] text-[#E5E7EB]/60">{t('pt.confirm.assumptions', { slip: session.settings.slippageTicks, fee: session.settings.feePerContractUsd })}</p>
            {pending.delayed && <p className="text-[11px] text-[#FCD34D]">{t('pt.order.delayed', { min: 15 })}</p>}
            <p className="text-[11px] text-[#FCD34D]">{t('pt.confirm.virtual')}</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className={`${bigBtn} border border-[#263244]`} onClick={() => setPending(null)}>{t('pt.cancel')}</button>
              <button type="button" className={`${bigBtn} bg-[#22C55E] text-[#05210F]`} onClick={() => void confirmOrder()}>{t('pt.confirm.ok')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
