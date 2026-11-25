import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, Globe2, RefreshCw } from 'lucide-react';
import { fmtDate, fmtNum, hasKey, tr, useT } from '../../../i18n';
import type { MacroDatapoint, MacroOverview, WasdeRelease } from '../../../shared/types/macro';
import type { DataQualityStatus } from '../../../shared/types/market';
import { formatTimestampInZone } from '../../../shared/utils/time';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { MacroRecordCards } from '../../common/MacroRecordCards';
import { SourceChip } from '../../common/SourceChip';
import { providerOf } from '../pulse/provider';
import { Delta, Fold } from '../pulse/tileBits';
import { Sparkline } from '../../ui/viz/Sparkline';
import { FeedHeader } from './FeedHeader';
import { RecordForm } from './RecordForm';
import { useFundamentalNews } from './useFundamentalNews';

/** ISO date-only values are shown as dates; full timestamps in Vietnam time; free text as-is. */
function fmtWhen(v: string | null | undefined): string {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (Number.isNaN(Date.parse(v))) return v;
  return formatTimestampInZone(v, 'Asia/Ho_Chi_Minh');
}

function itemLabel(d: MacroDatapoint): string {
  const key = `macro.item.${d.id}`;
  return hasKey(key) ? tr(key) : d.label;
}

const SUMMARY_CLS = 'cursor-pointer inline-flex min-h-10 items-center text-[11px] text-[var(--muted)] hover:text-[var(--text)]';

/** Value tile: label + status, big number, change chip (+ 2-point sparkline prev -> now), source chip; provenance collapsed. */
function DatapointTile({ d }: { d: MacroDatapoint }) {
  const t = useT();
  const digits = d.id === 'DXY' ? 3 : d.unit.startsWith('million') && d.value !== null && !Number.isInteger(d.value) ? 1 : 0;
  const has = d.value !== null;
  const prev = d.previousValue ?? null;
  const change = has && prev !== null ? (d.value as number) - prev : null;
  const toneCls = change === null || change === 0 ? 'text-[var(--muted)]' : change > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
  return (
    <div className="p-3 space-y-1.5 text-xs min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-semibold text-[var(--text-strong)] min-w-0">{itemLabel(d)}</span>
        {has && <DataStatusBadge status={d.status} sourceQuality={d.sourceQuality} />}
      </div>
      {has ? (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums text-[var(--text-strong)]">
              {fmtNum(d.value as number, { minimumFractionDigits: digits, maximumFractionDigits: digits })}{' '}
              <span className="text-xs font-normal text-[var(--muted)]">{d.unit}</span>
            </p>
            {change !== null && (
              <Delta v={change} text={`${change > 0 ? '+' : ''}${fmtNum(change, { maximumFractionDigits: digits })}`} label={t('pulse.mc.vsPrev')} />
            )}
          </div>
          {prev !== null && (
            <Sparkline
              className="h-8 w-20 shrink-0"
              points={[
                { label: fmtWhen(d.previousAsOf), value: prev },
                { label: fmtWhen(d.asOf), value: d.value as number },
              ]}
              format={(v) => fmtNum(v, { maximumFractionDigits: digits })}
            />
          )}
        </div>
      ) : (
        <span className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--faint)]">{t('pulse.mc.noData')}</span>
      )}
      <details>
        <summary className={SUMMARY_CLS}>{t('pulse.mc.details')}</summary>
        <div className="mt-1 space-y-0.5 text-[11px] text-[var(--muted)] break-words">
          <div className="flex flex-wrap items-center gap-2 text-[var(--faint)]">
            {d.asOf && <span className="tabular-nums">{fmtWhen(d.asOf)}</span>}
            <SourceChip sources={[d.sourceName, d.sourceUrl]}>{providerOf(d.sourceName)}</SourceChip>
          </div>
          {prev !== null && <p className="tabular-nums">{t('macro.prev', { period: fmtWhen(d.previousAsOf), v: fmtNum(prev) })}</p>}
          {d.details && (
            <p className="tabular-nums">
              {Object.entries(d.details)
                .map(([k, v]) => {
                  const key: string = `macro.detail.${k}`;
                  return `${hasKey(key) ? tr(key) : k}: ${fmtNum(v)}`;
                })
                .join(' · ')}
            </p>
          )}
          <p>{t('macro.asOf', { v: fmtWhen(d.asOf) })}</p>
          {d.releasedAt && <p>{t('macro.releasedAt', { v: fmtWhen(d.releasedAt) })}</p>}
          <p>{t('macro.fetchedAt', { v: fmtWhen(d.fetchedAt) })}</p>
          <p>
            {t('macro.source')}: {d.sourceName}{' '}
            <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--accent-text)] underline underline-offset-2">
              {t('macro.openSource')} <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </p>
          {d.reason && <p className="text-[var(--warning)]">{d.reason}</p>}
        </div>
      </details>
    </div>
  );
}

