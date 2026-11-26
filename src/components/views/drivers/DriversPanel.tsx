import { ErrorNote } from '../../common/ErrorNote';
import { toUserError, type UserError } from '../../common/friendlyError';
import { onTablistKeyDown, tablistRef } from '../../../shared/hooks/tablistKeys';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtFixed, useI18n } from '../../../i18n';
import type { ConeHorizon, DText, DriverHorizon, DriverPartId, DriversResponse } from '../../../shared/types/drivers';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { Card } from '../../ui/Card';
import { Skeleton } from '../../ui/Skeleton';
import { AttributionBar, ConeChart, SeasonBars } from './charts';

type L = 'vi' | 'en';
const tx = (x: DText, l: L) => x[l];

/** Block with a 1-2 line summary and an optional "xem thêm" body. */
function Block({ title, summary, children, source }: { title: string; summary: ReactNode; children?: ReactNode; source?: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h3>
      <div className="text-sm text-[var(--text)] line-clamp-2">{summary}</div>
      {children}
      {source && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs underline text-[var(--accent-text)]">
            {open ? t('drv.less') : t('drv.more')}
          </button>
          {open && <p className="text-[11px] text-[var(--faint)] whitespace-pre-line">{source}</p>}
        </>
      )}
    </Card>
  );
}

