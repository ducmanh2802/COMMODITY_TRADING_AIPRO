/**
 * Dependency-free OHLCV CSV parser (T05).
 *
 * Principles: never fabricate, never silently fix. Every rejected row is reported with its physical
 * line number; suspicious-but-plausible data is reported as a warning and left untouched.
 *
 * Timestamp convention:
 * - D1 / W1: the trading-session date exactly as written in the file, stored at 00:00:00Z of that date.
 *   Any time-of-day on a daily row is ignored (and reported as a warning).
 * - Intraday (M1…H4): the wall-clock time is interpreted in the caller-declared IANA timezone and
 *   converted to UTC. An explicit offset in the value (`Z`, `+07:00`) takes precedence. Local times that
 *   do not exist or are ambiguous because of DST are rejected, never guessed.
 */
import type { Timeframe } from '../../src/shared/types/instrument.ts';
import type { MarketCandle } from '../../src/shared/types/market.ts';
import { validateCandleSeries } from '../../src/shared/utils/validation.ts';
import type { CandleRow } from '../storage/candleRepository.ts';
import { isValidTimeZone, zonedWallTimeToUtc } from './timeZones.ts';

export const DATE_FORMATS = ['ISO', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const satisfies readonly Timeframe[];

const INTRADAY_MINUTES: Partial<Record<Timeframe, number>> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
};

function isDateBasedTimeframe(timeframe: string): boolean {
  return timeframe === 'D1' || timeframe === 'W1';
}

type CsvField = 'date' | 'time' | 'open' | 'high' | 'low' | 'close' | 'volume' | 'openInterest';

/** Normalized header (lower-case, alphanumerics only) → field. */
const HEADER_ALIASES: Record<string, CsvField> = {
  date: 'date',
  tradedate: 'date',
  tradingdate: 'date',
  sessiondate: 'date',
  day: 'date',
  datetime: 'date',
  dateandtime: 'date',
  timestamp: 'date',
  time: 'time',
  timeofday: 'time',
  open: 'open',
  o: 'open',
  openprice: 'open',
  high: 'high',
  h: 'high',
  highprice: 'high',
  low: 'low',
  l: 'low',
  lowprice: 'low',
  close: 'close',
  c: 'close',
  closeprice: 'close',
  last: 'close',
  lastprice: 'close',
  settle: 'close',
  settlement: 'close',
  settleprice: 'close',
  settlementprice: 'close',
  volume: 'volume',
  vol: 'volume',
  v: 'volume',
  totalvolume: 'volume',
  openinterest: 'openInterest',
  oi: 'openInterest',
  openint: 'openInterest',
};

export interface CsvImportIssue {
  /** 1-based physical line in the source text; null for file-level problems. */
  line: number | null;
  field?: string;
  message: string;
}

type CsvWarningCode =
  | 'PREAMBLE_SKIPPED'
  | 'FOOTER_SKIPPED'
  | 'IGNORED_COLUMNS'
  | 'ROWS_SORTED'
  | 'TIME_ON_DAILY_BAR'
  | 'WEEKEND_DATE'
  | 'SESSION_GAP'
  | 'PRICE_JUMP'
  | 'UNALIGNED_TIMESTAMP'
  | 'NON_POSITIVE_PRICE';

export interface CsvImportWarning {
  code: CsvWarningCode | string;
  line?: number | null;
  message: string;
}

export interface ParseOhlcvOptions {
  timeframe: Timeframe;
  /** IANA timezone of the source timestamps (required; recorded as an assumption for daily data). */
  timezone: string;
  dateFormat?: DateFormat;
  decimalSeparator?: '.' | ',';
  delimiter?: ',' | ';';
  /** Sort rows by timestamp before validation. Default false: out-of-order rows are errors. */
  sort?: boolean;
  /** D1 only: warn when more than N weekday sessions are missing between consecutive bars. Default 3. */
  gapThresholdSessions?: number;
  /** Warn when |close/prevClose − 1| exceeds this percentage. Default 10. */
  jumpThresholdPct?: number;
  /**
   * Accept zero/negative OHLC (e.g. CL 2020-04-20, back-adjusted continuous, spreads). Default false:
   * such rows are errors. When true they are kept and reported as a NON_POSITIVE_PRICE warning.
   */
  allowNonPositivePrices?: boolean;
  /** Used to build MarketCandle objects for the shared validator. */
  symbol: string;
  exchange: string;
  now?: Date;
}

