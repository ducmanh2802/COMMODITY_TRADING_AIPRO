import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtDate, fmtFixed, fmtInt, useI18n } from '../../../i18n';
import type { TKey } from '../../../i18n/vi';
import { fetchJsonWithRetry, invalidate } from '../../../shared/utils/http';
import { DOMESTIC_COMMODITIES, type Basis, type DomesticCommodity, type DomesticPricePoint } from '../../../shared/domestic/basis';
import type { DataQualityStatus } from '../../../shared/types/market';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { ChartTooltip, useChartTooltip } from '../../ui/viz/ChartTooltip';
import { getAdminToken, describeAuthError } from '../../../api/dataApi';

interface OverviewItem {
  commodity: DomesticCommodity;
  latest: DomesticPricePoint | null;
  latestVndPerKg: number | null;
  intl: { instrumentId: string; value: number; unit: string; asOf: string; vndPerKg: number | null } | null;
  basis: Basis | null;
  history: Array<{ date: string; domesticVndPerKg: number | null; intlVndPerKg: number | null }>;
}
interface Overview {
  fx: { usdVnd: number; asOf: string | null; source: string; sourceUrl: string; status: string } | null;
  items: OverviewItem[];
}

const DAY = 86400000;

function statusFor(date: string): DataQualityStatus {
  const age = Date.now() - Date.parse(`${date}T00:00:00Z`);
  return age > 7 * DAY ? 'STALE' : 'HISTORICAL';
}

