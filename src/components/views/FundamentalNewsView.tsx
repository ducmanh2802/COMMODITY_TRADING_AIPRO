import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, Newspaper, Plus } from 'lucide-react';
import { getAdminToken } from '../../api/dataApi';
import { useTerminal } from '../../contexts/TerminalContext';
import type { FundamentalMacroRecord, MarketDirection } from '../../shared/types/analysis';
import type { DataQualityStatus } from '../../shared/types/market';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from '../common/DataStatusBadge';

interface NewsRecord {
  id: string;
  headline: string;
  source: string;
  publicationTimestamp: string;
  category: string;
  relatedSymbols: string[];
  classification: MarketDirection;
  summary: string;
}

interface FundamentalNewsViewProps {
  mode: 'fundamental' | 'news';
}

/**
 * Per-record status from its publication timestamp: a published release is HISTORICAL data; a missing,
 * unparseable or future timestamp is INVALID. (Never 'CURRENT' — manual records are not live feeds.)
 */
function recordStatusFromPublication(ts: string): DataQualityStatus {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms) || ms > Date.now() + 60_000) return 'INVALID';
  return 'HISTORICAL';
}

export function FundamentalNewsView({ mode }: FundamentalNewsViewProps) {
  const { syncProviderFeeds, syncing, timeframe } = useTerminal();
  const [records, setRecords] = useState<FundamentalMacroRecord[]>([]);
  const [news, setNews] = useState<NewsRecord[]>([]);
  const [status, setStatus] = useState<DataQualityStatus>('UNAVAILABLE');
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [kind, setKind] = useState<'MACRO' | 'NEWS'>(mode === 'news' ? 'NEWS' : 'MACRO');
  // No pre-filled dataset/time/unit: a manual record must state its own provenance.
  const [dataset, setDataset] = useState('');
  const [source, setSource] = useState('');
  const [pubTs, setPubTs] = useState('');
  const [revisionStatus, setRevisionStatus] = useState<FundamentalMacroRecord['revisionStatus'] | ''>('');
  const [dataPeriod, setDataPeriod] = useState('');
  const [actualVal, setActualVal] = useState('');
  const [previousVal, setPreviousVal] = useState('');
  const [forecastVal, setForecastVal] = useState('');
  const [unit, setUnit] = useState('');
  const [impact, setImpact] = useState<MarketDirection>('UNCERTAIN');
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fundamental/records');
      if (res.ok) {
        const j = await res.json();
        setRecords(j.records ?? []);
        setNews(j.news ?? []);
        setStatus(j.status ?? 'UNAVAILABLE');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setKind(mode === 'news' ? 'NEWS' : 'MACRO');
    void fetchAll();
  }, [mode, fetchAll]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source.trim() || !pubTs.trim()) {
      setError('Official source and publication timestamp are strictly required.');
      return;
    }
    const pubMs = new Date(pubTs).getTime();
    if (Number.isNaN(pubMs)) {
      setError('Publication timestamp is invalid.');
      return;
    }
    if (pubMs > Date.now() + 60_000) {
      setError('Publication timestamp is in the future — a record can only be stored after it is published.');
      return;
    }
    if (kind === 'MACRO' && !revisionStatus) {
      setError('Choose the revision status (PRELIMINARY / FINAL / REVISED) stated by the source.');
      return;
    }
    if (kind === 'MACRO' && !dataset.trim()) {
      setError('Dataset / topic is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const isoTs = new Date(pubTs).toISOString();
      const res = await fetch('/api/fundamental/records', {
        method: 'POST',
        // Admin-guarded endpoint: send the session admin token (Data Import view) when one is set.
        headers: {
          'Content-Type': 'application/json',
          ...(getAdminToken().trim() ? { Authorization: `Bearer ${getAdminToken().trim()}` } : {}),
        },
        body: JSON.stringify({
          kind,
          dataset: dataset.trim() || 'MACRO_RELEASE',
          source: source.trim(),
          publicationTimestamp: isoTs,
          // Reference period as stated by the source; otherwise flagged as user-provided (never 'CURRENT').
          dataPeriod: dataPeriod.trim() || 'USER_PROVIDED',
          actualValue: actualVal.trim() ? Number(actualVal) || actualVal.trim() : null,
          previousValue: previousVal.trim() ? Number(previousVal) || previousVal.trim() : null,
          forecastValue: forecastVal.trim() ? Number(forecastVal) || forecastVal.trim() : null,
          unit: unit.trim() || 'UNSPECIFIED',
          revisionStatus: revisionStatus || 'PRELIMINARY',
          impactAssessment: impact,
          headline: headline.trim() || undefined,
          summary: summary.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Validation failed.');
      setSource('');
      setHeadline('');
      setSummary('');
      setPubTs('');
      setRevisionStatus('');
      setDataPeriod('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store sourced record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncOfficialMacro = async () => {
    setSyncMessage(null);
    const res = await syncProviderFeeds({ timeframe });
    await fetchAll();
    if (!res) {
      setSyncMessage('Unable to sync EIA / USDA macro feeds.');
      return;
    }
    const eia = res.outcomes.find((o) => o.providerId === 'EIA_ENERGY');
    const usda = res.outcomes.find((o) => o.providerId === 'USDA_QUICKSTATS');
    setSyncMessage(
      `EIA: ${eia?.message ?? 'N/A'} | USDA: ${usda?.message ?? 'N/A'}`
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {mode === 'news' ? 'News & Economic Calendar' : 'Fundamental & Macro Data'}
          </h1>
          <p className="text-sm text-[#E5E7EB]/65 mt-1">
            Strictly sourced USDA, EIA, USD/VND, and central bank records. Zero fabricated headlines or estimates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSyncOfficialMacro()}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <CloudDownload className={`w-3.5 h-3.5 ${syncing ? 'animate-pulse' : ''}`} aria-hidden="true" />
            <span>{syncing ? 'Syncing...' : 'Sync Official Macro (EIA / USDA)'}</span>
          </button>
          <DataStatusBadge status={status} />
        </div>
      </div>

      {syncMessage && (
        <div className="bg-[#111622] border border-[#263244] rounded-lg px-4 py-2.5 text-xs font-mono text-[#E5E7EB]/85">
          {syncMessage}
        </div>
      )}

      {/* Add Sourced Record Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-[#111622] border border-[#263244] rounded-lg p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Ingest Sourced Fundamental / News Record</h2>
          <select
            aria-label="Record kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'MACRO' | 'NEWS')}
            className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1 text-xs font-mono text-white"
          >
            <option value="MACRO">MACRO DATASET</option>
            <option value="NEWS">SOURCED NEWS</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="fund-source" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Official Source (Required)
            </label>
            <input
              id="fund-source"
              type="text"
              placeholder="e.g. USDA / EIA / SBV / Reuters"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label htmlFor="fund-ts" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Publication Time (Required)
            </label>
            <input
              id="fund-ts"
              type="datetime-local"
              value={pubTs}
              onChange={(e) => setPubTs(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label htmlFor="fund-dataset" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Dataset / Topic
            </label>
            <input
              id="fund-dataset"
              type="text"
              placeholder="e.g. USDA_WASDE"
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            />
          </div>
          <div>
            <label htmlFor="fund-impact" className="block text-xs text-[#E5E7EB]/65 mb-1">
              Impact Classification
            </label>
            <select
              id="fund-impact"
              value={impact}
              onChange={(e) => setImpact(e.target.value as MarketDirection)}
              className="w-full bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-2 text-xs font-mono text-white"
            >
              <option value="BULLISH">BULLISH</option>
              <option value="BEARISH">BEARISH</option>
              <option value="SIDEWAYS">NEUTRAL / SIDEWAYS</option>
              <option value="UNCERTAIN">UNCERTAIN</option>
            </select>
          </div>
        </div>

        {kind === 'MACRO' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Actual value"
              value={actualVal}
              onChange={(e) => setActualVal(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            />
            <input
              type="text"
              placeholder="Previous value"
              value={previousVal}
              onChange={(e) => setPreviousVal(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            />
            <input
              type="text"
              placeholder="Forecast value"
              value={forecastVal}
              onChange={(e) => setForecastVal(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            />
            <input
              type="text"
              placeholder="Unit (e.g. MMT, %)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            />
            <select
              aria-label="Revision status (required)"
              value={revisionStatus}
              onChange={(e) => setRevisionStatus(e.target.value as FundamentalMacroRecord['revisionStatus'] | '')}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            >
              <option value="">Revision status (required)…</option>
              <option value="PRELIMINARY">PRELIMINARY</option>
              <option value="FINAL">FINAL</option>
              <option value="REVISED">REVISED</option>
            </select>
            <input
              type="text"
              aria-label="Reference period"
              placeholder="Reference period, e.g. 2026/27 or Oct-2026 (blank = USER_PROVIDED)"
              maxLength={40}
              value={dataPeriod}
              onChange={(e) => setDataPeriod(e.target.value)}
              className="col-span-2 bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs font-mono text-white"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Verified news headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-white"
            />
            <input
              type="text"
              placeholder="Concise factual summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="bg-[#0B0E14] border border-[#263244] rounded-md px-2.5 py-1.5 text-xs text-white"
            />
          </div>
        )}

        {error && <p className="text-xs font-mono text-[#EF4444]">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#6366F1] hover:bg-[#6366F1]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{submitting ? 'Saving...' : 'Store Sourced Record'}</span>
          </button>
        </div>
      </form>

      {/* Macro Records & Sourced News */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#263244]">
            <h2 className="text-sm font-semibold text-white">Macro Releases ({records.length})</h2>
          </div>
          {loading ? (
            <div className="p-6 text-xs font-mono text-[#E5E7EB]/60">Loading macro records...</div>
          ) : records.length === 0 ? (
            <div className="p-6 text-xs font-mono text-[#F59E0B]">
              DATA_UNAVAILABLE — No sourced macro datasets ingested yet.
            </div>
          ) : (
            <div className="divide-y divide-[#263244]/70">
              {records.map((r) => (
                <div key={r.id} className="p-4 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{r.dataset}</span>
                    <span className="font-mono text-[#6366F1]">{r.impactAssessment}</span>
                  </div>
                  <p className="font-mono text-[#E5E7EB]/75">
                    Actual: {r.actualValue ?? 'N/A'} {r.unit} · Prev: {r.previousValue ?? 'N/A'} · Fcst: {r.forecastValue ?? 'N/A'}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#E5E7EB]/60">
                    <DataStatusBadge status={recordStatusFromPublication(r.publicationTimestamp)} compact />
                    <span>{r.revisionStatus}</span>
                    <span>· Period: {r.dataPeriod}</span>
                  </p>
                  <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                    Source: {r.source} · {formatTimestampInZone(r.publicationTimestamp, 'Asia/Ho_Chi_Minh')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#111622] border border-[#263244] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#263244] flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-[#6366F1]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Sourced News ({news.length})</h2>
          </div>
          {loading ? (
            <div className="p-6 text-xs font-mono text-[#E5E7EB]/60">Loading sourced news...</div>
          ) : news.length === 0 ? (
            <div className="p-6 text-xs font-mono text-[#F59E0B]">
              DATA_UNAVAILABLE — No sourced commodity news records ingested yet.
            </div>
          ) : (
            <div className="divide-y divide-[#263244]/70">
              {news.map((n) => (
                <div key={n.id} className="p-4 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">{n.headline}</span>
                    <span className="font-mono text-[#6366F1] shrink-0">{n.classification}</span>
                  </div>
                  <p className="text-[#E5E7EB]/80">{n.summary}</p>
                  <p className="text-[11px] font-mono text-[#E5E7EB]/50">
                    Source: {n.source} · {formatTimestampInZone(n.publicationTimestamp, 'Asia/Ho_Chi_Minh')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