interface ParsedBar extends CandleRow {
  line: number;
}

export interface ParseOhlcvResult {
  ok: boolean;
  bars: ParsedBar[];
  errors: CsvImportIssue[];
  warnings: CsvImportWarning[];
  delimiter: ',' | ';' | null;
  dateFormat: DateFormat | null;
  columns: Partial<Record<CsvField, string>>;
  ignoredColumns: string[];
  dataRowCount: number;
}

// ---------------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------------

interface CsvRecord {
  line: number;
  fields: string[];
}

type TokenizeResult = { ok: true; records: CsvRecord[] } | { ok: false; error: CsvImportIssue };

/** RFC 4180-style tokenizer: quoted fields, "" escapes, embedded newlines, LF / CRLF / CR. */
export function tokenizeCsv(text: string, delimiter: string): TokenizeResult {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let fieldQuoted = false;
  let afterClosingQuote = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let quoteStartLine = 1;

  const endField = () => {
    fields.push(fieldQuoted ? field : field.trim());
    field = '';
    fieldQuoted = false;
    afterClosingQuote = false;
  };
  const endRecord = () => {
    endField();
    records.push({ line: recordLine, fields });
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        field += '\n';
        line++;
      } else {
        field += c;
      }
      continue;
    }
    if (c === delimiter) {
      endField();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else if (afterClosingQuote) {
      if (c !== ' ' && c !== '\t') {
        return {
          ok: false,
          error: { line, message: 'Unexpected characters after a closing quote.' },
        };
      }
    } else if (c === '"') {
      if (field.trim() !== '') {
        return { ok: false, error: { line, message: 'Unexpected quote inside an unquoted field.' } };
      }
      field = '';
      fieldQuoted = true;
      inQuotes = true;
      quoteStartLine = line;
    } else {
      field += c;
    }
  }
  if (inQuotes) {
    return { ok: false, error: { line: quoteStartLine, message: 'Unterminated quoted field.' } };
  }
  if (field !== '' || fieldQuoted || fields.length > 0) endRecord();
  return { ok: true, records };
}

