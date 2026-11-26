import { useState } from 'react';
import { Plus } from 'lucide-react';
import { getAdminToken } from '../../../api/dataApi';
import { invalidate } from '../../../shared/utils/http';
import type { FundamentalMacroRecord, MarketDirection } from '../../../shared/types/analysis';
import { hasKey, tr, useT } from '../../../i18n';
import { fieldErrorProps } from '../../common/fieldErrors';
import { friendlyMessage } from '../../common/friendlyError';

/** Code plus Vietnamese/English label, e.g. "BULLISH · Tăng giá"; unknown codes are shown as-is. */
export function codeLabel(prefix: 'news.dir.' | 'news.rev.', code: string): string {
  const key = `${prefix}${code}`;
  return hasKey(key) ? `${code} · ${tr(key)}` : code;
}

/** Manual sourced-record form. `initialKind` picks the default record kind for the host panel. */
export function RecordForm({ initialKind, onSaved }: { initialKind: 'MACRO' | 'NEWS'; onSaved: () => void | Promise<void> }) {
  const t = useT();
  const [kind, setKind] = useState<'MACRO' | 'NEWS'>(initialKind);
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
  const [badFields, setBadFields] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBadFields([!source.trim() && 'source', !pubTs.trim() && 'ts'].filter((x): x is string => !!x));
    if (!source.trim() || !pubTs.trim()) {
      setError(t('news.err.required'));
      return;
    }
    const pubMs = new Date(pubTs).getTime();
    if (Number.isNaN(pubMs)) {
      setBadFields(['ts']);
      setError(t('news.err.invalidTs'));
      return;
    }
    if (pubMs > Date.now() + 60_000) {
      setBadFields(['ts']);
      setError(t('news.err.futureTs'));
      return;
    }
    if (kind === 'MACRO' && !revisionStatus) {
      setError(t('news.err.revision'));
      return;
    }
    if (kind === 'MACRO' && !dataset.trim()) {
      setBadFields(['dataset']);
      setError(t('news.err.dataset'));
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
      if (!res.ok) throw new Error(json.message ?? t('news.err.validation'));
      invalidate('/api/fundamental');
      setSource('');
      setHeadline('');
      setSummary('');
      setPubTs('');
      setRevisionStatus('');
      setDataPeriod('');
      await onSaved();
    } catch (err) {
      setError(friendlyMessage(err, t('news.err.store')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('news.form.title')}</h2>
          <select
            aria-label={t('news.form.kind')}
            value={kind}
            onChange={(e) => setKind(e.target.value as 'MACRO' | 'NEWS')}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1 text-xs font-mono text-[var(--text-strong)]"
          >
            <option value="MACRO">{t('news.form.kind.MACRO')}</option>
            <option value="NEWS">{t('news.form.kind.NEWS')}</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="fund-source" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('news.form.source')}
            </label>
            <input
              id="fund-source"
              {...fieldErrorProps(!!error && badFields.includes('source'), 'fund-form-err')}
              type="text"
              placeholder={t('news.form.sourcePlaceholder')}
              aria-label={t('news.form.sourcePlaceholder')}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs text-[var(--text-strong)]"
            />
          </div>
          <div>
            <label htmlFor="fund-ts" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('news.form.pubTime')}
            </label>
            <input
              id="fund-ts"
              {...fieldErrorProps(!!error && badFields.includes('ts'), 'fund-form-err')}
              type="datetime-local"
              value={pubTs}
              onChange={(e) => setPubTs(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
          <div>
            <label htmlFor="fund-dataset" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('news.form.dataset')}
            </label>
            <input
              id="fund-dataset"
              {...fieldErrorProps(!!error && badFields.includes('dataset'), 'fund-form-err')}
              type="text"
              placeholder={t('news.form.datasetPlaceholder')}
              aria-label={t('news.form.datasetPlaceholder')}
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
          <div>
            <label htmlFor="fund-impact" className="block text-xs text-[var(--text)]/65 mb-1">
              {t('news.form.impact')}
            </label>
            <select
              id="fund-impact"
              value={impact}
              onChange={(e) => setImpact(e.target.value as MarketDirection)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-2 text-xs font-mono text-[var(--text-strong)]"
            >
              <option value="BULLISH">{codeLabel('news.dir.', 'BULLISH')}</option>
              <option value="BEARISH">{codeLabel('news.dir.', 'BEARISH')}</option>
              <option value="SIDEWAYS">{codeLabel('news.dir.', 'SIDEWAYS')}</option>
              <option value="UNCERTAIN">{codeLabel('news.dir.', 'UNCERTAIN')}</option>
            </select>
          </div>
        </div>

        {kind === 'MACRO' ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder={t('news.form.actual')}
              aria-label={t('news.form.actual')}
              value={actualVal}
              onChange={(e) => setActualVal(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="text"
              placeholder={t('news.form.previous')}
              aria-label={t('news.form.previous')}
              value={previousVal}
              onChange={(e) => setPreviousVal(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="text"
              placeholder={t('news.form.forecast')}
              aria-label={t('news.form.forecast')}
              value={forecastVal}
              onChange={(e) => setForecastVal(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <input
              type="text"
              placeholder={t('news.form.unit')}
              aria-label={t('news.form.unit')}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
            <select
              aria-label={t('news.form.revision')}
              value={revisionStatus}
              onChange={(e) => setRevisionStatus(e.target.value as FundamentalMacroRecord['revisionStatus'] | '')}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            >
              <option value="">{t('news.form.revisionPlaceholder')}</option>
              <option value="PRELIMINARY">{codeLabel('news.rev.', 'PRELIMINARY')}</option>
              <option value="FINAL">{codeLabel('news.rev.', 'FINAL')}</option>
              <option value="REVISED">{codeLabel('news.rev.', 'REVISED')}</option>
            </select>
            <input
              type="text"
              aria-label={t('news.form.period')}
              placeholder={t('news.form.periodPlaceholder')}
              maxLength={40}
              value={dataPeriod}
              onChange={(e) => setDataPeriod(e.target.value)}
              className="col-span-2 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs font-mono text-[var(--text-strong)]"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder={t('news.form.headline')}
              aria-label={t('news.form.headline')}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-strong)]"
            />
            <input
              type="text"
              placeholder={t('news.form.summary')}
              aria-label={t('news.form.summary')}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--text-strong)]"
            />
          </div>
        )}

        {error && <p id="fund-form-err" role="alert" className="text-xs font-mono text-[var(--negative)]">{error}</p>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white text-xs font-medium rounded-md disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{submitting ? t('news.form.saving') : t('news.form.submit')}</span>
          </button>
        </div>
      </form>
  );
}
