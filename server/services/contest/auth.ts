/**
 * T63 - Firebase ID token verification without extra dependencies or credentials: RS256 signature checked
 * against Google's public securetoken certificates, plus aud/iss/exp/iat/sub checks (the same rules as
 * firebase-admin's verifyIdToken). The verifier is injectable so tests use a mock.
 */
import { createPublicKey, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type TokenVerifier = (idToken: string) => Promise<{ uid: string } | null>;

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function resolveFirebaseProjectId(env: Record<string, string | undefined> = process.env): string | null {
  const fromEnv = (env.FIREBASE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? '').trim();
  if (fromEnv) return fromEnv;
  try {
    const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8')) as { projectId?: unknown };
    return typeof cfg.projectId === 'string' && cfg.projectId ? cfg.projectId : null;
  } catch {
    return null;
  }
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface VerifyOptions {
  projectId: string;
  /** kid -> PEM (certificate or public key). */
  getKeys: () => Promise<Record<string, string>>;
  now?: () => number;
}

export async function verifyFirebaseIdToken(token: string, opts: VerifyOptions): Promise<{ uid: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8192) return null;
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
  const nowS = Math.floor((opts.now ?? Date.now)() / 1000);
  const { aud, iss, sub, exp, iat } = payload as Record<string, unknown>;
  if (aud !== opts.projectId || iss !== `https://securetoken.google.com/${opts.projectId}`) return null;
  if (typeof sub !== 'string' || !sub || sub.length > 128) return null;
  if (typeof exp !== 'number' || exp <= nowS || typeof iat !== 'number' || iat > nowS + 300) return null;
  let keys: Record<string, string>;
  try {
    keys = await opts.getKeys();
  } catch {
    return null;
  }
  const pem = keys[header.kid];
  if (!pem) return null;
  try {
    const ok = createVerify('RSA-SHA256')
      .update(`${parts[0]}.${parts[1]}`)
      .verify(createPublicKey(pem), Buffer.from(parts[2], 'base64url'));
    return ok ? { uid: sub } : null;
  } catch {
    return null;
  }
}

/** Production verifier: caches Google's certs for their max-age (default 1h). */
export function createFirebaseVerifier(env: Record<string, string | undefined> = process.env): TokenVerifier | null {
  const projectId = resolveFirebaseProjectId(env);
  if (!projectId) return null;
  let cache: { keys: Record<string, string>; until: number } | null = null;
  const getKeys = async (): Promise<Record<string, string>> => {
    if (cache && cache.until > Date.now()) return cache.keys;
    const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`certs HTTP ${res.status}`);
    const keys = (await res.json()) as Record<string, string>;
    const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
    cache = { keys, until: Date.now() + (m ? Number(m[1]) : 3600) * 1000 };
    return keys;
  };
  return (t) => verifyFirebaseIdToken(t, { projectId, getKeys });
}
