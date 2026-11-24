/**
 * T73 Backup: export / import of personal data kept in localStorage (paper trading, watchlist, chart drawings,
 * learning progress, learn goal, review schedule) plus a CSV export of closed paper trades. Pure: storage is injected.
 */

const BACKUP_VERSION = 1;

/** localStorage keys. Keep in sync with the owning modules (paperModel LOCAL_KEY, watchlist, drawings, learn/*). */
export const BACKUP_KEYS = {
  paper: 'paperTrading.v2',
  watchlist: 'ctap.watchlist',
  drawings: 'ctap.drawings.v1',
  learn: 'learn.progress.v2',
  learnGoal: 'ctap.learnGoal',
  review: 'ctap.review.v1',
} as const;

export type BackupSection = keyof typeof BACKUP_KEYS;
const BACKUP_SECTIONS = Object.keys(BACKUP_KEYS) as BackupSection[];

type BackupData = Record<BackupSection, unknown>;

export interface Backup {
  version: number;
  exportedAt: string;
  data: BackupData;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RestoreMode = 'merge' | 'replace';

function readValue(storage: StorageLike, key: string): unknown {
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // plain string value (e.g. learn goal)
  }
}

export function buildBackup(storage: StorageLike, now: Date = new Date()): Backup {
  const data = {} as BackupData;
  for (const s of BACKUP_SECTIONS) data[s] = readValue(storage, BACKUP_KEYS[s]);
  return { version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type ValidateResult = { ok: true; backup: Backup } | { ok: false; error: string };

export function validateBackup(json: unknown): ValidateResult {
  let v = json;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return { ok: false, error: 'Tệp không phải JSON hợp lệ.' };
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { ok: false, error: 'Tệp không đúng định dạng bản sao lưu.' };
  }
  const o = v as Record<string, unknown>;
  if (typeof o.version !== 'number') return { ok: false, error: 'Thiếu số phiên bản bản sao lưu.' };
  if (o.version > BACKUP_VERSION) {
    return { ok: false, error: 'Bản sao lưu được tạo bởi phiên bản mới hơn, chưa thể khôi phục.' };
  }
  if (o.version < 1) return { ok: false, error: 'Phiên bản bản sao lưu không hợp lệ.' };
  if (typeof o.exportedAt !== 'string') return { ok: false, error: 'Thiếu thời điểm xuất bản sao lưu.' };
  if (!o.data || typeof o.data !== 'object' || Array.isArray(o.data)) {
    return { ok: false, error: 'Thiếu phần dữ liệu trong bản sao lưu.' };
  }
  const d = o.data as Record<string, unknown>;
  const data = {} as BackupData;
  for (const s of BACKUP_SECTIONS) data[s] = d[s] === undefined ? null : d[s];
  const paper = data.paper;
  if (paper !== null && (typeof paper !== 'object' || Array.isArray(paper))) {
    return { ok: false, error: 'Dữ liệu giao dịch thử trong tệp không hợp lệ.' };
  }
  if (data.watchlist !== null && typeof data.watchlist !== 'object') {
    return { ok: false, error: 'Dữ liệu danh sách theo dõi trong tệp không hợp lệ.' };
  }
  if (data.drawings !== null && typeof data.drawings !== 'object') {
    return { ok: false, error: 'Dữ liệu nét vẽ biểu đồ trong tệp không hợp lệ.' };
  }
  if (data.learn !== null && (typeof data.learn !== 'object' || Array.isArray(data.learn))) {
    return { ok: false, error: 'Dữ liệu tiến độ học trong tệp không hợp lệ.' };
  }
  if (data.learnGoal !== null && typeof data.learnGoal !== 'string') {
    return { ok: false, error: 'Mục tiêu học trong tệp không hợp lệ.' };
  }
  if (data.review !== null && typeof data.review !== 'object') {
    return { ok: false, error: 'Lịch ôn tập trong tệp không hợp lệ.' };
  }
  return { ok: true, backup: { version: o.version, exportedAt: o.exportedAt, data } };
}

function itemKey(x: unknown): string {
  if (x && typeof x === 'object' && 'id' in x) return `id:${String((x as { id: unknown }).id)}`;
  return `j:${JSON.stringify(x)}`;
}

/** Merge: arrays are united by `id` (existing wins), objects merged recursively, scalars keep the existing value. */
function mergeValues(existing: unknown, incoming: unknown): unknown {
  if (existing === null || existing === undefined) return incoming;
  if (incoming === null || incoming === undefined) return existing;
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const seen = new Set(existing.map(itemKey));
    return [...existing, ...incoming.filter((x) => !seen.has(itemKey(x)))];
  }
  if (typeof existing === 'object' && typeof incoming === 'object' && !Array.isArray(existing) && !Array.isArray(incoming)) {
    const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      out[k] = k in out ? mergeValues(out[k], v) : v;
    }
    return out;
  }
  return existing;
}

function writeValue(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

/** Writes a validated backup into storage. Returns the sections that were written. */
export function restoreBackup(
  json: unknown,
  mode: RestoreMode,
  storage: StorageLike
): { ok: true; restored: BackupSection[] } | { ok: false; error: string } {
  const v = validateBackup(json);
  if (!v.ok) return v;
  const restored: BackupSection[] = [];
  for (const s of BACKUP_SECTIONS) {
    const incoming = v.backup.data[s];
    if (incoming === null) continue;
    const value = mode === 'merge' ? mergeValues(readValue(storage, BACKUP_KEYS[s]), incoming) : incoming;
    try {
      writeValue(storage, BACKUP_KEYS[s], value);
      restored.push(s);
    } catch {
      return { ok: false, error: 'Không ghi được dữ liệu vào trình duyệt (bộ nhớ đầy hoặc bị chặn).' };
    }
  }
  return { ok: true, restored };
}

export interface CsvTrade {
  openedAtMs: number;
  closedAtMs: number;
  instrumentId: string;
  side: string;
  contracts: number;
  entryPrice: number;
  exitPrice: number;
  pnlVnd: number;
  rMultiple: number | null;
  plan?: { onPlan: boolean };
}

const CSV_HEADER = ['Ngày mở', 'Ngày đóng', 'Mã', 'Chiều', 'Số HĐ', 'Giá vào', 'Giá ra', 'Lãi/lỗ (VND)', 'R', 'Theo kế hoạch'];

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmtDate(ms: number): string {
  return Number.isFinite(ms) ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '';
}

/** Closed paper trades as CSV, UTF-8 with BOM so Excel shows Vietnamese correctly. */
export function tradesToCsv(trades: CsvTrade[]): string {
  const rows = trades.map((t) => [
    fmtDate(t.openedAtMs),
    fmtDate(t.closedAtMs),
    t.instrumentId,
    t.side === 'LONG' ? 'Mua' : t.side === 'SHORT' ? 'Bán' : t.side,
    t.contracts,
    t.entryPrice,
    t.exitPrice,
    Math.round(t.pnlVnd),
    t.rMultiple === null || t.rMultiple === undefined ? '' : Math.round(t.rMultiple * 100) / 100,
    t.plan ? (t.plan.onPlan ? 'Có' : 'Không') : '',
  ]);
  return '﻿' + [CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
