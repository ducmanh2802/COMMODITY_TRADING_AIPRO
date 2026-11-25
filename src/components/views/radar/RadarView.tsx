import { useEffect, useId, useState, type ReactNode } from 'react';
import { Copy, Info, RefreshCw } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { reportText } from '../../../shared/radar/notify';
import type { RadarItem, RadarRating, RadarSetup } from '../../../shared/types/radar';
import { refreshRadar, toggleMute, useRadar } from '../../radar/radarStore';
import { groupScores, parseRR } from './radarHelpers';
export { groupScores, parseRR } from './radarHelpers';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { LineChart } from '../../ui/viz/LineChart';
import { useT } from '../../../i18n';
import { TopPickCard } from './TopPickCard';
import { SourceChip } from '../../common/SourceChip';

type SortMode = 'rating' | 'activity';
const SORT_KEY = 'radar.sort';
const readSort = (): SortMode => {
  try {
    return window.localStorage.getItem(SORT_KEY) === 'activity' ? 'activity' : 'rating';
  } catch {
    return 'rating';
  }
};
const ratingOf = (x: { rating?: RadarRating }): number => x.rating?.rating ?? -1;
/** Rating desc then activity score desc (default), or activity desc then rating desc. */
export function sortItems(items: RadarItem[], mode: SortMode): RadarItem[] {
  return [...items].sort((a, b) => (mode === 'rating' ? ratingOf(b) - ratingOf(a) || b.score - a.score : b.score - a.score || ratingOf(b) - ratingOf(a)) || a.symbol.localeCompare(b.symbol));
}
const GRADE_COLOR: Record<RadarRating['grade'], string> = { A: 'var(--accent)', B: 'var(--positive)', C: 'var(--warning)', D: 'var(--muted)' };

