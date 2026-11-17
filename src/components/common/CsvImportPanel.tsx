import React, { useState } from 'react';
import { FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { Timeframe } from '../../shared/types/instrument';

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
      setFeedback({ type: 'err', text: 'Select a CSV file or paste OHLCV CSV rows first.' });
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
        setFeedback({ type: 'err', text: `${data.message ?? 'Import failed'}${details}` });
        return;
      }

      setSelectedSymbol(symbol);
      setTimeframe(importTf);
      await refreshBackendData();
      setFeedback({
        type: 'ok',
        text: `Imported ${data.dataset.barCount} validated ${data.dataset.timeframe} bars for ${data.dataset.symbol} (${data.dataset.status}).`,
      });
      onImported?.(symbol, importTf);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Network error importing CSV.',
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
      if (!res.ok) throw new Error('Failed to clear imported datasets.');
      await refreshBackendData();
      setFeedback({
        type: 'ok',
        text: 'Cleared all imported historical datasets. Terminal reverted to fail-closed DATA_UNAVAILABLE state.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to clear datasets.',
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <section
      aria-label="Historical CSV OHLCV Importer"
      className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#263244] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Historical OHLCV CSV Importer</h2>
          <p className="text-xs text-[#E5E7EB]/60 mt-0.5">
            Upload verified historical OHLCV datasets. Imported candles are tagged{' '}
            <span className="font-mono text-[#6366F1]">HISTORICAL</span> and validated strictly against OHLC geometry and monotonic timestamps.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadSchema}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#172033]/80 border border-[#263244] rounded-md text-xs text-[#E5E7EB] whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#6366F1]" aria-hidden="true" />
            <span>Header Template</span>
          </button>
          {datasets.length > 0 && (
            <button
              type="button"
              onClick={() => void handleClearAll()}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#172033] hover:bg-[#EF4444]/15 border border-[#263244] hover:border-[#EF4444]/40 rounded-md text-xs text-[#EF4444] disabled:opacity-50 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{clearing ? 'Clearing...' : 'Clear Datasets'}</span>
            </button>
          )}
        </div>
      </div>

      <form onSubmit={(e) => void handleImport(e)} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="csv-symbol" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Instrument
            </label>
            <select
              id="csv-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
            >
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.exchangeSymbol}>
                  {inst.exchangeSymbol} · {inst.productName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-timeframe" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Timeframe
            </label>
            <select
              id="csv-timeframe"
              value={importTf}
              onChange={(e) => setImportTf(e.target.value as Timeframe)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="csv-source" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Source Attribution
            </label>
            <input
              id="csv-source"
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              maxLength={80}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#6366F1]"
            />
          </div>

          <div>
            <label htmlFor="csv-file-input" className="block text-xs text-[#E5E7EB]/65 mb-1">
              CSV File (.csv / .txt)
            </label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={(e) => void handleFileChange(e)}
              className="w-full text-xs text-[#E5E7EB]/80 file:mr-2 file:py-1.5 file:px-2.5 file:rounded file:border file:border-[#263244] file:bg-[#172033] file:text-xs file:text-white hover:file:bg-[#6366F1]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="csv-textarea" className="block text-xs text-[#E5E7EB]/65 mb-1">
            CSV Payload (Required columns: timestamp, open, high, low, close; optional: volume, openInterest)
          </label>
          <textarea
            id="csv-textarea"
            rows={4}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="timestamp,open,high,low,close,volume,openInterest"
            className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-3 py-2 text-xs font-mono text-[#E5E7EB] placeholder:text-[#E5E7EB]/35 focus:outline-none focus:border-[#6366F1]"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {feedback ? (
            <p
              className={`text-xs font-mono ${
                feedback.type === 'ok' ? 'text-[#22C55E]' : 'text-[#EF4444]'
              }`}
            >
              {feedback.text}
            </p>
          ) : (
            <span className="text-xs text-[#E5E7EB]/50">
              Minimum 35–55 closed bars recommended for technical indicators and strategy backtests.
            </span>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50 whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{submitting ? 'Validating & Importing...' : 'Validate & Import CSV'}</span>
          </button>
        </div>
      </form>
    </section>
  );
}
