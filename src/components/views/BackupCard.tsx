import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { useT } from '../../i18n';
import { BACKUP_KEYS, buildBackup, restoreBackup, tradesToCsv, validateBackup, type RestoreMode } from '../../shared/backup/backup';
import { deserializeState } from './papertrade/paperModel';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BackupCard() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; json: unknown } | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stamp = () => new Date().toISOString().slice(0, 10);

  const onBackup = () => {
    setErr(null);
    setMsg(null);
    download(`ctap-backup-${stamp()}.json`, JSON.stringify(buildBackup(window.localStorage), null, 2), 'application/json');
  };

  const onCsv = () => {
    setErr(null);
    setMsg(null);
    let trades: ReturnType<typeof deserializeState>['trades'] = [];
    try {
      trades = deserializeState(window.localStorage.getItem(BACKUP_KEYS.paper)).trades;
    } catch {
      trades = [];
    }
    if (trades.length === 0) {
      setMsg(t('bk.csvEmpty'));
      return;
    }
    download(`ctap-lenh-thu-${stamp()}.csv`, tradesToCsv(trades), 'text/csv;charset=utf-8');
  };

  const onFile = async (file: File | undefined) => {
    setErr(null);
    setMsg(null);
    if (!file) return;
    try {
      const json: unknown = JSON.parse(await file.text());
      const v = validateBackup(json);
      if (!v.ok) {
        setErr(v.error);
        return;
      }
      setPending({ name: file.name, json });
    } catch {
      setErr(t('bk.readError'));
    }
  };

  const confirmRestore = () => {
    if (!pending) return;
    const r = restoreBackup(pending.json, mode, window.localStorage);
    setPending(null);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setMsg(t('bk.done'));
    setTimeout(() => window.location.reload(), 600);
  };

  const btn =
    'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-strong)] hover:border-[var(--accent)] transition-colors';

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
      <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('bk.title')}</h2>
      <p className="text-xs text-[var(--text)]/65 leading-relaxed">{t('bk.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={onBackup}>
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          {t('bk.download')}
        </button>
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          {t('bk.restore')}
        </button>
        <button type="button" className={btn} onClick={onCsv}>
          <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
          {t('bk.csv')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {pending && (
        <div className="rounded-md border border-[var(--warning)] p-3 space-y-2" role="alertdialog" aria-label={t('bk.restore')}>
          <p className="text-xs text-[var(--text-strong)]">{t('bk.confirm', { file: pending.name })}</p>
          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input type="radio" name="bk-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            {t('bk.mode.merge')}
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text)]">
            <input type="radio" name="bk-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            {t('bk.mode.replace')}
          </label>
          <div className="flex gap-2">
            <button type="button" className={btn} onClick={confirmRestore}>
              {t('bk.ok')}
            </button>
            <button type="button" className={btn} onClick={() => setPending(null)}>
              {t('bk.cancel')}
            </button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-[var(--accent-text)]" role="status">{msg}</p>}
      {err && <p className="text-xs text-[var(--warning)]" role="alert">{err}</p>}
    </section>
  );
}
