import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch, type WriteBatch } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../../firebase';
import {
  EMPTY_STATE,
  LOCAL_KEY,
  applyOps,
  buildPositionCreate,
  buildSessionCreate,
  buildSessionUpdate,
  buildTradeCreate,
  deserializeState,
  importOps,
  parsePositionDoc,
  parseSessionDoc,
  parseTradeDoc,
  serializeState,
  type PaperOp,
  type PaperPosition,
  type PaperSession,
  type PaperState,
  type PaperTrade,
} from './paperModel';

const COL = { sessions: 'paperSessions', positions: 'paperPositions', trades: 'paperOrders' } as const;
const BATCH_MAX = 400;

function loadLocal(): PaperState {
  try {
    return deserializeState(localStorage.getItem(LOCAL_KEY));
  } catch {
    return EMPTY_STATE;
  }
}

function saveLocal(s: PaperState): void {
  try {
    localStorage.setItem(LOCAL_KEY, serializeState(s));
  } catch {
    /* storage blocked: the session just will not persist */
  }
}

function clearLocal(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

function addOpToBatch(batch: WriteBatch, uid: string, op: PaperOp, preserveDates: boolean): void {
  const f = { now: serverTimestamp() as unknown, ts: (ms: number) => Timestamp.fromMillis(ms) as unknown };
  switch (op.t) {
    case 'sessionCreate':
      batch.set(doc(db, COL.sessions, op.session.id), buildSessionCreate(uid, op.session, f, preserveDates));
      break;
    case 'sessionUpdate':
      batch.update(doc(db, COL.sessions, op.id), buildSessionUpdate(op.patch, f));
      break;
    case 'sessionDelete':
      batch.delete(doc(db, COL.sessions, op.id));
      break;
    case 'positionCreate':
      batch.set(doc(db, COL.positions, op.position.id), buildPositionCreate(uid, op.position, f, preserveDates));
      break;
    case 'positionUpdate':
      batch.update(doc(db, COL.positions, op.id), { ...op.patch });
      break;
    case 'positionDelete':
      batch.delete(doc(db, COL.positions, op.id));
      break;
    case 'tradeCreate':
      batch.set(doc(db, COL.trades, op.trade.id), buildTradeCreate(uid, op.trade, f, preserveDates));
      break;
    case 'tradeUpdate':
      batch.update(doc(db, COL.trades, op.id), { ...op.patch });
      break;
    case 'tradeDelete':
      batch.delete(doc(db, COL.trades, op.id));
      break;
  }
}

export interface PaperStore {
  /** Firestore (signed in + verified) or localStorage. */
  mode: 'cloud' | 'local';
  ready: boolean;
  state: PaperState;
  /** Data waiting in localStorage that could be imported after signing in. */
  localPending: PaperState;
  error: string | null;
  /** Applies ops atomically (one batch). Resolves to an error message or null. */
  dispatch: (ops: PaperOp[]) => Promise<string | null>;
  importLocal: () => Promise<string | null>;
  discardLocal: () => void;
}

/** One data layer for both backends: ops are applied via a Firestore batch or the pure reducer. */
export function usePaperStore(): PaperStore {
  const { user, authReady } = useAuth();
  const uid = user?.uid ?? null;
  const cloud = !!user && user.emailVerified;
  const [local, setLocal] = useState<PaperState>(loadLocal);
  const localRef = useRef(local);
  localRef.current = local;
  const [sessions, setSessions] = useState<PaperSession[]>([]);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState({ s: false, p: false, t: false });

  useEffect(() => {
    if (!authReady || !uid || !cloud) {
      setSessions([]);
      setPositions([]);
      setTrades([]);
      setLoaded({ s: false, p: false, t: false });
      return;
    }
    const subs = (['sessions', 'positions', 'trades'] as const).map((k) => {
      const q = query(collection(db, COL[k]), where('userId', '==', uid));
      return onSnapshot(
        q,
        (snap) => {
          setError(null);
          if (k === 'sessions') setSessions(snap.docs.map((d) => parseSessionDoc(d.id, d.data())));
          else if (k === 'positions') setPositions(snap.docs.map((d) => parsePositionDoc(d.id, d.data())));
          else setTrades(snap.docs.map((d) => parseTradeDoc(d.id, d.data())));
          setLoaded((l) => ({ ...l, [k[0]]: true }));
        },
        (err) => setError(handleFirestoreError(err, OperationType.LIST, COL[k]).userMessage || String(err))
      );
    });
    return () => subs.forEach((u) => u());
  }, [authReady, uid, cloud]);

  const remote = useMemo<PaperState>(() => ({ sessions, positions, trades }), [sessions, positions, trades]);

  const dispatch = useCallback(
    async (ops: PaperOp[], preserveDates = false): Promise<string | null> => {
      if (ops.length === 0) return null;
      if (!cloud || !uid) {
        const next = applyOps(localRef.current, ops);
        localRef.current = next;
        setLocal(next);
        saveLocal(next);
        return null;
      }
      try {
        for (let i = 0; i < ops.length; i += BATCH_MAX) {
          const batch = writeBatch(db);
          for (const op of ops.slice(i, i + BATCH_MAX)) addOpToBatch(batch, uid, op, preserveDates);
          await batch.commit();
        }
        return null;
      } catch (err) {
        const msg = handleFirestoreError(err, OperationType.WRITE, 'paper*').userMessage || String(err);
        setError(msg);
        return msg;
      }
    },
    [cloud, uid]
  );

  const importLocal = useCallback(async (): Promise<string | null> => {
    const pending = localRef.current;
    const msg = await dispatch(importOps(pending), true);
    if (!msg) {
      clearLocal();
      localRef.current = EMPTY_STATE;
      setLocal(EMPTY_STATE);
    }
    return msg;
  }, [dispatch]);

  const discardLocal = useCallback(() => {
    clearLocal();
    localRef.current = EMPTY_STATE;
    setLocal(EMPTY_STATE);
  }, []);

  return {
    mode: cloud ? 'cloud' : 'local',
    ready: cloud ? loaded.s && loaded.p && loaded.t : true,
    state: cloud ? remote : local,
    localPending: cloud ? local : EMPTY_STATE,
    error,
    dispatch: (ops) => dispatch(ops),
    importLocal,
    discardLocal,
  };
}
