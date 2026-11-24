import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getFirestoreModules, handleFirestoreError, OperationType } from '../../../firebase';
import {
  EMPTY_STATE,
  LOCAL_KEY,
  applyOps,
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
import { BATCH_MAX, COL, addOpToBatch, cachedLoader } from './paperFirestore';

// Firestore SDK is fetched only when a signed-in, verified user needs cloud sync (never on guest paths).
const loadFirestore = cachedLoader(getFirestoreModules);

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
  // Latest signed-in uid, read after async gaps so a write never commits under a switched account.
  const uidRef = useRef(uid);
  uidRef.current = uid;
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
    // The SDK loads asynchronously: if auth changes or the component unmounts meanwhile, do not subscribe.
    let disposed = false;
    let subs: (() => void)[] = [];
    void loadFirestore()
      .then(({ db, collection, onSnapshot, query, where }) => {
        if (disposed) return;
        subs = (['sessions', 'positions', 'trades'] as const).map((k) => {
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
      })
      .catch((err: unknown) => {
        if (!disposed) setError(handleFirestoreError(err, OperationType.LIST, 'paper*').userMessage || String(err));
      });
    return () => {
      disposed = true;
      subs.forEach((u) => u());
    };
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
        const fs = await loadFirestore();
        if (uidRef.current !== uid) {
          const msg = 'Tài khoản vừa thay đổi — thao tác chưa được lưu, vui lòng thử lại.';
          setError(msg);
          return msg;
        }
        for (let i = 0; i < ops.length; i += BATCH_MAX) {
          const batch = fs.writeBatch(fs.db);
          for (const op of ops.slice(i, i + BATCH_MAX)) addOpToBatch(fs, batch, uid, op, preserveDates);
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
    // Not ready until auth resolved: user===null during the lazy auth load is "unknown", not signed-out.
    ready: !authReady ? false : cloud ? loaded.s && loaded.p && loaded.t : true,
    state: cloud ? remote : local,
    localPending: cloud ? local : EMPTY_STATE,
    error,
    dispatch: (ops) => dispatch(ops),
    importLocal,
    discardLocal,
  };
}
