import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fmtDate, fmtFixed, tr, useI18n, useT } from '../../../i18n';
import { safeReadJson } from '../../../shared/utils/http';
import { Card } from '../../ui/Card';
import { Sparkline } from '../../ui/viz/Sparkline';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
import { Delta, Fold, RangeBar } from './tileBits';

export interface FxRate {
  pair: string;
  label: { vi: string; en: string };
  unit: string;
  source: 'ECB' | 'FRED';
  value: number | null;
  asOf: string | null;
  change1w: number | null;
  change1m: number | null;
  note: { vi: string; en: string };
  spark: { date: string; value: number }[];
  quality: 'OFFICIAL';
  sourceUrl: string;
  fetchedAt: string;
  reason?: string;
}

export interface FxResponse {
  retrievedAt: string;
  rates: FxRate[];
}

const signed = (v: number | null, d = 2, suffix = ''): string => (v === null ? '—' : `${v > 0 ? '+' : ''}${fmtFixed(v, d)}${suffix}`);
const tone = (v: number | null): string => (v === null || v === 0 ? 'text-[var(--muted)]' : v > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]');

function FxCard({ rate, lang }: { rate: FxRate; lang: 'vi' | 'en' }) {
  const t = useT();
  const label = rate.label[lang];
  const note = rate.note[lang];
  const unit = rate.unit;
  const chUnit = '%';

  return (
    <Card className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Badge tone="positive" title={rate.source}>{rate.quality}</Badge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums text-[var(--text-strong)]">
          {rate.value === null ? <span className="text-sm text-[var(--faint)]">{t('pulse.unavailable')}</span> : `${fmtFixed(rate.value, 4)}`}
          {rate.value !== null && <span className="ml-1 text-xs font-normal text-[var(--muted)]">{unit}</span>}
        </p>
        <div className="w-14 shrink-0">
          <Sparkline className="h-6" points={rate.spark.map((q) => ({ label: fmtDate(q.date), value: q.value }))} format={(v) => fmtFixed(v, 4)} />
        </div>
      </div>
      <RangeBar value={rate.value} values={rate.spark.map((q) => q.value)} ariaLabel={t('mv.range')} />
      <div className="text-xs">
        <Delta v={rate.change1w} text={signed(rate.change1w, 2, chUnit)} label={t('fx.change1w')} />
      </div>
      <Fold summary={t('pulse.mc.details')}>
        <p className="tabular-nums">
          {t('fx.change1m')} <span className={tone(rate.change1m)}>{signed(rate.change1m, 2, chUnit)}</span>
        </p>
        <p>{note}</p>
        <p>
          {rate.asOf ? `${t('pulse.asOf', { v: fmtDate(rate.asOf) })} · ` : ''}
          <a href={rate.sourceUrl} target="_blank" rel="noreferrer" className="underline">{rate.source} (OFFICIAL)</a>
        </p>
      </Fold>
    </Card>
  );
}

export function FxPanel() {
  const t = useT();
  const { lang } = useI18n();
  const l = (lang === 'en' ? 'en' : 'vi') as 'vi' | 'en';
  const [data, setData] = useState<FxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserError | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fx/rates', { signal });
      setData(await safeReadJson<FxResponse>(res));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(toUserError(err));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const header = (
    <SectionHeader
      title={t('fx.title')}
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center gap-1 px-2 text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> {t('fx.retry')}
        </button>
      }
    />
  );

  if (loading && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        <Skeleton className="h-32" />
        <p className="text-sm text-[var(--muted)]">{t('fx.loading')}</p>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-4 max-w-6xl">
        {header}
        <Card tone="warning"><ErrorNote error={error} text={t('fx.error', { msg: error.message })} /></Card>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5 max-w-6xl">
      {header}
      <Fold summary={t('mv.explain')}>
        <p>{t('fx.subtitle')}</p>
        <p>{t('fx.generatedAt', { v: fmtDate(data.retrievedAt) })}</p>
      </Fold>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(data.rates ?? []).map((r) => <FxCard key={r.pair} rate={r} lang={l} />)}
      </div>

      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">{t('fx.disclaimer')}</summary>
        <p className="mt-1">{t('fx.disclaimerText')}</p>
      </details>
    </div>
  );
}