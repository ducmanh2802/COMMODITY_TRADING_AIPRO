/** I5 Paper trading journal — CSV export of closed trades (pure, no React). UTF-8 BOM so Excel reads Vietnamese. */
export interface CsvTrade {
  openedAtMs?: number | null;
  closedAtMs?: number | null;
  instrumentName: string;
  side: string;
  contracts: number;
  entryPrice: number;
  exitPrice: number;
  stopLoss?: number | null;
  pnlVnd: number;
  rMultiple?: number | null;
  tags?: string[];
  note?: string;
}

export const CSV_BOM = '﻿';
export const CSV_HEADER = ['Ngày mở', 'Ngày đóng', 'Mã hàng hóa', 'Chiều', 'Số lượng', 'Giá vào', 'Giá ra', 'Cắt lỗ', 'Lãi/lỗ (VND)', 'R', 'Thẻ', 'Ghi chú'];

export function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection for free text.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const isoDate = (ms: number | null | undefined): string => (typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '');

/** R multiple, only when the stop is known. */
export function tradeR(x: CsvTrade): number | null {
  if (x.stopLoss === null || x.stopLoss === undefined) return null;
  if (x.rMultiple !== null && x.rMultiple !== undefined && Number.isFinite(x.rMultiple)) return x.rMultiple;
  return null;
}

export function buildJournalCsv(trades: CsvTrade[]): string {
  const rows = [...trades]
    .sort((a, b) => (a.closedAtMs ?? 0) - (b.closedAtMs ?? 0))
    .map((x) => {
      const r = tradeR(x);
      return [
        isoDate(x.openedAtMs),
        isoDate(x.closedAtMs),
        x.instrumentName,
        x.side,
        x.contracts,
        x.entryPrice,
        x.exitPrice,
        x.stopLoss ?? '',
        Math.round(x.pnlVnd),
        r === null ? '' : Math.round(r * 100) / 100,
        (x.tags ?? []).join('; '),
        x.note ?? '',
      ]
        .map(csvEscape)
        .join(',');
    });
  return CSV_BOM + [CSV_HEADER.map(csvEscape).join(','), ...rows].join('\r\n') + '\r\n';
}
