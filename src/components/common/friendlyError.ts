import { tr, type TParams } from '../../i18n/translate';
import type { TKey } from '../../i18n/vi';

/** What the user sees: a short main line plus raw technical text kept for a collapsed "technical details" block. */
export type UserErrorKind =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'rateLimited'
  | 'auth'
  | 'notFound'
  | 'client'
  | 'server'
  | 'parse'
  | 'unknown';

export interface UserError {
  kind: UserErrorKind;
  /** Short, localized, safe for beginners. */
  message: string;
  /** Raw technical text (may be empty). Only ever shown inside <details>. */
  detail: string;
}

type Translate = (key: TKey, params?: TParams) => string;

const KEY: Record<UserErrorKind, TKey> = {
  offline: 'err2.offline',
  network: 'err2.network',
  timeout: 'err2.timeout',
  rateLimited: 'err2.rateLimited',
  auth: 'err2.auth',
  notFound: 'err2.notFound',
  client: 'err2.client',
  server: 'err2.server',
  parse: 'err2.parse',
  unknown: 'err2.unknown',
};

function statusOf(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const o = err as { httpStatus?: unknown; status?: unknown };
  for (const v of [o.httpStatus, o.status]) {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 100 && v < 600) return v;
  }
  return null;
}

function kindFromStatus(s: number): UserErrorKind | null {
  if (s === 429) return 'rateLimited';
  if (s === 401 || s === 403) return 'auth';
  if (s === 404) return 'notFound';
  if (s === 408 || s === 504) return 'timeout';
  if (s >= 500) return 'server';
  if (s >= 400) return 'client';
  return null;
}

function detailOf(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.name && err.name !== 'Error' ? `${err.name}: ${err.message}` : err.message;
  const o = err as { status?: unknown; statusText?: unknown; message?: unknown };
  if (typeof o.message === 'string') return o.message;
  if (typeof o.status === 'number') return `HTTP ${o.status}${typeof o.statusText === 'string' && o.statusText ? ` ${o.statusText}` : ''}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Classify any thrown value (Error, ApiError, Response-like, string, unknown). Pure; `online` is injectable for tests. */
export function classifyError(err: unknown, online: boolean = typeof navigator === 'undefined' || navigator.onLine !== false): UserErrorKind {
  const name = err && typeof err === 'object' ? String((err as { name?: unknown }).name ?? '') : '';
  const text = detailOf(err);
  const lower = text.toLowerCase();

  if (name === 'TimeoutError' || /timed? ?out|timeout/.test(lower)) return 'timeout';
  if (name === 'AbortError' || /aborted/.test(lower)) return 'timeout';

  const fromText = typeof err === 'string' || err instanceof Error ? Number(/\bHTTP[ :(]*([1-5]\d\d)\b/i.exec(text)?.[1]) || null : null;
  const status = statusOf(err) ?? fromText;
  if (status) {
    const k = kindFromStatus(status);
    if (k) return k;
  }

  if (name === 'SyntaxError' || /not valid json|unexpected token|unexpected end of json|json\.parse|malformed|phản hồi không phải json/.test(lower)) return 'parse';
  if (/failed to fetch|networkerror|network request failed|load failed|err_network|err_internet|econnrefused|fetch failed/.test(lower)) {
    return online ? 'network' : 'offline';
  }
  if (!online && (name === 'TypeError' || typeof err === 'string')) return 'offline';
  return 'unknown';
}

/**
 * Turn any error into a beginner-friendly message. `fallback` replaces the generic "unknown" line
 * (e.g. a view-specific "could not load X"). Raw text goes to `detail`, never the main line.
 */
export function toUserError(err: unknown, fallback?: string, t: Translate = tr, online?: boolean): UserError {
  const kind = classifyError(err, online);
  return {
    kind,
    message: kind === 'unknown' && fallback ? fallback : t(KEY[kind]),
    detail: detailOf(err),
  };
}

/** Short friendly line only (for inline messages that cannot host a details block). */
export function friendlyMessage(err: unknown, fallback?: string): string {
  return toUserError(err, fallback).message;
}
