/**
 * Error thrown when an upstream reverse proxy or restarting backend returns HTML
 * (or a 502/503/504 gateway page) where JSON was expected.
 */
export class TransientProxyError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TransientProxyError';
    this.status = status;
  }
}

/**
 * Safe HTTP JSON reader that surfaces clear diagnostics when a reverse proxy or
 * restarting backend returns HTML (e.g. Cloud Run 200/502/503 splash) instead
 * of throwing `Unexpected token '<', "<html>..." is not valid JSON`.
 */
export async function safeReadJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  const contentType = res.headers.get('content-type') ?? '';
  const looksLikeHtml = trimmed.startsWith('<') || contentType.includes('text/html');

  if (looksLikeHtml) {
    throw new TransientProxyError(
      `Máy chủ đang khởi động lại hoặc cổng proxy trả về HTML (HTTP ${res.status}). Vui lòng thử lại sau vài giây.`,
      res.status
    );
  }

  let parsed: unknown = null;
  if (trimmed.length > 0) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new TransientProxyError(
          `Máy chủ đang khởi động lại (HTTP ${res.status}). Vui lòng thử lại sau vài giây.`,
          res.status
        );
      }
      throw new Error(`Phản hồi không phải JSON hợp lệ (HTTP ${res.status}).`);
    }
  }

  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : `HTTP ${res.status}`;
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new TransientProxyError(msg, res.status);
    }
    throw new Error(msg);
  }

  return parsed as T;
}

export interface FetchJsonWithRetryOptions {
  /** Number of retries after the initial attempt on transient proxy/HTML/network errors. Default 2. */
  retries?: number;
  /** Base delay between retries in ms (multiplied linearly by attempt). Default 650. */
  delayMs?: number;
  /** Injectable fetch function for deterministic unit tests. */
  fetchFn?: typeof fetch;
}

function waitMs(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Fetch wrapper for idempotent JSON API reads that transparently recovers from
 * short backend restart or reverse-proxy HTML 200/502/503 responses.
 */
export async function fetchJsonWithRetry<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchJsonWithRetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 650;
  const fetchFn = options.fetchFn ?? fetch;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(input, init);
      return await safeReadJson<T>(res);
    } catch (err) {
      lastErr = err;
      if (init?.signal?.aborted) {
        throw err;
      }
      const isTransient = err instanceof TransientProxyError || err instanceof TypeError;
      if (!isTransient || attempt >= retries) {
        throw err;
      }
      await waitMs(delayMs * (attempt + 1), init?.signal);
    }
  }

  throw lastErr;
}
