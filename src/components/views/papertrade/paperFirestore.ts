// Firestore helpers for the paper-trading store. Type-only imports from `firebase/firestore`: the runtime module is
// loaded on demand (getFirestoreModules) so guests never download the Firestore SDK.
import type { Firestore, WriteBatch } from 'firebase/firestore';
import { buildPositionCreate, buildSessionCreate, buildSessionUpdate, buildTradeCreate, type PaperOp } from './paperModel';

export const COL = { sessions: 'paperSessions', positions: 'paperPositions', trades: 'paperOrders' } as const;
export const BATCH_MAX = 400;

/** The parts of the Firestore module needed to turn ops into batch writes. */
export type PaperFs = Pick<typeof import('firebase/firestore'), 'doc' | 'serverTimestamp' | 'Timestamp'> & { db: Firestore };

/**
 * Memoises an async loader. Concurrent and later callers share one promise (so callbacks run in call order);
 * a rejected load is forgotten so the next call retries.
 */
export function cachedLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending) {
      pending = load().catch((err: unknown) => {
        pending = null;
        throw err;
      });
    }
    return pending;
  };
}

export function addOpToBatch(fs: PaperFs, batch: WriteBatch, uid: string, op: PaperOp, preserveDates: boolean): void {
  const { db, doc, serverTimestamp, Timestamp } = fs;
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
