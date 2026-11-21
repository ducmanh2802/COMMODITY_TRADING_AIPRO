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
import { fmtInt, tr, useT } from '../../../i18n';
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

const inputCls =
  'w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text)]/35 focus:outline-none focus:border-[var(--accent)] disabled:opacity-50';
const labelCls = 'block text-xs font-medium text-[var(--text)]/75 mb-1';
const hintCls = 'mt-1 text-[11px] text-[var(--text)]/45 leading-snug';

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
  return tr('data.err.unexpected');
}

export function DataImportView() {
  const { instruments, loading: instrumentsLoading } = useTerminal();
  const t = useT();
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
  if (!file) missing.push(t('data.missing.file'));
  if (!form.instrumentId) missing.push(t('data.missing.instrument'));
  if (!contractCode) missing.push(t('data.missing.contract'));
  else if (!/^[A-Z0-9._-]{1,32}$/.test(contractCode)) missing.push(t('data.missing.validContract'));
  if (isContinuous && !form.continuousAdjustment) missing.push(t('data.missing.adjustment'));
  if (!timezone) missing.push(t('data.missing.timezone'));
  if (!form.sourceLabel.trim()) missing.push(t('data.missing.sourceLabel'));
  if (!form.sourceQuality) missing.push(t('data.missing.sourceQuality'));

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
      setFileError(t('data.file.tooBig', { mb: (f.size / 1024 / 1024).toFixed(1) }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) {
        setFileError(t('data.file.empty'));
        return;
      }
      setFile({ id: nextFileId++, name: f.name, size: f.size, text });
    };
    reader.onerror = () => setFileError(t('data.file.readError'));
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
          <h1 className="text-xl font-semibold text-[var(--text-strong)] tracking-tight">{t('data.title')}</h1>
          <p className="text-sm text-[var(--text)]/65 mt-1">
            {t('data.subtitle')}
          </p>
        </div>
        <div className="w-full md:w-80">
          <label htmlFor="admin-token" className={`${labelCls} flex items-center gap-1.5`}>
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" /> {t('data.adminToken')}
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            placeholder={t('data.adminTokenPlaceholder')}
            className={inputCls}
          />
          <p className={hintCls}>{t('data.adminTokenHint')}</p>
        </div>
      </div>

      <form
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(true);
        }}
      >
        {/* File */}
        <div>
          <label htmlFor="csv-file" className={labelCls}>
            {t('data.file.label')}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(e) => onFileChosen(e.target.files?.[0])}
              className="text-xs text-[var(--text)]/80 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:text-[var(--text)] file:text-xs hover:file:bg-[var(--surface-3)]"
            />
            {file && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--text)]/70">
                <FileUp className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
                {file.name} · {(file.size / 1024).toFixed(1)} KB · {t('data.file.lines', { n: fmtInt(file.text.split(/\r?\n/).length) })}
              </span>
            )}
          </div>
          {fileError && <p className="mt-1 text-xs text-[var(--negative)]">{fileError}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label htmlFor="imp-instrument" className={labelCls}>
              {t('data.instrument')}
            </label>
            <select
              id="imp-instrument"
              value={form.instrumentId}
              onChange={(e) => update('instrumentId', e.target.value)}
              className={inputCls}
            >
              <option value="">{instrumentsLoading ? t('common.loading') : t('data.selectInstrument')}</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.exchange}:{i.exchangeSymbol} — {i.productName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="imp-contract" className={labelCls}>
              {t('data.contractCode')}
            </label>
            <input
              id="imp-contract"
              value={form.contractCode}
              onChange={(e) => update('contractCode', e.target.value)}
              placeholder={t('data.contractCodePlaceholder')}
              className={`${inputCls} font-mono uppercase`}
              list="contract-code-suggestions"
            />
            <datalist id="contract-code-suggestions">
              <option value="CONTINUOUS" />
            </datalist>
            <p className={hintCls}>{t('data.contractCodeHint', { codes: t('data.monthCodes') })}</p>
          </div>

          <div>
            <label htmlFor="imp-adjust" className={labelCls}>
              {t('data.adjustment')}
            </label>
            <select
              id="imp-adjust"
              value={isContinuous ? form.continuousAdjustment : ''}
              onChange={(e) => update('continuousAdjustment', e.target.value as FormState['continuousAdjustment'])}
              disabled={!isContinuous}
              className={inputCls}
            >
              <option value="">{isContinuous ? t('data.adjustment.required') : t('data.adjustment.none')}</option>
              {CONTINUOUS_ADJUSTMENTS.map((a) => (
                <option key={a} value={a}>
                  {a} — {t(`data.adj.${a}`)}
                </option>
              ))}
            </select>
            <p className={hintCls}>{t('data.adjustment.hint')}</p>
          </div>

          <div>
            <label htmlFor="imp-tf" className={labelCls}>
              {t('data.timeframe')}
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
              {t('data.timezone')} <span className="text-[var(--negative)]">*</span>
            </label>
            <select
              id="imp-tz"
              value={form.tzChoice}
              onChange={(e) => update('tzChoice', e.target.value)}
              className={inputCls}
              required
            >
              <option value="">{t('data.selectTimezone')}</option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              <option value={OTHER_TZ}>{t('data.otherTimezone')}</option>
            </select>
            {form.tzChoice === OTHER_TZ && (
              <input
                aria-label={t('data.customTimezone')}
                value={form.tzCustom}
                onChange={(e) => update('tzCustom', e.target.value)}
                placeholder={t('data.timezonePlaceholder')}
                className={`${inputCls} mt-2 font-mono`}
              />
            )}
            <p className={hintCls}>
              {t('data.timezoneHint')}
            </p>
          </div>

          <div>
            <label htmlFor="imp-datefmt" className={labelCls}>
              {t('data.dateFormat')}
            </label>
            <select
              id="imp-datefmt"
              value={form.dateFormat}
              onChange={(e) => update('dateFormat', e.target.value as FormState['dateFormat'])}
              className={inputCls}
            >
              <option value="">{t('data.dateFormat.auto')}</option>
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
                {t('data.delimiter')}
              </label>
              <select
                id="imp-delim"
                value={form.delimiter}
                onChange={(e) => update('delimiter', e.target.value as FormState['delimiter'])}
                className={inputCls}
              >
                <option value="">{t('data.auto')}</option>
                <option value=",">{t('data.comma')}</option>
                <option value=";">{t('data.semicolon')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="imp-decimal" className={labelCls}>
                {t('data.decimalSep')}
              </label>
              <select
                id="imp-decimal"
                value={form.decimalSeparator}
                onChange={(e) => update('decimalSeparator', e.target.value as FormState['decimalSeparator'])}
                className={inputCls}
              >
                <option value="">{t('data.decimalDefault')}</option>
                <option value=".">{t('data.dot')}</option>
                <option value=",">{t('data.comma')}</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="imp-unit" className={labelCls}>
              {t('data.priceUnit')}
            </label>
            <input
              id="imp-unit"
              value={form.priceUnit}
              onChange={(e) => update('priceUnit', e.target.value)}
              placeholder={t('data.priceUnitPlaceholder')}
              className={inputCls}
            />
            <p className={hintCls}>{t('data.priceUnitHint')}</p>
          </div>

          <div>
            <label htmlFor="imp-source" className={labelCls}>
              {t('data.sourceLabel')} <span className="text-[var(--negative)]">*</span>
            </label>
            <input
              id="imp-source"
              value={form.sourceLabel}
              onChange={(e) => update('sourceLabel', e.target.value)}
              placeholder={t('data.sourceLabelPlaceholder')}
              maxLength={200}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="imp-quality" className={labelCls}>
              {t('data.sourceQuality')} <span className="text-[var(--negative)]">*</span>
            </label>
            <select
              id="imp-quality"
              value={form.sourceQuality}
              onChange={(e) => update('sourceQuality', e.target.value as FormState['sourceQuality'])}
              className={inputCls}
            >
              <option value="">{t('data.select')}</option>
              {SOURCE_QUALITIES.map((q) => (
                <option key={q} value={q}>
                  {q} — {t(`data.q.${q}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="imp-mode" className={labelCls}>
              {t('data.mode')}
            </label>
            <select
              id="imp-mode"
              value={form.mode}
              onChange={(e) => update('mode', e.target.value as ImportMode)}
              className={inputCls}
            >
              {IMPORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m} — {t(`data.mode.${m}`)}
                </option>
              ))}
            </select>
            <p className={hintCls}>
              {t(`data.mode.${form.mode}.hint`)}
            </p>
          </div>

          <div className="flex items-start gap-2 pt-6">
            <input
              id="imp-sort"
              type="checkbox"
              checked={form.sort}
              onChange={(e) => update('sort', e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <label htmlFor="imp-sort" className="text-xs text-[var(--text)]/75">
              {t('data.sort')}
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border)]">
          <button
            type="submit"
            disabled={!request || busy !== null}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[#5458E8] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            {busy === 'dry' ? t('data.dryRunning') : t('data.dryRun')}
          </button>
          <button
            type="button"
            onClick={() => void run(false)}
            disabled={!canImport}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-[var(--positive)] text-[var(--bg)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            {busy === 'import' ? t('data.importing') : t('data.import')}
          </button>
          <span className="text-xs text-[var(--text)]/55">
            {missing.length > 0
              ? t('data.required', { list: missing.join(', ') })
              : !dryRunMatches
                ? t('data.needDryRun')
                : canImport
                  ? t('data.dryRunPassed')
                  : t('data.dryRunFailed')}
          </span>
        </div>

        {requestError && (
          <p
            role="alert"
            className={`text-xs rounded-md px-3 py-2 border ${
              requestError.auth
                ? 'text-[var(--warning)] border-[var(--warning)]/40 bg-[var(--warning)]/10'
                : 'text-[var(--negative)] border-[var(--negative)]/40 bg-[var(--negative)]/10'
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