function ReleaseList({ items }: { items: WasdeRelease[] }) {
  return (
    <ul className="space-y-1 text-[11px] text-[var(--muted)]">
      {items.map((r) => (
        <li key={r.releasedAtRaw} className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums text-[var(--text-strong)]">{fmtWhen(r.releasedAt ?? r.releasedAtRaw)}</span>
          {r.files.map((f) => (
            <a key={f} href={f} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline">
              {f.split('.').pop()}
            </a>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, status, children }: { title: string; status: DataQualityStatus; children: ReactNode }) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden min-w-0">
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
        <DataStatusBadge status={status} />
      </div>
      {children}
    </section>
  );
}

/** Compact EIA / WASDE / DXY / USD-VND overview (GET /api/macro/overview). Values never synthesized; provenance collapsed. */
function MacroOverviewPanel() {
  const t = useT();
  const [data, setData] = useState<MacroOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/macro/overview');
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as MacroOverview);
    } catch {
      setData(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestWasde = data?.wasde.releases[0];
  return (
    <div className="space-y-3" data-testid="macro-data-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--text-strong)] flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-[var(--accent)]" aria-hidden="true" />
            {t('macro.title')}
          </h2>
          <Fold summary={t('mv.explain')}>
            <p>{t('macro.subtitle')}</p>
            <p>{t('macro.keys')}</p>
          </Fold>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-1.5 px-3 border border-[var(--border)] text-xs text-[var(--text-strong)] rounded-md disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t('macro.refresh')}
        </button>
      </div>

      {loading && !data && <p className="text-xs text-[var(--muted)]">{t('macro.loading')}</p>}
      {failed && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <DataStatusBadge status="UNAVAILABLE" />
          <span className="text-[var(--faint)]">{t('pulse.mc.noData')}</span>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Section title={t('macro.section.eia')} status={data.eia.status}>
            <div className="divide-y divide-[var(--border)]/70">
              {data.eia.items.map((d) => (
                <DatapointTile key={d.id} d={d} />
              ))}
            </div>
          </Section>

          <Section title={t('macro.section.wasde')} status={data.wasde.status}>
            <div className="divide-y divide-[var(--border)]/70">
              {data.wasde.keyNumbers.map((d) => (
                <DatapointTile key={d.id} d={d} />
              ))}
            </div>
            <div className="px-3 py-2 border-t border-[var(--border)]/70 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
                <span>{t('pulse.mc.lastRelease')}</span>
                {latestWasde ? (
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 tabular-nums text-[var(--text-strong)]">{fmtWhen(latestWasde.releasedAt ?? latestWasde.releasedAtRaw)}</span>
                ) : (
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--faint)]">{t('pulse.mc.noData')}</span>
                )}
                <SourceChip sources={[data.wasde.calendarSourceUrl]}>ESMIS</SourceChip>
              </div>
              <details>
                <summary className={SUMMARY_CLS}>{t('pulse.mc.releases', { n: data.wasde.releases.length + data.wasde.upcoming.length })}</summary>
                <div className="mt-1 space-y-2">
                  <p className="text-[11px] text-[var(--muted)]">{t('macro.wasde.upcoming')}</p>
                  {data.wasde.upcoming.length > 0 ? <ReleaseList items={data.wasde.upcoming} /> : <p className="text-[11px] text-[var(--faint)]">{t('macro.wasde.noUpcoming')}</p>}
                  <p className="text-[11px] text-[var(--muted)]">{t('macro.wasde.releases')}</p>
                  {data.wasde.releases.length > 0 ? (
                    <ReleaseList items={data.wasde.releases.slice(0, 4)} />
                  ) : (
                    <p className="text-[11px] text-[var(--warning)] break-words">{data.wasde.reason ?? t('macro.noValue')}</p>
                  )}
                </div>
              </details>
            </div>
          </Section>

          <Section title={t('macro.section.fx')} status={data.fx.status}>
            <div className="divide-y divide-[var(--border)]/70">
              {data.fx.items.map((d) => (
                <DatapointTile key={d.id} d={d} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

/** Fundamental / macro: sourced EIA/WASDE/DXY/USD-VND panel + macro records + manual entry. */
export function MacroPanel() {
  const t = useT();
  const { records, status, loading, refetch } = useFundamentalNews();

  return (
    <div className="space-y-6">
      <FeedHeader title={t('news.title.fundamental')} status={status} onSynced={refetch} />
      <MacroOverviewPanel />
      <details className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4">
        <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-medium text-[var(--text-strong)]">{t('mv.recordForm')}</summary>
        <div className="pb-3">
          <RecordForm initialKind="MACRO" onSaved={refetch} />
        </div>
      </details>
      <details className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
        <summary className="px-4 min-h-10 inline-flex w-full cursor-pointer items-center text-sm font-semibold text-[var(--text-strong)]">
          {t('news.macro.title', { n: records.length })}
        </summary>
        {loading ? (
          <div className="p-6 text-xs font-mono text-[var(--text)]/60">{t('news.macro.loading')}</div>
        ) : records.length === 0 ? (
          <div className="p-6 text-xs font-mono text-[var(--warning)]">{t('news.macro.empty')}</div>
        ) : (
          <MacroRecordCards records={records} />
        )}
      </details>
    </div>
  );
}
