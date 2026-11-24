import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Globe2, RefreshCw } from 'lucide-react';
import type { MacroDatapoint, MacroOverview, WasdeRelease } from '../../shared/types/macro';
import { formatTimestampInZone } from '../../shared/utils/time';
import { DataStatusBadge } from './DataStatusBadge';
import { fmtDate, fmtNum, hasKey, tr, useT } from '../../i18n';

/** ISO date-only values are shown as dates; full timestamps in Vietnam time. */
function fmtWhen(v: string | null | undefined): string {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (Number.isNaN(Date.parse(v))) return v; // free-text period (e.g. "2026/27 projection (Nov 2026 WASDE)")
  return formatTimestampInZone(v, 'Asia/Ho_Chi_Minh');
}

function itemLabel(d: MacroDatapoint): string {
  const key = `macro.item.${d.id}`;
  return hasKey(key) ? tr(key) : d.label;
}

function QualityTag({ q }: { q: MacroDatapoint['sourceQuality'] }) {
  const cls = q === 'OFFICIAL' ? 'text-[var(--positive)] border-[var(--positive)]/40' : 'text-[var(--warning)] border-[var(--warning)]/50';
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${cls}`}>
      {q} · {tr(`macro.quality.${q}`)}
    </span>
  );
}

function DatapointRow({ d }: { d: MacroDatapoint }) {
  const t = useT();
  const digits = d.id === 'DXY' ? 3 : d.unit.startsWith('million') && d.value !== null && !Number.isInteger(d.value) ? 1 : 0;
  const change = d.value !== null && d.previousValue != null ? d.value - d.previousValue : null;
  return (
    <div className="p-3 space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-[var(--text-strong)]">{itemLabel(d)}</span>
        <span className="flex items-center gap-2">
          <QualityTag q={d.sourceQuality} />
          <DataStatusBadge status={d.status} compact sourceQuality={d.sourceQuality} />
        </span>
      </div>
      <p className="font-mono text-sm text-[var(--text-strong)]">
        {d.value === null ? (
          <span className="text-[var(--warning)] text-xs">{t('macro.noValue')}</span>
        ) : (
          <>
            {fmtNum(d.value, { minimumFractionDigits: digits, maximumFractionDigits: digits })}{' '}
            <span className="text-[var(--text)]/60 text-xs">{d.unit}</span>
          </>
        )}
      </p>
      {d.previousValue != null && (
        <p className="font-mono text-[11px] text-[var(--text)]/70">
          {t('macro.prev', { period: fmtWhen(d.previousAsOf), v: fmtNum(d.previousValue) })}
          {change !== null && (
            <span className="ml-2">
              {t('macro.change', { v: `${change > 0 ? '+' : ''}${fmtNum(change, { maximumFractionDigits: digits })}` })}
            </span>
          )}
        </p>
      )}
      {d.details && (
        <p className="font-mono text-[11px] text-[var(--text)]/70">
          {Object.entries(d.details)
            .map(([k, v]) => {
              const key = `macro.detail.${k}`;
              return `${hasKey(key) ? tr(key) : k}: ${fmtNum(v)}`;
            })
            .join(' · ')}
        </p>
      )}
      <p className="font-mono text-[11px] text-[var(--text)]/60">
        {t('macro.asOf', { v: fmtWhen(d.asOf) })}
        {d.releasedAt ? ` · ${t('macro.releasedAt', { v: fmtWhen(d.releasedAt) })}` : ''}
        {` · ${t('macro.fetchedAt', { v: fmtWhen(d.fetchedAt) })}`}
      </p>
      <p className="text-[11px] text-[var(--text)]/50 break-words">
        {t('macro.source')}: {d.sourceName}{' '}
        <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 min-h-10 sm:min-h-0 text-[var(--accent-text)] underline underline-offset-2">
          {t('macro.openSource')} <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </p>
      {d.reason && <p className="text-[11px] font-mono text-[var(--warning)]/80 break-words">{d.reason}</p>}
    </div>
  );
}

function ReleaseList({ items }: { items: WasdeRelease[] }) {
  const t = useT();
  return (
    <ul className="space-y-1 text-[11px] font-mono text-[var(--text)]/75">
      {items.map((r) => (
        <li key={r.releasedAtRaw} className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--text-strong)]">{fmtWhen(r.releasedAt)}</span>
          <span className="text-[var(--text)]/50">{t('macro.wasde.rawTime', { v: r.releasedAtRaw })}</span>
          {r.files.length > 0 && (
            <span className="flex gap-1">
              {r.files.map((f) => (
                <a key={f} href={f} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                  {f.split('.').pop()}
                </a>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, status, children }: { title: string; status: MacroDatapoint['status']; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
        <DataStatusBadge status={status} compact />
      </div>
      {children}
    </section>
  );
}

/** T21: EIA / WASDE / DXY / USD-VND with source, link, period and release time on every value. */
export function MacroDataPanel() {
  const t = useT();
  const [data, setData] = useState<MacroOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/macro/overview');
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as MacroOverview);
    } catch {
      setData(null);
      setError(t('macro.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3" data-testid="macro-data-panel">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)] flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            {t('macro.title')}
          </h2>
          <p className="text-xs text-[var(--text)]/60 mt-1">{t('macro.subtitle')}</p>
          <p className="text-[11px] font-mono text-[var(--text)]/50 mt-1">{t('macro.keys')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] text-xs text-[var(--text-strong)] rounded-md disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('macro.refresh')}
        </button>
      </div>

      {loading && !data && <p className="text-xs font-mono text-[var(--text)]/60">{t('macro.loading')}</p>}
      {error && (
        <div className="flex items-center gap-2 text-xs font-mono text-[var(--warning)]">
          <DataStatusBadge status="UNAVAILABLE" compact /> {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Section title={t('macro.section.eia')} status={data.eia.status}>
            <div className="divide-y divide-[var(--border)]/70">
              {data.eia.items.map((d) => (
                <DatapointRow key={d.id} d={d} />
              ))}
            </div>
          </Section>

          <Section title={t('macro.section.wasde')} status={data.wasde.status}>
            <div className="p-3 space-y-2 border-b border-[var(--border)]/70">
              <p className="text-[11px] text-[var(--text)]/70">{t('macro.wasde.upcoming')}</p>
              {data.wasde.upcoming.length > 0 ? (
                <ReleaseList items={data.wasde.upcoming} />
              ) : (
                <p className="text-[11px] font-mono text-[var(--warning)]/80">
                  {t('macro.wasde.noUpcoming')}{' '}
                  <a href="https://www.usda.gov/oce/commodity/wasde" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                    usda.gov/oce/commodity/wasde
                  </a>
                </p>
              )}
              <p className="text-[11px] text-[var(--text)]/70 pt-1">{t('macro.wasde.releases')}</p>
              {data.wasde.releases.length > 0 ? (
                <ReleaseList items={data.wasde.releases.slice(0, 4)} />
              ) : (
                <p className="text-[11px] font-mono text-[var(--warning)]/80">{data.wasde.reason ?? t('macro.noValue')}</p>
              )}
              <a href={data.wasde.calendarSourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-0.5">
                {t('macro.openSource')} (ESMIS) <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
            <p className="px-3 pt-2 text-[11px] text-[var(--text)]/70">{t('macro.wasde.keyNumbers')}</p>
            <div className="divide-y divide-[var(--border)]/70">
              {data.wasde.keyNumbers.map((d) => (
                <DatapointRow key={d.id} d={d} />
              ))}
            </div>
          </Section>

          <Section title={t('macro.section.fx')} status={data.fx.status}>
            <div className="divide-y divide-[var(--border)]/70">
              {data.fx.items.map((d) => (
                <DatapointRow key={d.id} d={d} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
