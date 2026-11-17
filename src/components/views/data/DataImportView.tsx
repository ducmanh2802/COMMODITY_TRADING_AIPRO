import { useCallback, useEffect, useRef, useState } from 'react';
import { FileUp, KeyRound, Play, Upload } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import type { Timeframe } from '../../../shared/types/instrument';
import {
  ApiError,
  CONTINUOUS_ADJUSTMENTS,
  DATE_FORMATS,
  IMPORT_MODES,
  IMPORT_TIMEFRAMES,
  SOURCE_QUALITIES,
  deleteDataset,
  fetchDatasets,
  getAdminToken,
  postImport,
  setAdminToken,
  type ContinuousAdjustment,
  type DatasetRecord,
  type DateFormat,
  type ImportMode,
  type ImportReport,
  type ImportRequest,
  type SourceQuality,
} from '../../../api/dataApi';
import { ConfirmDeleteDialog, DatasetTable } from './DatasetTable';
import { ImportReportPanel } from './ImportReportPanel';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const OTHER_TZ = '__other__';
const COMMON_TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Asia/Singapore',
  'Asia/Ho_Chi_Minh',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'UTC',
];
const MONTH_CODES = 'F=Jan G=Feb H=Mar J=Apr K=May M=Jun N=Jul Q=Aug U=Sep V=Oct X=Nov Z=Dec';

const inputCls =
  'w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 text-xs text-[#E5E7EB] placeholder:text-[#E5E7EB]/35 focus:outline-none focus:border-[#6366F1] disabled:opacity-50';
const labelCls = 'block text-xs font-medium text-[#E5E7EB]/75 mb-1';
const hintCls = 'mt-1 text-[11px] text-[#E5E7EB]/45 leading-snug';

interface FormState {
  instrumentId: string;
  contractCode: string;
  continuousAdjustment: Exclude<ContinuousAdjustment, 'NONE'> | '';
  timeframe: Timeframe;
  tzChoice: string;
  tzCustom: string;
  dateFormat: DateFormat | '';
  delimiter: ',' | ';' | '';
  decimalSeparator: '.' | ',' | '';
  sourceLabel: string;
  sourceQuality: SourceQuality | '';
  priceUnit: string;
  mode: ImportMode;
  sort: boolean;
}

const INITIAL_FORM: FormState = {
  instrumentId: '',
  contractCode: '',
  continuousAdjustment: '',
  timeframe: 'D1',
  tzChoice: '',
  tzCustom: '',
  dateFormat: '',
  delimiter: '',
  decimalSeparator: '',
  sourceLabel: '',
  sourceQuality: '',
  priceUnit: '',
  mode: 'reject_conflicts',
  sort: false,
};

let nextFileId = 1;

interface LoadedFile {
  id: number;
  name: string;
  size: number;
  text: string;
}

interface ReportState {
  report: ImportReport;
  httpStatus: number;
  /** Serialized request (minus dryRun) the report was produced for. */
  signature: string;
}

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unexpected error.';
}