function WhyBlock({ data, l }: { data: DriversResponse; l: L }) {
  const { t } = useI18n();
  const a = data.attribution;
  const [days, setDays] = useState<1 | 5 | 20>(1);
  if (a.status === 'UNAVAILABLE' || a.horizons.length === 0)
    return <Block title={t('drv.why.title')} summary={a.reason ? tx(a.reason, l) : t('drv.unavailable')} />;
  const h: DriverHorizon = a.horizons.find((x) => x.days === days) ?? a.horizons[0];
  const labels: Record<DriverPartId, string> = {
    group: t('drv.part.group'),
    usd: t('drv.part.usd'),
    rates: t('drv.part.rates'),
    own: t('drv.part.own'),
  };
  const more = [
    a.note ? tx(a.note, l) : '',
    a.reason ? tx(a.reason, l) : '',
    a.factors.map((f) => `${tx(f.label, l)}: ${f.source}${f.asOf ? ` (${f.asOf})` : ''}`).join('\n'),
    h.parts.map((p) => `${labels[p.id]}: ${fmtFixed(p.pct, 2)} pp${p.beta !== null ? ` (beta ${fmtFixed(p.beta, 2)})` : ''}`).join('\n'),
    h.events.length > 0 ? t('drv.flag', { v: [...new Set(h.events.map((e) => `${e.date} ${tx(e.label, l)}`))].join(', ') }) : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Block title={t('drv.why.title')} summary={tx(h.sentence, l)} source={more}>
      <div className="flex gap-2" role="tablist" ref={tablistRef} onKeyDown={onTablistKeyDown}>
        {([1, 5, 20] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={d === days}
            onClick={() => setDays(d)}
            className={`px-2 py-1 rounded text-xs border ${d === days ? 'border-[var(--accent)] text-[var(--text-strong)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
          >
            {t(d === 1 ? 'drv.h1' : d === 5 ? 'drv.h5' : 'drv.h20')}
          </button>
        ))}
        {a.rSquared !== null && (
          <span className="ml-auto text-[11px] text-[var(--faint)] self-center">
            {t('drv.why.r2', { v: fmtFixed(a.rSquared * 100, 0), n: a.sampleDays })}
          </span>
        )}
      </div>
      <AttributionBar parts={h.parts} total={h.totalPct} labels={labels} ariaLabel={t('drv.why.chartLabel')} />
    </Block>
  );
}

function ConeRows({ h, l }: { h: ConeHorizon; l: L }) {
  const { t } = useI18n();
  const row = (label: string, b: { lo: number; hi: number; loPct: number; hiPct: number }) => (
    <tr key={label}>
      <td className="pr-3 text-[var(--muted)]">{label}</td>
      <td className="tabular-nums whitespace-nowrap">{fmtFixed(b.lo, 2)} – {fmtFixed(b.hi, 2)}</td>
      <td className="pl-3 tabular-nums whitespace-nowrap text-[var(--muted)]">{fmtFixed(b.loPct, 1)}% … +{fmtFixed(b.hiPct, 1)}%</td>
    </tr>
  );
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-[var(--text)]">{t(h.days === 5 ? 'drv.cone.h5' : 'drv.cone.h21')}</p>
      <div className="overflow-x-auto" tabIndex={0}>
      <table className="text-xs">
        <tbody>
          {h.parametric && (
            <>
              {row(`${t('drv.cone.b50')} · ${t('drv.cone.param', { d: 60 })}`, h.parametric.b50)}
              {row(`${t('drv.cone.b80')} · ${t('drv.cone.param', { d: 60 })}`, h.parametric.b80)}
            </>
          )}
          {h.empirical ? (
            <>
              {row(`${t('drv.cone.b50')} · ${t('drv.cone.emp', { n: h.empirical.n })}`, h.empirical.b50)}
              {row(`${t('drv.cone.b80')} · ${t('drv.cone.emp', { n: h.empirical.n })}`, h.empirical.b80)}
            </>
          ) : (
            <tr><td colSpan={3} className="text-[var(--faint)]">{t('drv.cone.empNone')}</td></tr>
          )}
        </tbody>
      </table>
      </div>
      {h.sentence && <p className="sr-only">{tx(h.sentence, l)}</p>}
    </div>
  );
}

function ConeBlock({ data, l }: { data: DriversResponse; l: L }) {
  const { t } = useI18n();
  const s = data.scenarios;
  if (s.status !== 'OK') return <Block title={t('drv.cone.title')} summary={s.reason ? tx(s.reason, l) : t('drv.unavailable')} />;
  const lead = s.horizons.find((h) => h.days === 5)?.sentence;
  const more = [
    ...s.horizons.map((h) => (h.sentence ? tx(h.sentence, l) : '')),
    t('drv.source', { v: s.source ?? '-' }),
    tx(s.disclaimer, l),
  ].join('\n');
  return (
    <Block title={t('drv.cone.title')} summary={lead ? tx(lead, l) : ''} source={more}>
      <ConeChart recent={s.recent} path={s.path} ariaLabel={t('drv.cone.chartLabel')} />
      {s.lastClose !== null && <p className="text-[11px] text-[var(--faint)]">{t('drv.cone.asOf', { v: fmtFixed(s.lastClose, 2), d: s.asOf ?? '-' })}</p>}
      {s.horizons.map((h) => <ConeRows key={h.days} h={h} l={l} />)}
    </Block>
  );
}

function EventsBlock({ data, l }: { data: DriversResponse; l: L }) {
  const { t } = useI18n();
  const ev = data.events.upcoming;
  const more = data.events.notes.map((n) => tx(n, l)).join('\n');
  return (
    <Block title={t('drv.events.title')} summary={ev.length === 0 ? t('drv.events.none') : `${ev[0].date} · ${tx(ev[0].label, l)}`} source={more}>
      {ev.length > 0 && (
        <ol className="relative border-l border-[var(--border)] ml-2 space-y-2">
          {ev.map((e) => (
            <li key={`${e.date}-${e.kind}`} className="pl-3 text-xs">
              <span className="absolute -left-1 mt-1 w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              <span className="tabular-nums text-[var(--text)]">{e.date}</span> · {tx(e.label, l)}{' '}
              <span className="text-[var(--faint)]">({t(e.scheduled === 'official' ? 'drv.events.official' : 'drv.events.weekly')} · {e.source})</span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}

function SeasonBlock({ data, l }: { data: DriversResponse; l: L }) {
  const { t } = useI18n();
  const s = data.seasonality;
  const title = `${t('drv.seas.title')}${s.month ? ` (${t('drv.seas.month', { m: s.month })})` : ''}`;
  if (s.status !== 'OK' || !s.hitText) return <Block title={title} summary={s.reason ? tx(s.reason, l) : t('drv.unavailable')} />;
  return (
    <Block
      title={title}
      summary={`${tx(s.hitText, l)} · ${t('drv.seas.mean', { v: s.mean === null ? '-' : fmtFixed(s.mean, 1) })}`}
      source={`${t('drv.seas.range', { min: fmtFixed(s.min ?? 0, 1), max: fmtFixed(s.max ?? 0, 1) })}\n${t('drv.source', { v: s.source ?? '-' })}`}
    >
      <SeasonBars samples={s.samples} hitLabel={tx(s.hitText, l)} />
    </Block>
  );
}

/** Instrument tab "Vì sao & sắp tới" (T56). Descriptive statistics and scenarios; not a forecast. */
export function DriversPanel() {
  const { t, lang } = useI18n();
  const l: L = lang === 'en' ? 'en' : 'vi';
  const { selectedSymbol } = useTerminal();
  const [data, setData] = useState<DriversResponse | null>(null);
  const [err, setErr] = useState<UserError | null>(null);
  const [nonce, setNonce] = useState(0);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    const ctrl = new AbortController();
    setData(null);
    setErr(null);
    fetchJsonWithRetry<DriversResponse>(`/api/drivers/${encodeURIComponent(selectedSymbol)}`, { signal: ctrl.signal })
      .then((d) => !ctrl.signal.aborted && setData(d))
      .catch((e) => !ctrl.signal.aborted && setErr(toUserError(e)));
    return () => ctrl.abort();
  }, [selectedSymbol, nonce]);
  if (err)
    return (
      <Card className="space-y-2 text-sm">
        <ErrorNote error={err} text={t('drv.error', { msg: err.message })} className="text-[var(--warning)]" />
        <button type="button" onClick={retry} className="underline text-[var(--accent-text)]">{t('drv.retry')}</button>
      </Card>
    );
  if (!data)
    return (
      <div className="space-y-3" role="status" aria-busy="true" aria-label={t('drv.loading')}>
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--faint)]" data-testid="drivers-asof">
        <DataStatusBadge status={data.asOf ? 'HISTORICAL' : 'UNAVAILABLE'} />
        <span>{data.asOf ? t('b2.drv.line', { date: data.asOf, src: data.scenarios.source ? ` · ${data.scenarios.source}` : '' }) : t('b2.drv.none')}</span>
      </p>
      <WhyBlock data={data} l={l} />
      <ConeBlock data={data} l={l} />
      <div className="grid gap-3 md:grid-cols-2">
        <EventsBlock data={data} l={l} />
        <SeasonBlock data={data} l={l} />
      </div>
      <p className="text-[11px] text-[var(--faint)]">{tx(data.disclaimer, l)}</p>
    </div>
  );
}