function isBlankRecord(r: CsvRecord): boolean {
  return r.fields.every((f) => f.trim() === '');
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface HeaderMapping {
  map: Partial<Record<CsvField, number>>;
  names: Partial<Record<CsvField, string>>;
  ignored: string[];
  duplicates: string[];
}

function mapHeader(fields: string[]): HeaderMapping {
  const map: Partial<Record<CsvField, number>> = {};
  const names: Partial<Record<CsvField, string>> = {};
  const ignored: string[] = [];
  const duplicates: string[] = [];
  fields.forEach((raw, idx) => {
    const field = HEADER_ALIASES[normalizeHeader(raw)];
    if (!field) {
      if (raw.trim() !== '') ignored.push(raw.trim());
      return;
    }
    if (map[field] !== undefined) {
      duplicates.push(`"${names[field]}" and "${raw.trim()}" both map to ${field}`);
      return;
    }
    map[field] = idx;
    names[field] = raw.trim();
  });
  // Exports such as Barchart label the date column "Time"; with no dedicated date column, use it as date/time.
  if (map.date === undefined && map.time !== undefined) {
    map.date = map.time;
    names.date = names.time;
    delete map.time;
    delete names.time;
  }
  return { map, names, ignored, duplicates };
}

function headerLooksValid(m: HeaderMapping): boolean {
  return m.map.date !== undefined && m.map.close !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------------------------

const PLAIN_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

type NumberParse = { ok: true; value: number | null } | { ok: false; message: string };

export function parseDecimal(raw: string, decimalSeparator: '.' | ',' | undefined): NumberParse {
  const s = raw.trim();
  if (s === '') return { ok: true, value: null };
  let normalized: string;
  if (decimalSeparator === undefined) {
    if (s.includes(',')) {
      return {
        ok: false,
        message: `"${s}" contains ',' — ambiguous thousands/decimal separator. Declare decimalSeparator.`,
      };
    }
    normalized = s;
  } else if (decimalSeparator === '.') {
    if (s.includes(',')) {
      if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
        return { ok: false, message: `"${s}" is not a valid number with '.' decimals and ',' thousands.` };
      }
      normalized = s.replace(/,/g, '');
    } else {
      normalized = s;
    }
  } else {
    let t = s;
    if (t.includes('.')) {
      if (!/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
        return { ok: false, message: `"${s}" is not a valid number with ',' decimals and '.' thousands.` };
      }
      t = t.replace(/\./g, '');
    }
    normalized = t.replace(',', '.');
    if ((s.match(/,/g) ?? []).length > 1) {
      return { ok: false, message: `"${s}" has more than one decimal separator.` };
    }
  }
  if (!PLAIN_NUMBER.test(normalized)) {
    return { ok: false, message: `"${s}" is not a plain decimal number.` };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, message: `"${s}" is not a finite number.` };
  return { ok: true, value };
}

const DATETIME_RE =
  /^(\S+?)(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const YEAR_FIRST_RE = /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/;
const YEAR_FIRST_COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DAY_MONTH_FIRST_RE = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/;

interface SplitDateTime {
  datePart: string;
  time: { hour: number; minute: number; second: number; ms: number } | null;
  offsetMinutes: number | null;
}

function splitDateTime(raw: string): SplitDateTime | null {
  const m = DATETIME_RE.exec(raw.trim());
  if (!m) return null;
  const [, datePart, hh, mi, ss, frac, offset] = m;
  let offsetMinutes: number | null = null;
  if (offset) {
    if (offset.toUpperCase() === 'Z') offsetMinutes = 0;
    else {
      const sign = offset.startsWith('-') ? -1 : 1;
      const digits = offset.slice(1).replace(':', '');
      offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4) || '0'));
    }
  }
  return {
    datePart,
    time:
      hh !== undefined
        ? {
            hour: Number(hh),
            minute: Number(mi),
            second: ss !== undefined ? Number(ss) : 0,
            ms: frac !== undefined ? Math.round(Number(`0.${frac}`) * 1000) : 0,
          }
        : null,
    offsetMinutes,
  };
}

type DateClass = 'YEAR_FIRST' | 'DAY_MONTH_FIRST' | 'UNKNOWN';

function classifyDatePart(s: string): { cls: DateClass; a?: number; b?: number } {
  if (YEAR_FIRST_RE.test(s) || YEAR_FIRST_COMPACT_RE.test(s)) return { cls: 'YEAR_FIRST' };
  const m = DAY_MONTH_FIRST_RE.exec(s);
  if (m) return { cls: 'DAY_MONTH_FIRST', a: Number(m[1]), b: Number(m[3]) };
  return { cls: 'UNKNOWN' };
}

type DetectResult = { ok: true; format: DateFormat } | { ok: false; message: string };