export function DataImportView() {
  const { instruments, loading: instrumentsLoading } = useTerminal();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [token, setToken] = useState<string>(() => getAdminToken());
  const [busy, setBusy] = useState<'dry' | 'import' | null>(null);
  const [requestError, setRequestError] = useState<{ message: string; auth: boolean } | null>(null);
  const [dryRun, setDryRun] = useState<ReportState | null>(null);
  const [importResult, setImportResult] = useState<ReportState | null>(null);

  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DatasetRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const loadDatasets = useCallback(async () => {
    setDatasetsLoading(true);
    setDatasetsError(null);
    try {
      setDatasets(await fetchDatasets());
    } catch (err) {
      setDatasetsError(errorText(err));
    } finally {
      setDatasetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  const timezone = form.tzChoice === OTHER_TZ ? form.tzCustom.trim() : form.tzChoice;
  const contractCode = form.contractCode.trim().toUpperCase();
  const isContinuous = contractCode === 'CONTINUOUS';

  const missing: string[] = [];
  if (!file) missing.push('CSV file');
  if (!form.instrumentId) missing.push('instrument');
  if (!contractCode) missing.push('contract code');
  else if (!/^[A-Z0-9._-]{1,32}$/.test(contractCode)) missing.push('valid contract code (A–Z, 0–9, . _ -)');
  if (isContinuous && !form.continuousAdjustment) missing.push('continuous adjustment');
  if (!timezone) missing.push('source timezone');
  if (!form.sourceLabel.trim()) missing.push('source label');
  if (!form.sourceQuality) missing.push('source quality');

  const request = ((): Omit<ImportRequest, 'dryRun'> | null => {
    if (missing.length > 0 || !file || !form.sourceQuality) return null;
    const r: Omit<ImportRequest, 'dryRun'> = {
      instrumentId: form.instrumentId,
      contractCode,
      timeframe: form.timeframe,
      csv: file.text,
      timezone,
      sourceLabel: form.sourceLabel.trim(),
      sourceQuality: form.sourceQuality,
      mode: form.mode,
      sort: form.sort,
    };
    if (form.dateFormat) r.dateFormat = form.dateFormat;
    if (form.delimiter) r.delimiter = form.delimiter;
    if (form.decimalSeparator) r.decimalSeparator = form.decimalSeparator;
    if (form.priceUnit.trim()) r.priceUnit = form.priceUnit.trim();
    if (isContinuous && form.continuousAdjustment) r.continuousAdjustment = form.continuousAdjustment;
    return r;
  })();

  // Identity for "the dry run matches the current inputs". The CSV is identified by the loaded file
  // object (a re-pick of the same file creates a new object, which invalidates the dry run).
  const signature = request && file ? JSON.stringify({ ...request, csv: undefined, fileId: file.id }) : '';

  const dryRunMatches = dryRun !== null && dryRun.signature === signature && signature !== '';
  const canImport = dryRunMatches && dryRun.report.ok && dryRun.report.errorCount === 0 && busy === null;

  const onFileChosen = (f: File | undefined) => {
    setFileError(null);
    setFile(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setFileError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB. Split the file and import in parts.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) {
        setFileError('File is empty.');
        return;
      }
      setFile({ id: nextFileId++, name: f.name, size: f.size, text });
    };
    reader.onerror = () => setFileError('Could not read the file.');
    reader.readAsText(f);
  };

  const run = async (dry: boolean) => {
    if (!request) return;
    setBusy(dry ? 'dry' : 'import');
    setRequestError(null);
    if (dry) setImportResult(null);
    try {
      const { httpStatus, report } = await postImport({ ...request, dryRun: dry });
      const state = { report, httpStatus, signature };
      if (dry) {
        setDryRun(state);
      } else {
        setImportResult(state);
        if (report.ok) {
          setDryRun(null);
          void loadDatasets();
        }
      }
    } catch (err) {
      setRequestError({ message: errorText(err), auth: err instanceof ApiError && err.isAuthError });
    } finally {
      setBusy(null);
    }
  };

  const saveToken = (value: string) => {
    setToken(value);
    setAdminToken(value.trim());
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteDataset(pendingDelete.id);
      setPendingDelete(null);
      void loadDatasets();
    } catch (err) {
      setDeleteError(errorText(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  const shownReport = importResult ?? (dryRun && dryRunMatches ? dryRun : null);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Data Import</h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Import historical OHLCV from CSV. Rows are validated, never corrected: a bad line rejects the whole file.
          </p>
        </div>
        <div className="w-full md:w-80">
          <label htmlFor="admin-token" className={`${labelCls} flex items-center gap-1.5`}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> Admin token
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            placeholder="Required for import/delete on non-local servers"
            className={inputCls}
          />
          <p className={hintCls}>Kept in sessionStorage for this tab only; sent as Authorization: Bearer.</p>
        </div>
      </div>

      <form
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(true);
        }}
      >
        {/* File */}
        <div>
          <label htmlFor="csv-file" className={labelCls}>
            CSV file (≤ 10 MB)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFileChosen(e.target.files?.[0])}
              className="text-xs text-[#E5E7EB]/80 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[#263244] file:bg-[#172033] file:text-[#E5E7EB] file:text-xs hover:file:bg-[#1E293B]"
            />
            {file && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[#E5E7EB]/70">
                <FileUp className="w-3.5 h-3.5 text-[#6366F1]" aria-hidden="true" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB · {file.text.split(/\r?\n/).length.toLocaleString()} lines
              </span>
            )}
          </div>
          {fileError && <p className="mt-1 text-xs text-[#EF4444]">{fileError}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label htmlFor="imp-instrument" className={labelCls}>
              Instrument
            </label>
            <select
              id="imp-instrument"
              value={form.instrumentId}
              onChange={(e) => update('instrumentId', e.target.value)}
              className={inputCls}
            >
              <option value="">{instrumentsLoading ? 'Loading…' : 'Select instrument…'}</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.exchange}:{i.exchangeSymbol} — {i.productName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="imp-contract" className={labelCls}>
              Contract code
            </label>
            <input
              id="imp-contract"
              value={form.contractCode}
              onChange={(e) => update('contractCode', e.target.value)}
              placeholder="e.g. ZCH25 or CONTINUOUS"
              className={`${inputCls} font-mono uppercase`}
              list="contract-code-suggestions"
            />
            <datalist id="contract-code-suggestions">
              <option value="CONTINUOUS" />
            </datalist>
            <p className={hintCls}>Root + month code + year. {MONTH_CODES}</p>
          </div>

          <div>
            <label htmlFor="imp-adjust" className={labelCls}>
              Continuous adjustment
            </label>
            <select
              id="imp-adjust"
              value={isContinuous ? form.continuousAdjustment : ''}
              onChange={(e) => update('continuousAdjustment', e.target.value as FormState['continuousAdjustment'])}
              disabled={!isContinuous}
              className={inputCls}
            >
              <option value="">{isContinuous ? 'Select (required)…' : 'NONE (specific contract)'}</option>
              {CONTINUOUS_ADJUSTMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <p className={hintCls}>Only for CONTINUOUS series.</p>
          </div>

          <div>
            <label htmlFor="imp-tf" className={labelCls}>
              Timeframe
            </label>
            <select
              id="imp-tf"
              value={form.timeframe}
              onChange={(e) => update('timeframe', e.target.value as Timeframe)}
              className={inputCls}
            >
              {IMPORT_TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="imp-tz" className={labelCls}>
              Source timezone <span className="text-[#EF4444]">*</span>
            </label>
            <select
              id="imp-tz"
              value={form.tzChoice}
              onChange={(e) => update('tzChoice', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">Select timezone…</option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value={OTHER_TZ}>Other IANA zone…</option>
            </select>
            {form.tzChoice === OTHER_TZ && (
              <input
                aria-label="Custom IANA timezone"
                value={form.tzCustom}
                onChange={(e) => update('tzCustom', e.target.value)}
                placeholder="e.g. Europe/Berlin"
                className={`${inputCls} mt-2 font-mono`}
              />
            )}
            <p className={hintCls}>
              Timezone of the source file’s timestamps. D1/W1 bars keep the session date as written; intraday bars are converted to UTC.
            </p>
          </div>

          <div>
            <label htmlFor="imp-datefmt" className={labelCls}>
              Date format
            </label>
            <select
              id="imp-datefmt"
              value={form.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value as FormState['dateFormat'])}
              className={inputCls}
            >
              <option value="">Auto-detect (only if unambiguous)</option>
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="imp-delim" className={labelCls}>
                Delimiter
              </label>
              <select
                id="imp-delim"
                value={form.delimiter}
                onChange={(e) => update('delimiter', e.target.value as FormState['delimiter'])}
                className={inputCls}
              >
                <option value="">Auto</option>
                <option value=",">Comma ,</option>
                <option value=";">Semicolon ;</option>
              </select>
            </div>
            <div>
              <label htmlFor="imp-decimal" className={labelCls}>
                Decimal sep.
              </label>
              <select
                id="imp-decimal"
                value={form.decimalSeparator}
                onChange={(e) => update('decimalSeparator', e.target.value as FormState['decimalSeparator'])}
                className={inputCls}
              >
                <option value="">Default (.)</option>
                <option value=".">Dot .</option>
                <option value=",">Comma ,</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="imp-unit" className={labelCls}>
              Price unit (optional)
            </label>
            <input
              id="imp-unit"
              value={form.priceUnit}
              onChange={(e) => update('priceUnit', e.target.value)}
              placeholder="Default: Instrument Master quotation unit"
              className={inputCls}
            />
            <p className={hintCls}>Recorded as-is; prices are never converted.</p>
          </div>

          <div>
            <label htmlFor="imp-source" className={labelCls}>
              Source label <span className="text-[#EF4444]">*</span>
            </label>
            <input
              id="imp-source"
              value={form.sourceLabel}
              onChange={(e) => update('sourceLabel', e.target.value)}
              placeholder="e.g. Barchart export"
              maxLength={200}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="imp-quality" className={labelCls}>
              Source quality <span className="text-[#EF4444]">*</span>
            </label>
            <select
              id="imp-quality"
              value={form.sourceQuality}
              onChange={(e) => update('sourceQuality', e.target.value as FormState['sourceQuality'])}
              className={inputCls}
            >
              <option value="">Select…</option>
              {SOURCE_QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="imp-mode" className={labelCls}>
              Mode
            </label>
            <select
              id="imp-mode"
              value={form.mode}
              onChange={(e) => update('mode', e.target.value as ImportMode)}
              className={inputCls}
            >
              {IMPORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <p className={hintCls}>
              {form.mode === 'reject_conflicts'
                ? 'Identical rows skipped; any changed OHLC rejects the file.'
                : form.mode === 'append'
                  ? 'Only new timestamps are added; never overwrites.'
                  : 'Deletes ALL existing candles and datasets of this series first.'}
            </p>
          </div>

          <div className="flex items-start gap-2 pt-6">
            <input
              id="imp-sort"
              type="checkbox"
              checked={form.sort}
              onChange={(e) => update('sort', e.target.checked)}
              className="mt-0.5 accent-[#6366F1]"
            />
            <label htmlFor="imp-sort" className="text-xs text-[#E5E7EB]/75">
              Sort rows by time (otherwise out-of-order rows are errors)
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#263244]">
          <button
            type="submit"
            disabled={!request || busy !== null}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#6366F1] text-white hover:bg-[#5458E8] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {busy === 'dry' ? 'Running dry run…' : 'Dry run'}
          </button>
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={!canImport}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[#22C55E] text-[#0B0E14] hover:bg-[#16A34A] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            {busy === 'import' ? 'Importing…' : 'Import'}
          </button>
          <span className="text-xs text-[#E5E7EB]/55">
            {missing.length > 0
              ? `Required: ${missing.join(', ')}.`
              : !dryRunMatches
                ? 'Run a dry run first — Import unlocks after a dry run with 0 errors for these exact inputs.'
                : canImport
                  ? 'Dry run passed. Review warnings, then Import.'
                  : 'Dry run reported errors — fix the file or settings and run it again.'}
          </span>
        </div>

        {requestError && (
          <p
            role="alert"
            className={`text-xs rounded-md px-3 py-2 border ${
              requestError.auth
                ? 'text-[#F59E0B] border-[#F59E0B]/40 bg-[#F59E0B]/10'
                : 'text-[#EF4444] border-[#EF4444]/40 bg-[#EF4444]/10'
            }`}
          >
            {requestError.message}
          </p>
        )}
      </form>

      {shownReport && (
        <ImportReportPanel report={shownReport.report} httpStatus={shownReport.httpStatus} timeframe={form.timeframe} />
      )}

      <DatasetTable
        datasets={datasets}
        loading={datasetsLoading}
        error={datasetsError}
        onRefresh={() => void loadDatasets()}
        onRequestDelete={(d) => {
          setDeleteError(null);
          setPendingDelete(d);
        }}
      />

      {pendingDelete && (
        <ConfirmDeleteDialog
          dataset={pendingDelete}
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

export default DataImportView;
