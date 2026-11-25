import React, { useState } from 'react';
import { FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { Timeframe } from '../../shared/types/instrument';
import { useT } from '../../i18n';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

interface CsvImportPanelProps {
  defaultSymbol?: string;
  defaultTimeframe?: Timeframe;
  onImported?: (symbol: string, timeframe: Timeframe) => void;
}

export function CsvImportPanel({
  defaultSymbol,
  defaultTimeframe,
  onImported,
}: CsvImportPanelProps) {
  const { instruments, datasets, selectedSymbol, timeframe, refreshBackendData, setSelectedSymbol, setTimeframe } =
    useTerminal();
  const t = useT();

  const [symbol, setSymbol] = useState(defaultSymbol || selectedSymbol || 'GC');
  const [importTf, setImportTf] = useState<Timeframe>(defaultTimeframe || timeframe || 'H4');
  const [sourceName, setSourceName] = useState('CSV_HISTORICAL');
  const [csvContent, setCsvContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvContent(text);
    setSourceName(`CSV:${file.name.slice(0, 48)}`);
    setFeedback(null);
  };

  const handleDownloadSchema = () => {
    const header = 'timestamp,open,high,low,close,volume,openInterest\n';
    const blob = new Blob([header], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${symbol}_${importTf}_ohlcv_template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvContent.trim()) {
      setFeedback({ type: 'err', text: t('data.csv.needContent') });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/market/candles/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          timeframe: importTf,
          csvContent,
          sourceName: sourceName.trim() || 'CSV_HISTORICAL',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const details = Array.isArray(data.details) ? ` (${data.details.slice(0, 3).join('; ')})` : '';
        setFeedback({ type: 'err', text: `${data.message ?? t('data.csv.failed')}${details}` });
        return;
      }

      setSelectedSymbol(symbol);
      setTimeframe(importTf);
      await refreshBackendData();
      setFeedback({
        type: 'ok',
        text: t('data.csv.imported', {
          n: data.dataset.barCount,
          tf: data.dataset.timeframe,
          symbol: data.dataset.symbol,
          status: data.dataset.status,
        }),
      });
      onImported?.(symbol, importTf);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t('data.csv.networkError'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/market/candles', { method: 'DELETE' });
      if (!res.ok) throw new Error(t('data.csv.clearFailed'));
      await refreshBackendData();
      setFeedback({
        type: 'ok',
        text: t('data.csv.cleared'),
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : t('data.csv.clearFailedShort'),
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section
      aria-label={t('data.csv.title')}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('data.csv.title')}</h2>
          <p className="text-xs text-[var(--text)]/60 mt-0.5">
            {t('data.csv.subtitle1')}{' '}
            <span className="font-mono text-[var(--accent)]">HISTORICAL</span> {t('data.csv.subtitle2')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadSchema}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border border-[var(--border)] rounded-md text-xs text-[var(--text)] whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
            <span>{t('data.csv.template')}</span>
          </button>
          {datasets.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearAll()}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] hover:bg-[var(--warning)]/15 border border-[var(--border)] hover:border-[var(--warning)]/40 rounded-md text-xs text-[var(--warning)] disabled:opacity-50 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{clearing ? t('data.csv.clearing') : t('data.csv.clear')}</span>
            </button>
          )}
        </div>
      </div>

      <form onSubmit={(e) => void handleImport(e)} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="csv-symbol" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('data.instrument')}
            </label>
            <select
              id="csv-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            >
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.exchangeSymbol}>
                  {inst.exchangeSymbol} · {inst.productName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-timeframe" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('data.timeframe')}
            </label>
            <select
              id="csv-timeframe"
              value={importTf}
              onChange={(e) => setImportTf(e.target.value as Timeframe)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-source" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('data.csv.source')}
            </label>
            <input
              id="csv-source"
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              maxLength={80}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label htmlFor="csv-file-input" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('data.csv.file')}
            </label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={(e) => void handleFileChange(e)}
              className="w-full text-xs text-[var(--text)]/80 file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface-2)] file:text-xs file:text-[var(--text-strong)] hover:file:bg-[var(--accent)]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="csv-textarea" className="block text-xs text-[var(--text)]/65 mb-1">
            {t('data.csv.payload')}
          </label>
          <textarea
            id="csv-textarea"
            rows={4}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="timestamp,open,high,low,close,volume,openInterest"
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text)]/35 focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {feedback ? (
            <p
              className={`text-xs font-mono ${
                feedback.type === 'ok' ? 'text-[var(--accent-text)]' : 'text-[var(--warning)]'
              }`}
            >
              {feedback.text}
            </p>
          ) : (
            <span className="text-xs text-[var(--text)]/50">
              {t('data.csv.minBars')}
            </span>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{submitting ? t('data.csv.submitting') : t('data.csv.submit')}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