/** 4-segment bar (trend / setup / risk / data): segment width = group weight, fill = points earned. */
function SubScoreBar({ rating }: { rating: RadarRating }) {
  const t = useT();
  const groups = groupScores(rating);
  const total = groups.reduce((a, g) => a + g.max, 0) || 1;
  const fmt1 = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  const aria = groups.map((g) => `${t(`rd.grp.${g.id}` as 'rd.grp.trend')} ${fmt1(g.points)}/${g.max}`).join(', ');
  return (
    <div className="space-y-1">
      <div className="flex h-2.5 gap-0.5" role="img" aria-label={aria}>
        {groups.map((g) => (
          <div key={g.id} className="h-full rounded-[3px] bg-[var(--surface-3)] overflow-hidden" style={{ width: `${(g.max / total) * 100}%` }} title={`${t(`rd.grp.${g.id}` as 'rd.grp.trend')} ${fmt1(g.points)}/${g.max}`}>
            <div className="h-full" style={{ width: `${Math.min(100, (g.points / g.max) * 100)}%`, background: g.color }} />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5 text-[10px] leading-tight text-[var(--muted)]" aria-hidden="true">
        {groups.map((g) => (
          <span key={g.id} className="min-w-0 truncate" style={{ width: `${(g.max / total) * 100}%` }}>
            {t(`rd.grp.${g.id}` as 'rd.grp.trend')} <span className="tabular-nums text-[var(--text-strong)]">{Math.round(g.points)}</span>
            {g.missing ? '*' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two-sided R:R bar: apricot risk (1 unit) | blue reward (rr units). */
function RRBar({ rr }: { rr: number }) {
  const t = useT();
  const shown = Math.min(rr, 5);
  const riskW = (1 / (1 + shown)) * 100;
  const rrTxt = rr.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>{t('rd.rr.risk')} 1</span>
        <span className="tabular-nums">R:R 1:{rrTxt} <span className="text-[var(--faint)]">({t('rd.rr.est')})</span></span>
        <span>{t('rd.rr.reward')} {rrTxt}</span>
      </div>
      <div className="flex h-2 gap-0.5" role="img" aria-label={t('rd.rr.aria', { rr: rrTxt })}>
        <div className="h-full rounded-l-[4px] bg-[var(--negative)]" style={{ width: `${riskW}%` }} />
        <div className="h-full rounded-r-[4px] bg-[var(--positive)]" style={{ width: `${100 - riskW}%` }} />
      </div>
    </div>
  );
}

/** (i) popover next to the grade badge (pattern from InstrumentOverview ContextCard). */
function InfoTip({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="shrink-0 w-10 h-10 -m-2 flex items-center justify-center text-[var(--muted)] hover:text-[var(--text-strong)]"
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-full z-50 mt-1 block w-64 max-w-[calc(100vw-48px)] text-xs leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}

function RatingBlock({ rating }: { rating: RadarRating | undefined }) {
  const t = useT();
  const tipId = useId();
  if (!rating) return <p className="text-xs text-[var(--text)]/50">{t('rd.rating.none')}</p>;
  const color = GRADE_COLOR[rating.grade];
  const rr = parseRR(rating);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold tabular-nums border"
          style={{ color, borderColor: color }}
          aria-label={t('rd.rating.badge').replace('{grade}', rating.grade).replace('{rating}', String(rating.rating))}
        >
          {rating.grade} · {rating.rating}
        </span>
        <InfoTip id={tipId} label={t('rd.rating.info')}>
          {t('rd.rating.note')}
        </InfoTip>
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-3)] text-[var(--text-strong)]">{t(`rd.rating.dir.${rating.direction}` as 'rd.rating.dir.TĂNG')}</span>
        <span className="text-[11px] text-[var(--text)]/60">{t('rd.rating.conf').replace('{conf}', rating.confidence)}</span>
      </div>
      <SubScoreBar rating={rating} />
      {rr !== null && <RRBar rr={rr} />}
      <details className="text-xs">
        <summary className="cursor-pointer inline-flex min-h-10 items-center text-[var(--accent-text)]">{t('rd.rating.why')}</summary>
        <ul className="mt-1 space-y-0.5 text-[var(--text)]">
          {rating.components.map((c) => (
            <li key={c.label} className={c.available ? '' : 'opacity-60'}>
              <span className="font-medium tabular-nums">{c.available ? `${c.points}/${c.max}` : `—/${c.max}`}</span> {c.label}
              {c.available ? '' : ` (${t('rd.rating.na')})`}: <span className="text-[var(--text)]/70">{c.note}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function ScoreBar({ score }: { score: number }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2" role="img" aria-label={t('rd.scoreAria', { label: t('rd.scoreLabel'), score })}>
      <div className="h-2 flex-1 rounded-full bg-[var(--surface-3)]">
        <div className="h-full rounded-r-[4px] bg-[var(--series-1)]" style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-[var(--text-strong)] w-14 text-right">{score}/100</span>
    </div>
  );
}

function ItemDetail({ item }: { item: RadarItem }) {
  const t = useT();
  const active = item.signals.filter((s) => s.active);
  return (
    <>
      <RatingBlock rating={item.rating} />
      <ScoreBar score={item.score} />
      <div className="flex flex-wrap gap-1.5">
        {active.length === 0 && <span className="text-xs text-[var(--text)]/50">{t('rd.item.noSignals')}</span>}
        {active.map((s) => (
          <span key={s.id} title={s.reason ?? ''} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent-text)]">
            {s.label} +{s.points}
          </span>
        ))}
      </div>
      <LineChart points={item.spark.map((v, i) => ({ t: String(i), v }))} ariaLabel={t('rd.sparkAria', { name: item.name })} height={64} formatValue={fmt} />
      {item.reasons.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer inline-flex min-h-10 items-center text-[var(--accent-text)]">{t('rd.item.reasons', { n: item.reasons.length })}</summary>
          <ul className="list-disc pl-4 text-[var(--text)] space-y-0.5">
            {item.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-[var(--text)]/50 flex items-center gap-2">
        <span>{t('rd.session', { d: item.asOf })}</span>
        <SourceChip sources={item.source ? [item.source] : []} />
        {item.quality ? <span className="text-[var(--muted)]">({item.quality})</span> : null}
      </p>
    </>
  );
}

function SetupCard({ s, onOpen }: { s: RadarSetup; onOpen: () => void }) {
  const t = useT();
  return (
    <Card>
      <div className="space-y-1.5">
        <button type="button" onClick={onOpen} className="text-left min-h-10">
          <span className="text-base font-semibold text-[var(--text-strong)] hover:underline">{s.name}</span>
          <span className="text-xs text-[var(--text)]/60"> {s.symbol}</span>
        </button>
        <RatingBlock rating={s.rating} />
        <p className="text-sm text-[var(--text-strong)]">{s.description}</p>
        {(s.conditions.length > 0 || s.risks.length > 0) && (
          <details className="text-xs">
            <summary className="cursor-pointer flex min-h-10 flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-[var(--accent-text)]">{t('rd.setup.conds', { n: s.conditions.length })}</span>
              {s.risks.length > 0 && <span className="rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-[var(--warning)]">{t('rd.setup.risks', { n: s.risks.length })}</span>}
            </summary>
            <ul className="list-disc pl-4 text-[var(--text)] space-y-0.5">
              {s.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <ul className="mt-1 list-disc pl-4 text-[var(--warning)] space-y-0.5">
              {s.risks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-[11px] text-[var(--text)]/50 flex items-center gap-2">
          <span>{t('rd.session', { d: s.asOf })}</span>
          <SourceChip sources={s.source ? [s.source] : []} />
        </p>
      </div>
    </Card>
  );
}

/** "Báo cáo thị trường hôm nay": ranked activity radar, setups worth studying, events, caveats. */
export function RadarView() {
  const t = useT();
  const radar = useRadar();
  const { openInstrumentIn } = useTerminal();
  const [copied, setCopied] = useState<string | null>(null);
  const [sort, setSortState] = useState<SortMode>(readSort);
  const setSort = (m: SortMode) => {
    setSortState(m);
    try {
      window.localStorage.setItem(SORT_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };
  useEffect(() => {
    if (!radar.data) void refreshRadar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const data = radar.data;

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(reportText(data));
      setCopied(t('rd.copied'));
    } catch {
      setCopied(t('rd.copyFail'));
    }
    window.setTimeout(() => setCopied(null), 4000);
  };

  if (!data) {
    return radar.error ? <EmptyState title={t('rd.error')} description={radar.error} /> : <Skeleton className="h-64 w-full" />;
  }
  const sorted = sortItems(data.items, sort);
  const top = sorted.slice(0, 5);
  const setups = [...data.setups].sort((a, b) => (sort === 'rating' ? ratingOf(b) - ratingOf(a) : 0) || a.symbol.localeCompare(b.symbol));
  return (
    <div className="space-y-5">
      <SectionHeader
        title={t('rd.title')}
        subtitle={t('rd.subtitle').replace('{time}', data.asOf ?? 'không rõ').replace('{scored}', String(data.instrumentsScored)).replace('{total}', String(data.instrumentsTotal)) + (data.stale ? ` ${t('rd.stale')}` : '')}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text-strong)] hover:bg-[var(--surface-2)]">
          <Copy className="w-3.5 h-3.5" aria-hidden="true" /> {t('rd.copyBtn')}
        </button>
        <button type="button" onClick={() => void refreshRadar()} disabled={radar.loading} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 text-xs rounded-md border border-[var(--border)] text-[var(--text-strong)] hover:bg-[var(--surface-2)] disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${radar.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('rd.refreshBtn')}
        </button>
        {copied && <span className="text-xs text-[var(--text)]/70">{copied}</span>}
      </div>

      <div role="group" aria-label={t('rd.sort.label')} className="flex items-center gap-2 text-xs">
        <span className="text-[var(--text)]/70">{t('rd.sort.label')}</span>
        <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
          {(['rating', 'activity'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSort(m)}
              aria-pressed={sort === m}
              className={`min-h-10 px-3 py-1.5 ${sort === m ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold' : 'text-[var(--text-strong)] hover:bg-[var(--surface-2)]'}`}
            >
              {t(m === 'rating' ? 'rd.sort.rating' : 'rd.sort.activity')}
            </button>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('rd.topTitle')}</h3>
        {top.length === 0 ? (
          <EmptyState title={t('rd.noTop')} description={t('rd.noTopDesc')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {top.map((i, idx) => (
              <TopPickCard key={i.id} item={i} rank={idx + 1} muted={radar.settings.muted.includes(i.id)} onOpen={() => openInstrumentIn(i.symbol, 'instrument')} onToggleMute={() => toggleMute(i.id)}>
                <ItemDetail item={i} />
              </TopPickCard>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
          {t('rd.setupTitle')}
          <InfoTip id="rd-setup-note" label={t('rd.setupInfo')}>
            {t('rd.setupNote')}
          </InfoTip>
        </h3>
        {data.setups.length === 0 ? (
          <p className="text-sm text-[var(--text)]/70">{t('rd.noSetups')}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {setups.map((s) => (
              <SetupCard key={s.id} s={s} onOpen={() => openInstrumentIn(s.symbol, 'instrument')} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('rd.eventsTitle')}</h3>
        {data.events.length === 0 ? (
          <p className="text-sm text-[var(--text)]/70">{t('rd.noEvents')}</p>
        ) : (
          <ul className="text-sm text-[var(--text)] space-y-0.5">
            {data.events.map((e) => (
              <li key={`${e.date}-${e.kind}`}>
                <span className="tabular-nums text-[var(--text)]/70">{e.date}</span> · {e.label} <span className="text-[11px] text-[var(--text)]/50">({e.source})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.caveats.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
            {t('rd.caveatsTitle')}
            <span className="rounded-full border border-[var(--warning)]/40 px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]">{data.caveats.length}</span>
          </summary>
          <ul className="list-disc pl-4 text-[var(--text)]/80 space-y-0.5">
            {data.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