export function detectDateFormat(dateParts: string[]): DetectResult {
  let yearFirst = 0;
  let dayMonthFirst = 0;
  let firstAbove12 = false;
  let secondAbove12 = false;
  for (const s of dateParts) {
    const c = classifyDatePart(s);
    if (c.cls === 'YEAR_FIRST') yearFirst++;
    else if (c.cls === 'DAY_MONTH_FIRST') {
      dayMonthFirst++;
      if ((c.a ?? 0) > 12) firstAbove12 = true;
      if ((c.b ?? 0) > 12) secondAbove12 = true;
    }
  }
  if (yearFirst > 0 && dayMonthFirst > 0) {
    return { ok: false, message: 'File mixes year-first and day/month-first dates. Fix the source file.' };
  }
  if (yearFirst > 0) return { ok: true, format: 'YYYY-MM-DD' };
  if (dayMonthFirst > 0) {
    if (firstAbove12 && secondAbove12) {
      return {
        ok: false,
        message: 'Dates are inconsistent: some have the first component > 12 and others the second > 12.',
      };
    }
    if (firstAbove12) return { ok: true, format: 'DD/MM/YYYY' };
    if (secondAbove12) return { ok: true, format: 'MM/DD/YYYY' };
    return {
      ok: false,
      message:
        'Date format is ambiguous (every day value is ≤ 12, so MM/DD/YYYY and DD/MM/YYYY both fit). Declare dateFormat ("MM/DD/YYYY" or "DD/MM/YYYY").',
    };
  }
  return {
    ok: false,
    message: 'Could not detect the date format. Supported: YYYY-MM-DD / ISO-8601, MM/DD/YYYY, DD/MM/YYYY.',
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDatePart(
  s: string,
  format: DateFormat
): { ok: true; year: number; month: number; day: number } | { ok: false; message: string } {
  let year: number;
  let month: number;
  let day: number;
  if (format === 'ISO' || format === 'YYYY-MM-DD') {
    const m = YEAR_FIRST_RE.exec(s);
    const c = m ? null : YEAR_FIRST_COMPACT_RE.exec(s);
    if (m) {
      year = Number(m[1]);
      month = Number(m[3]);
      day = Number(m[4]);
    } else if (c) {
      year = Number(c[1]);
      month = Number(c[2]);
      day = Number(c[3]);
    } else {
      return { ok: false, message: `"${s}" does not match declared/detected format ${format}.` };
    }
  } else {
    const m = DAY_MONTH_FIRST_RE.exec(s);
    if (!m) return { ok: false, message: `"${s}" does not match declared/detected format ${format}.` };
    year = Number(m[4]);
    if (format === 'MM/DD/YYYY') {
      month = Number(m[1]);
      day = Number(m[3]);
    } else {
      day = Number(m[1]);
      month = Number(m[3]);
    }
  }
  if (year < 1900 || year > 2100) return { ok: false, message: `Year ${year} is out of range (1900-2100).` };
  if (month < 1 || month > 12) return { ok: false, message: `"${s}": month ${month} is invalid for ${format}.` };
  if (day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, message: `"${s}": day ${day} is invalid for ${format}.` };
  }
  return { ok: true, year, month, day };
}

// ---------------------------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------------------------

const MAX_LISTED_LINES = 20;

function linesLabel(lines: number[]): string {
  const shown = lines.slice(0, MAX_LISTED_LINES).join(', ');
  return lines.length > MAX_LISTED_LINES ? `${shown}, … (+${lines.length - MAX_LISTED_LINES} more)` : shown;
}

function weekdaysStrictlyBetween(aMs: number, bMs: number): number {
  const DAY = 86_400_000;
  let count = 0;
  for (let t = aMs + DAY; t < bMs; t += DAY) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function emptyResult(errors: CsvImportIssue[], partial: Partial<ParseOhlcvResult> = {}): ParseOhlcvResult {
  return {
    ok: false,
    bars: [],
    errors,
    warnings: partial.warnings ?? [],
    delimiter: partial.delimiter ?? null,
    dateFormat: partial.dateFormat ?? null,
    columns: partial.columns ?? {},
    ignoredColumns: partial.ignoredColumns ?? [],
    dataRowCount: partial.dataRowCount ?? 0,
  };
}

export function parseOhlcvCsv(csvText: string, options: ParseOhlcvOptions): ParseOhlcvResult {
  const errors: CsvImportIssue[] = [];
  const warnings: CsvImportWarning[] = [];
  const timeframe = options.timeframe;
  const dateBased = isDateBasedTimeframe(timeframe);

  if (!(TIMEFRAMES as readonly string[]).includes(timeframe)) {
    return emptyResult([{ line: null, message: `Unsupported timeframe ${timeframe}.` }]);
  }
  if (!isValidTimeZone(options.timezone)) {
    return emptyResult([
      { line: null, message: `"${options.timezone}" is not a valid IANA timezone (e.g. America/Chicago).` },
    ]);
  }

  const text = csvText.startsWith('﻿') ? csvText.slice(1) : csvText;

  // 1) Delimiter + header detection (header may be preceded by up to 10 preamble lines).
  const candidates: Array<',' | ';'> = options.delimiter ? [options.delimiter] : [',', ';'];
  type Found = { delimiter: ',' | ';'; records: CsvRecord[]; headerIndex: number; mapping: HeaderMapping };
  const found: Found[] = [];
  let tokenizeError: CsvImportIssue | null = null;
  for (const d of candidates) {
    const tok = tokenizeCsv(text, d);
    if (!tok.ok) {
      tokenizeError ??= tok.error;
      continue;
    }
    let nonBlankSeen = 0;
    for (let i = 0; i < tok.records.length && nonBlankSeen < 10; i++) {
      if (isBlankRecord(tok.records[i])) continue;
      nonBlankSeen++;
      const mapping = mapHeader(tok.records[i].fields);
      if (headerLooksValid(mapping)) {
        found.push({ delimiter: d, records: tok.records, headerIndex: i, mapping });
        break;
      }
    }
  }
  if (found.length === 0) {
    return emptyResult([
      tokenizeError ?? {
        line: null,
        message:
          'No header row found (need at least Date and Close/Last/Settle columns, comma- or semicolon-delimited, within the first 10 lines).',
      },
    ]);
  }
  if (found.length > 1) {
    found.sort((a, b) => b.records[b.headerIndex].fields.length - a.records[a.headerIndex].fields.length);
  }
  const { delimiter, records, headerIndex, mapping } = found[0];
  const headerRecord = records[headerIndex];

  const partial: Partial<ParseOhlcvResult> = {
    delimiter,
    columns: mapping.names,
    ignoredColumns: mapping.ignored,
  };

  if (mapping.duplicates.length > 0) {
    return emptyResult(
      [{ line: headerRecord.line, message: `Ambiguous header: ${mapping.duplicates.join('; ')}.` }],
      partial
    );
  }
  const missing = (['open', 'high', 'low', 'close'] as const).filter((f) => mapping.map[f] === undefined);
  if (missing.length > 0) {
    return emptyResult(
      [{ line: headerRecord.line, message: `Missing required column(s): ${missing.join(', ')}.` }],
      partial
    );
  }
  const preamble = records.slice(0, headerIndex).filter((r) => !isBlankRecord(r));
  if (preamble.length > 0) {
    warnings.push({
      code: 'PREAMBLE_SKIPPED',
      line: preamble[0].line,
      message: `Skipped ${preamble.length} line(s) before the header (lines ${linesLabel(preamble.map((r) => r.line))}).`,
    });
  }
  if (mapping.ignored.length > 0) {
    warnings.push({
      code: 'IGNORED_COLUMNS',
      line: headerRecord.line,
      message: `Columns not imported: ${mapping.ignored.join(', ')}.`,
    });
  }

  // 2) Data records; trailing single-field non-numeric lines are treated as an export footer.
  let dataRecords = records.slice(headerIndex + 1).filter((r) => !isBlankRecord(r));
  const footer: CsvRecord[] = [];
  while (dataRecords.length > 0) {
    const last = dataRecords[dataRecords.length - 1];
    const nonEmpty = last.fields.filter((f) => f.trim() !== '');
    if (nonEmpty.length === 1 && !/^\d/.test(nonEmpty[0].trim())) {
      footer.unshift(last);
      dataRecords = dataRecords.slice(0, -1);
    } else break;
  }
  if (footer.length > 0) {
    warnings.push({
      code: 'FOOTER_SKIPPED',
      line: footer[0].line,
      message: `Skipped ${footer.length} trailing non-data line(s) (lines ${linesLabel(footer.map((r) => r.line))}).`,
    });
  }
  partial.dataRowCount = dataRecords.length;
  partial.warnings = warnings;
  if (dataRecords.length === 0) {
    return emptyResult([{ line: null, message: 'No data rows found after the header.' }], partial);
  }

  const headerWidth = headerRecord.fields.length;
  const col = mapping.map;
  const numericFields = (['open', 'high', 'low', 'close', 'volume', 'openInterest'] as const).filter(
    (f) => col[f] !== undefined
  );

  // Semicolon files are usually European-formatted: require the decimal separator to be declared.
  if (delimiter === ';' && options.decimalSeparator === undefined) {
    const offending = dataRecords.find((r) =>
      numericFields.some((f) => /[.,]/.test(r.fields[col[f] as number] ?? ''))
    );
    if (offending) {
      return emptyResult(
        [
          {
            line: offending.line,
            message:
              'Semicolon-delimited file with separators in numbers: declare decimalSeparator ("." or ",") — "1.234" could mean 1.234 or 1234.',
          },
        ],
        partial
      );
    }
  }

  // 3) Date format: declared, or detected unambiguously from all rows.
  const splits = dataRecords.map((r) => splitDateTime(r.fields[col.date as number] ?? ''));
  let dateFormat: DateFormat;
  if (options.dateFormat) {
    dateFormat = options.dateFormat;
  } else {
    const detected = detectDateFormat(splits.filter((s): s is SplitDateTime => s !== null).map((s) => s.datePart));
    if (!detected.ok) return emptyResult([{ line: null, field: 'date', message: detected.message }], partial);
    dateFormat = detected.format;
  }
  partial.dateFormat = dateFormat;

  // 4) Row parsing.
  const bars: ParsedBar[] = [];
  const dailyTimeLines: number[] = [];
  const weekendLines: number[] = [];
  const unalignedLines: number[] = [];
  const nonPositiveLines: number[] = [];
  const allowNonPositive = options.allowNonPositivePrices === true;
  const nowMs = (options.now ?? new Date()).getTime();
  const tfMinutes = INTRADAY_MINUTES[timeframe];

  dataRecords.forEach((rec, idx) => {
    const line = rec.line;
    const rowErrors: CsvImportIssue[] = [];
    if (rec.fields.length > headerWidth) {
      errors.push({
        line,
        message: `Row has ${rec.fields.length} fields but the header has ${headerWidth} (unquoted decimal comma or stray delimiter?).`,
      });
      return;
    }
    const get = (f: CsvField): string => (col[f] === undefined ? '' : (rec.fields[col[f] as number] ?? ''));

    // Date / time
    const split = splits[idx];
    let timestampMs: number | null = null;
    if (!split) {
      rowErrors.push({ line, field: 'date', message: `Unparseable date/time "${get('date')}".` });
    } else {
      const dp = parseDatePart(split.datePart, dateFormat);
      if (!dp.ok) {
        rowErrors.push({ line, field: 'date', message: dp.message });
      } else {
        let time = split.time;
        const timeRaw = get('time').trim();
        if (timeRaw !== '') {
          if (time) {
            rowErrors.push({ line, field: 'time', message: 'Time given in both the date and the time column.' });
          } else {
            const tm = TIME_RE.exec(timeRaw);
            if (!tm) rowErrors.push({ line, field: 'time', message: `Unparseable time "${timeRaw}".` });
            else time = { hour: Number(tm[1]), minute: Number(tm[2]), second: Number(tm[3] ?? '0'), ms: 0 };
          }
        }
        if (time && (time.hour > 23 || time.minute > 59 || time.second > 59)) {
          rowErrors.push({ line, field: 'time', message: 'Time of day out of range.' });
        } else if (rowErrors.length === 0) {
          if (dateBased) {
            timestampMs = Date.UTC(dp.year, dp.month - 1, dp.day);
            if (time && (time.hour || time.minute || time.second || time.ms)) dailyTimeLines.push(line);
            const dow = new Date(timestampMs).getUTCDay();
            if (timeframe === 'D1' && (dow === 0 || dow === 6)) weekendLines.push(line);
          } else if (!time) {
            rowErrors.push({ line, field: 'time', message: `Intraday timeframe ${timeframe} requires a time of day.` });
          } else {
            if (tfMinutes && (time.second !== 0 || time.ms !== 0 || (time.hour * 60 + time.minute) % tfMinutes !== 0)) {
              unalignedLines.push(line);
            }
            if (split.offsetMinutes !== null) {
              timestampMs =
                Date.UTC(dp.year, dp.month - 1, dp.day, time.hour, time.minute, time.second, time.ms) -
                split.offsetMinutes * 60_000;
            } else {
              const conv = zonedWallTimeToUtc(
                { year: dp.year, month: dp.month, day: dp.day, hour: time.hour, minute: time.minute, second: time.second },
                options.timezone
              );
              if (!conv.ok) {
                rowErrors.push({
                  line,
                  field: 'date',
                  message:
                    conv.reason === 'NONEXISTENT_LOCAL_TIME'
                      ? `Local time does not exist in ${options.timezone} (DST gap).`
                      : `Local time is ambiguous in ${options.timezone} (DST overlap); use explicit UTC offsets.`,
                });
              } else {
                timestampMs = conv.utcMs + time.ms;
              }
            }
          }
          if (timestampMs !== null && timestampMs > nowMs + 86_400_000) {
            rowErrors.push({ line, field: 'date', message: 'Bar is dated in the future.' });
          }
        }
      }
    }

    // Numbers
    const values: Partial<Record<CsvField, number | null>> = {};
    for (const f of numericFields) {
      const parsed = parseDecimal(get(f), options.decimalSeparator);
      if (!parsed.ok) {
        rowErrors.push({ line, field: f, message: parsed.message });
        continue;
      }
      values[f] = parsed.value;
    }
    let rowNonPositive = false;
    for (const f of ['open', 'high', 'low', 'close'] as const) {
      const v = values[f];
      if (v === null) rowErrors.push({ line, field: f, message: `Missing ${f} price.` });
      else if (v !== undefined && v <= 0) {
        if (allowNonPositive) rowNonPositive = true;
        else {
          rowErrors.push({
            line,
            field: f,
            message: `Non-positive ${f} price ${v} (zero/negative prices are not accepted unless allowNonPositivePrices is set).`,
          });
        }
      }
    }
    for (const f of ['volume', 'openInterest'] as const) {
      const v = values[f];
      if (v !== undefined && v !== null && v < 0) rowErrors.push({ line, field: f, message: `Negative ${f} ${v}.` });
    }

    if (rowErrors.length > 0 || timestampMs === null) {
      errors.push(...rowErrors);
      return;
    }
    if (rowNonPositive) nonPositiveLines.push(line);
    bars.push({
      line,
      timestampMs,
      open: values.open as number,
      high: values.high as number,
      low: values.low as number,
      close: values.close as number,
      volume: values.volume ?? null,
      openInterest: values.openInterest ?? null,
    });
  });

  if (dailyTimeLines.length > 0) {
    warnings.push({
      code: 'TIME_ON_DAILY_BAR',
      line: dailyTimeLines[0],
      message: `${dailyTimeLines.length} daily row(s) carry a non-midnight time that was ignored; the date as written is used as the session date (lines ${linesLabel(dailyTimeLines)}).`,
    });
  }
  if (weekendLines.length > 0) {
    warnings.push({
      code: 'WEEKEND_DATE',
      line: weekendLines[0],
      message: `${weekendLines.length} daily bar(s) dated on a Saturday/Sunday — check the session-date convention of the source (lines ${linesLabel(weekendLines)}).`,
    });
  }
  if (nonPositiveLines.length > 0) {
    warnings.push({
      code: 'NON_POSITIVE_PRICE',
      line: nonPositiveLines[0],
      message: `${nonPositiveLines.length} bar(s) have a zero/negative price (accepted because allowNonPositivePrices is in effect); returns, log returns, volatility and correlation are undefined across them (lines ${linesLabel(nonPositiveLines)}).`,
    });
  }
  if (unalignedLines.length > 0) {
    warnings.push({
      code: 'UNALIGNED_TIMESTAMP',
      line: unalignedLines[0],
      message: `${unalignedLines.length} bar(s) not aligned to ${timeframe} boundaries (lines ${linesLabel(unalignedLines)}).`,
    });
  }

  // 5) Optional sort, then the shared series validator (duplicates, order, OHLC relationships).
  let ordered = bars;
  if (options.sort) {
    ordered = [...bars].sort((a, b) => a.timestampMs - b.timestampMs);
    if (ordered.some((b, i) => b !== bars[i])) {
      warnings.push({ code: 'ROWS_SORTED', line: null, message: 'Rows were re-ordered by timestamp (sort=true).' });
    }
  }

  if (ordered.length > 0) {
    const retrievedAt = new Date(nowMs).toISOString();
    const candles: MarketCandle[] = ordered.map((b) => ({
      symbol: options.symbol,
      exchange: options.exchange,
      timeframe,
      timestamp: new Date(b.timestampMs).toISOString(),
      retrievedAt,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      openInterest: b.openInterest,
      isComplete: true,
      source: 'CSV_HISTORICAL',
      status: 'HISTORICAL',
    }));
    const validation = validateCandleSeries(candles, { allowNonPositivePrices: allowNonPositive });
    for (const msg of validation.errors) {
      const m = /^Candle\[(\d+)\]\s*(.*)$/.exec(msg);
      if (m) {
        const bar = ordered[Number(m[1])];
        errors.push({ line: bar?.line ?? null, message: m[2].replace(/\.$/, '') + '.' });
      } else {
        errors.push({ line: null, message: msg });
      }
    }
  }

  errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  if (errors.length > 0) {
    return { ...emptyResult(errors, { ...partial, warnings }), dateFormat };
  }

  // 6) Suspicious-data warnings (reported, never altered).
  const jumpPct = options.jumpThresholdPct ?? 10;
  const gapThreshold = options.gapThresholdSessions ?? 3;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    // A percentage move is meaningless when the previous close is ≤ 0 (NON_POSITIVE_PRICE already reported).
    const changePct = prev.close > 0 ? (cur.close / prev.close - 1) * 100 : 0;
    if (Math.abs(changePct) > jumpPct) {
      warnings.push({
        code: 'PRICE_JUMP',
        line: cur.line,
        message: `Close moved ${changePct.toFixed(2)}% vs previous bar (line ${prev.line}): possible roll, limit move or unit error.`,
      });
    }
    if (timeframe === 'D1') {
      const missing = weekdaysStrictlyBetween(prev.timestampMs, cur.timestampMs);
      if (missing > gapThreshold) {
        warnings.push({
          code: 'SESSION_GAP',
          line: cur.line,
          message: `${missing} weekday session(s) missing between ${new Date(prev.timestampMs).toISOString().slice(0, 10)} and ${new Date(cur.timestampMs).toISOString().slice(0, 10)}.`,
        });
      }
    } else if (timeframe === 'W1' && cur.timestampMs - prev.timestampMs > 14 * 86_400_000) {
      warnings.push({
        code: 'SESSION_GAP',
        line: cur.line,
        message: `More than one week missing before this weekly bar.`,
      });
    }
  }

  return {
    ok: true,
    bars: ordered,
    errors: [],
    warnings,
    delimiter,
    dateFormat,
    columns: mapping.names,
    ignoredColumns: mapping.ignored,
    dataRowCount: dataRecords.length,
  };
}
