import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fmtDate, fmtFixed, tr, useI18n, useT } from '../../../i18n';
import { safeReadJson } from '../../../shared/utils/http';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';

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

function Spark({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const W = 120;
  const H = 32;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * W).toFixed(1)},${(H - 2 - ((p.value - min) / span) * (H - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8 text-[var(--accent)]" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FxCard({ rate, lang }: { rate: FxRate; lang: 'vi' | 'en' }) {
  const t = useT();
  const label = rate.label[lang];
  const note = rate.note[lang];
  const unit = rate.unit;
  const chUnit = '%';

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{label}</p>
        <Badge tone="positive" title={rate.source}>{rate.quality}</Badge>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-[var(--text-strong)]">
        {rate.value === null ? <span className="text-sm text-[var(--faint)]">{t('pulse.unavailable')}</span> : `${fmtFixed(rate.value, 4)} ${unit}`}
      </p>
      <Spark points={rate.spark} />
      <div className="flex gap-4 text-xs tabular-nums">
        <span>
          <span className="text-[var(--faint)]">{t('fx.change1w')} </span>
          <span className={tone(rate.change1w)}>{signed(rate.change1w, 2, chUnit)}</span>
        </span>
        <span>
          <span className="text-[var(--faint)]">{t('fx.change1m')} </span>
          <span className={tone(rate.change1m)}>{signed(rate.change1m, 2, chUnit)}</span>
        </span>
      </div>
      <p className="text-[11px] text-[var(--faint)]">{note}</p>
      <p className="text-[11px] text-[var(--faint)]">
        {rate.asOf ? `${t('pulse.asOf', { v: fmtDate(rate.asOf) })} · ` : ''}
        <a href={rate.sourceUrl} target="_blank" rel="noreferrer" className="underline">{rate.source} (OFFICIAL)</a>
      </p>
    </Card>
  );
}

export function FxPanel() {
  const t = useT();
  const { lang } = useI18n();
  const l = (lang === 'en' ? 'en' : 'vi') as 'vi' | 'en';
  const [data, setData] = useState<FxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fx/rates', { signal });
      setData(await safeReadJson<FxResponse>(res));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
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
      subtitle={t('fx.subtitle')}
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
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
        <Card tone="warning">{t('fx.error', { msg: error })}</Card>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-5 max-w-6xl">
      {header}
      <p className="text-xs text-[var(--faint)]">{t('fx.generatedAt', { v: fmtDate(data.retrievedAt) })}</p>

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