function DualLine({ history, label }: { history: OverviewItem['history']; label: string }) {
  const { t } = useI18n();
  const { wrapRef, tip, show, hide } = useChartTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 110;
  const pad = 10;
  const vals = history.flatMap((h) => [h.domesticVndPerKg, h.intlVndPerKg]).filter((v): v is number => v !== null);
  if (history.length < 2 || vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const path = (key: 'domesticVndPerKg' | 'intlVndPerKg') => {
    let d = '';
    history.forEach((h, i) => {
      const v = h[key];
      if (v === null) return;
      d += `${d ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    });
    return d;
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (history.length - 1));
    setHover(i);
    const h = history[i];
    const rows = [
      { label: t('dm.legend.domestic'), value: h.domesticVndPerKg === null ? '—' : fmtInt(h.domesticVndPerKg), color: 'var(--series-1)' },
      { label: t('dm.legend.intl'), value: h.intlVndPerKg === null ? '—' : fmtInt(h.intlVndPerKg), color: 'var(--series-3)' },
    ];
    show(e, fmtDate(h.date), rows);
  };
  const hv = hover !== null ? history[hover] : null;
  return (
    <div ref={wrapRef} className="relative" style={{ height: H }} onPointerMove={onMove} onPointerLeave={() => { setHover(null); hide(); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none" role="img" aria-label={label}>
        <path d={path('intlVndPerKg')} fill="none" stroke="var(--series-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={path('domesticVndPerKg')} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--chart-crosshair)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hv &&
        ([['domesticVndPerKg', 'var(--series-1)'], ['intlVndPerKg', 'var(--series-3)']] as const).map(([k, c]) =>
          hv[k] === null ? null : (
            <span
              key={k}
              aria-hidden="true"
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] box-content"
              style={{ left: `${(x(hover as number) / W) * 100}%`, top: `${(y(hv[k] as number) / H) * 100}%`, background: c }}
            />
          ),
        )}
      <ChartTooltip tip={tip} />
    </div>
  );
}

function CommodityCard({ item, fxRate }: { item: OverviewItem; fxRate: number | null })
 {
  const { t } = useI18n();
  const name = t(`dm.commodity.${item.commodity}` as TKey);
  const p = item.latest;
  const b = item.basis;
  let explain: string | null = null;
  if (b) {
    const amount = fmtInt(Math.abs(b.basisVndPerKg));
    const pct = fmtFixed(Math.abs(b.basisPct ?? 0), 1);
    explain =
      Math.abs(b.basisPct ?? 0) < 0.5
        ? t('dm.explain.flat')
        : b.basisVndPerKg > 0
          ? t('dm.explain.above', { amount, pct })
          : t('dm.explain.below', { amount, pct });
  }
  const tone = b ? (b.basisVndPerKg >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]') : 'text-[var(--muted)]';
  return (
    <Card as="article" className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-strong)]">{name}</h3>
      {!p ? (
        <p className="text-sm text-[var(--muted)]">{t('dm.noEntry')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-[var(--muted)]">{t('dm.domestic')}</div>
              <div className="font-semibold text-[var(--text-strong)] tabular-nums">
                {item.latestVndPerKg !== null ? fmtInt(item.latestVndPerKg) : `${fmtInt(p.price)} ${p.unit}`}
              </div>
              <div className="text-xs text-[var(--muted)]">{t('dm.unitVndKg')}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{t('dm.intl')}</div>
              <div className="font-semibold text-[var(--text-strong)] tabular-nums">
                {item.intl?.vndPerKg != null ? fmtInt(item.intl.vndPerKg) : '—'}
              </div>
              <div className="text-xs text-[var(--muted)]">{t('dm.unitVndKg')}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">{t('dm.basis')}</div>
              <div className={`font-semibold tabular-nums ${tone}`}>
                {b ? `${b.basisVndPerKg > 0 ? '+' : ''}${fmtInt(b.basisVndPerKg)}` : '—'}
              </div>
              <div className="text-xs text-[var(--muted)]">{b ? `${fmtFixed(b.basisPct, 1)}%` : t('dm.unitVndKg')}</div>
            </div>
          </div>
          {explain ? (
            <p className="text-sm text-[var(--text)]">{explain}</p>
          ) : (
            <p className="text-xs text-[var(--muted)]">{fxRate === null ? t('dm.fxMissing') : t('dm.noIntl')}</p>
          )}
          <DualLine history={item.history} label={t('dm.chartLabel', { name })} />
          <div className="flex gap-3 text-xs text-[var(--muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[var(--series-1)]" />
              {t('dm.legend.domestic')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 rounded-full bg-[var(--series-3)]" />
              {t('dm.legend.intl')}
            </span>
          </div>
          {item.intl?.vndPerKg != null && item.intl.value ? (
            <p className="text-xs text-[var(--muted)]">
              {t('dm.intlDetail', {
                symbol: item.intl.instrumentId,
                value: fmtFixed(item.intl.value, 2),
                unit: item.intl.unit,
                date: fmtDate(item.intl.asOf),
                fx: fmtInt(fxRate),
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <DataStatusBadge status={statusFor(p.date)} compact sourceQuality={p.quality} />
            <span>{t(`dm.quality.${p.quality}` as TKey)}</span>
            <span>
              {t('dm.region')}: {p.region}
            </span>
            <span>
              {t('dm.date')}: {fmtDate(p.date)}
            </span>
            <span>
              {t('dm.source')}:{' '}
              <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline text-[var(--accent-text)]">
                {p.source}
              </a>
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

const inputCls =
  'w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text)]';

function EntryForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    commodity: 'coffee',
    region: '',
    price: '',
    unit: 'VND/kg',
    date: new Date().toISOString().slice(0, 10),
    source: '',
    sourceUrl: '',
    quality: 'MANUAL',
  });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const post = async (body: unknown) => {
    try {
      const res = await fetch('/api/domestic-prices', { method: 'POST', headers: { 'content-type': 'application/json', ...(getAdminToken() ? { Authorization: `Bearer ${getAdminToken()}`, 'X-Admin-Token': getAdminToken() } : {}) }, body: JSON.stringify(body) });
      const data = (await res.json()) as { error?: string; errors?: Array<{ line: number; error: string }>; total?: number };
      if (!res.ok) {
        const detail = res.status === 401 || res.status === 403 ? describeAuthError(res.status) : data.errors?.map((e) => `#${e.line}: ${e.error}`).join('; ') ?? data.error ?? String(res.status);
        setMsg({ ok: false, text: t('dm.entry.failed', { msg: detail }) });
        return;
      }
      invalidate('/api/domestic-prices');
      setMsg({ ok: true, text: t('dm.entry.saved', { n: data.total ?? 0 }) });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: t('dm.entry.failed', { msg: e instanceof Error ? e.message : String(e) }) });
    }
  };

  const field = (key: keyof typeof f, label: TKey, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-xs text-[var(--muted)]">
      {t(label)}
      <input className={`${inputCls} mt-1`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...props} />
    </label>
  );

  return (
    <Card className="space-y-3">
      <SectionHeader title={t('dm.entry.title')} subtitle={t('dm.entry.note')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-[var(--muted)]">
          {t('dm.entry.commodity')}
          <select className={`${inputCls} mt-1`} value={f.commodity} onChange={(e) => setF({ ...f, commodity: e.target.value })}>
            {DOMESTIC_COMMODITIES.map((c) => (
              <option key={c} value={c}>
                {t(`dm.commodity.${c}` as TKey)}
              </option>
            ))}
          </select>
        </label>
        {field('region', 'dm.entry.region', { placeholder: t('dm.entry.regionPh') })}
        {field('price', 'dm.entry.price', { inputMode: 'decimal' })}
        <label className="block text-xs text-[var(--muted)]">
          {t('dm.entry.unit')}
          <select className={`${inputCls} mt-1`} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            <option value="VND/kg">VND/kg</option>
            <option value="USD/t">USD/t</option>
          </select>
        </label>
        {field('date', 'dm.entry.date', { type: 'date' })}
        {field('source', 'dm.entry.source')}
        {field('sourceUrl', 'dm.entry.sourceUrl', { type: 'url', placeholder: 'https://' })}
        <label className="block text-xs text-[var(--muted)]">
          {t('dm.entry.quality')}
          <select className={`${inputCls} mt-1`} value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value })}>
            {(['MANUAL', 'UNOFFICIAL', 'OFFICIAL'] as const).map((q) => (
              <option key={q} value={q}>
                {t(`dm.quality.${q}` as TKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => post({ entries: [f] })}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent,var(--bg))]"
      >
        {t('dm.entry.save')}
      </button>
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">{t('dm.csv.title')}</summary>
        <p className="mt-2 text-xs text-[var(--muted)]">{t('dm.csv.hint')}</p>
        <textarea aria-label={t('dm.csv.title')} className={`${inputCls} mt-2 font-mono`} rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <button
          type="button"
          onClick={() => post({ csv })}
          className="mt-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)]"
        >
          {t('dm.csv.save')}
        </button>
      </details>
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? 'text-[var(--accent-text)]' : 'text-[var(--warning)]'}`}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}

export function DomesticPricesPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const entryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchJsonWithRetry<Overview>('/api/domestic-prices', { signal: ctrl.signal })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [nonce]);

  const hasAny = !!data?.items.some((i) => i.latest);
  return (
    <div className="space-y-4">
      <SectionHeader title={t('dm.title')} subtitle={t('dm.subtitle')} />
      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : error && !data ? (
        <p className="text-sm text-[var(--warning)]">{t('dm.error', { msg: error })}</p>
      ) : data ? (
        <>
          <p className="text-xs text-[var(--muted)]">
            {data.fx
              ? t('dm.fxLine', { fx: fmtInt(data.fx.usdVnd), source: data.fx.source, date: data.fx.asOf ? fmtDate(data.fx.asOf) : '—' })
              : t('dm.fxMissing')}
          </p>
          {hasAny ? (
            <div className="grid gap-4 md:grid-cols-2">
              {data.items.map((it) => (
                <CommodityCard key={it.commodity} item={it} fxRate={data.fx?.usdVnd ?? null} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t('dm.empty.title')}
              action={
                <button
                  type="button"
                  onClick={() => entryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="mt-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent,var(--bg))]"
                >
                  {t('dm.empty.cta')}
                </button>
              }
            />
          )}
        </>
      ) : null}
      <div ref={entryRef}>
        <EntryForm onSaved={reload} />
      </div>
    </div>
  );
}
