/**
 * T74 - structured logger. JSON lines in production (ts, level, msg, reqId, route, durationMs, ...extra);
 * readable one-liners otherwise. Level via LOG_LEVEL (debug|info|warn|error|silent, default info).
 * Secrets (tokens, Authorization, key/token/secret fields, Bearer values) are always redacted.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<LogLevel | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|password|passwd|key|x-api-key)$|token|secret|api[-_]?key/i;
const SENSITIVE_QUERY = /^(key|token|secret|auth|password)$|token|secret|api[-_]?key/i;
export const REDACTED = '[REDACTED]';

/** Strip secret-looking query params from a URL/path (keeps the rest). */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const params = url
    .slice(q + 1)
    .split('&')
    .filter(Boolean)
    .map((p) => {
      const [k, ...v] = p.split('=');
      let name = k;
      try {
        name = decodeURIComponent(k);
      } catch {
        /* keep raw */
      }
      return SENSITIVE_QUERY.test(name) ? `${k}=${REDACTED}` : [k, ...v].join('=');
    });
  return params.length ? `${url.slice(0, q)}?${params.join('&')}` : url.slice(0, q);
}

function redactString(s: string): string {
  return s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`);
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 5) return '[Truncated]';
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  reqId?: string;
  route?: string;
  durationMs?: number;
  [extra: string]: unknown;
}

export interface LoggerOptions {
  level?: string;
  pretty?: boolean;
  sink?: (line: string, level: LogLevel) => void;
}

function resolveLevel(raw: string | undefined): number {
  const key = (raw ?? 'info').trim().toLowerCase() as keyof typeof LEVELS;
  return LEVELS[key] ?? LEVELS.info;
}

export class Logger {
  private threshold: number;
  private pretty: boolean | undefined;
  private sink: (line: string, level: LogLevel) => void;

  constructor(options: LoggerOptions = {}) {
    this.threshold = resolveLevel(options.level ?? process.env.LOG_LEVEL);
    this.pretty = options.pretty;
    this.sink =
      options.sink ??
      ((line, level) => {
        if (level === 'error') console.error(line);
        else if (level === 'warn') console.warn(line);
        else console.log(line);
      });
  }

  log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if (LEVELS[level] < this.threshold) return;
    const safe = redact(fields) as Record<string, unknown>;
    const record: LogRecord = { ts: new Date().toISOString(), level, msg: redactString(msg), ...safe };
    if (this.pretty ?? process.env.NODE_ENV !== 'production') {
      const { ts, level: lv, msg: m, ...rest } = record;
      const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
      this.sink(`${ts.slice(11, 19)} ${lv.toUpperCase()} ${m}${extra}`, level);
    } else {
      this.sink(JSON.stringify(record), level);
    }
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.log('debug', msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.log('info', msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.log('warn', msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.log('error', msg, fields);
  }
}

export const logger = new Logger();

/** Safe error summary for logs / ring buffer (no stack, no secrets). */
export function errorSummary(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: redactString(err.message).slice(0, 300) };
  return { name: 'NonError', message: redactString(String(err)).slice(0, 300) };
}
