import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Normalized, PII-free description of a failed Firestore operation.
 * Only uid, operation, path and the Firebase error code are retained — never
 * emails, display names or provider data.
 */
export interface FirestoreErrorInfo {
  /** Firebase error code (e.g. 'permission-denied', 'unavailable') or 'unknown'. */
  code: string;
  operationType: OperationType;
  path: string | null;
  userId: string | null;
  /** Safe, user-facing message suitable for display in the UI. */
  userMessage: string;
}

function extractErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) {
      // Firebase codes may be prefixed, e.g. 'firestore/permission-denied'.
      return code.includes('/') ? code.slice(code.lastIndexOf('/') + 1) : code;
    }
  }
  return 'unknown';
}

function userMessageForCode(code: string, operationType: OperationType): string {
  switch (code) {
    case 'permission-denied':
      return 'Permission denied by Firestore security rules. Ensure you are signed in with a verified email.';
    case 'unauthenticated':
      return 'Your session has expired. Please sign in again.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Cloud Firestore is currently unreachable. Check your connection and try again.';
    case 'not-found':
      return 'The requested record was not found in Cloud Firestore.';
    case 'invalid-argument':
    case 'failed-precondition':
      return 'Cloud Firestore rejected the request because the data was invalid.';
    case 'resource-exhausted':
      return 'Cloud Firestore quota exceeded. Please try again later.';
    default:
      return `Cloud Firestore ${operationType} operation failed.`;
  }
}

/**
 * Normalizes and logs a Firestore error, returning a typed error object.
 * Never throws — callers decide whether to surface it as UI state or reject.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const code = extractErrorCode(error);
  const info: FirestoreErrorInfo = {
    code,
    operationType,
    path,
    userId: auth.currentUser?.uid ?? null,
    userMessage: userMessageForCode(code, operationType),
  };
  console.error('Firestore Error:', {
    code: info.code,
    operationType: info.operationType,
    path: info.path,
    userId: info.userId,
  });
  return info;
}

/**
 * Loads Firestore on demand (separate `vendor-firestore` chunk). The main bundle never imports
 * `firebase/firestore` statically; async callers use this getter, lazy views import `./firestoreDb`.
 */
export async function getFirestoreModules() {
  const [fs, { db }] = await Promise.all([import('firebase/firestore'), import('./firestoreDb')]);
  return { ...fs, db };
}

export type FirestoreConnectionState = 'SIGNED_OUT' | 'CHECKING' | 'ONLINE' | 'OFFLINE_OR_MISCONFIGURED' | 'ERROR';

export async function testFirestoreConnection(): Promise<FirestoreConnectionState> {
  try {
    const { db, doc, getDocFromServer } = await getFirestoreModules();
    await getDocFromServer(doc(db, 'test', 'connection'));
    return 'ONLINE';
  } catch (error) {
    const code = extractErrorCode(error);
    // Permission denied on /test/connection is expected: the server answered,
    // so the backend is reachable and correctly configured.
    if (code === 'permission-denied') {
      return 'ONLINE';
    }
    const message = error instanceof Error ? error.message : '';
    if (code === 'unavailable' || message.includes('client is offline')) {
      console.error('Firestore unreachable: client is offline or Firebase configuration is invalid.');
      return 'OFFLINE_OR_MISCONFIGURED';
    }
    console.error('Firestore connectivity check failed:', { code });
    return 'ERROR';
  }
}
