import { useEffect, useState } from 'react';
import { BellOff, Copy, RefreshCw } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { reportText } from '../../../shared/radar/notify';
import type { RadarItem, RadarRating, RadarSetup } from '../../../shared/types/radar';
import { refreshRadar, toggleMute, useRadar } from '../../radar/radarStore';
import { Card } from '../../ui/Card';
import { EmptyState } from '../../ui/EmptyState';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';
import { LineChart } from '../../ui/viz/LineChart';
import { useT } from '../../../i18n';
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

function RatingBlock({ rating }: { rating: RadarRating | undefined }) {
  const t = useT();
  if (!rating) return <p className="text-xs text-[var(--text)]/50">{t('rd.rating.none')}</p>;
  const color = GRADE_COLOR[rating.grade];
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold tabular-nums border"
          style={{ color, borderColor: color }}
          aria-label={t('rd.rating.badge').replace('{grade}', rating.grade).replace('{rating}', String(rating.rating))}
        >
          {rating.grade} · {rating.rating}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-3)] text-[var(--text-strong)]">{t(`rd.rating.dir.${rating.direction}` as 'rd.rating.dir.TĂNG')}</span>
        <span className="text-[11px] text-[var(--text)]/60">{t('rd.rating.conf').replace('{conf}', rating.confidence)}</span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-[var(--accent-text)]">{t('rd.rating.why')}</summary>
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
    <div className="flex items-center gap-2" role="img" aria-label={`${t('rd.scoreLabel')} ${score} trên 100`}>
      <div className="h-2 flex-1 rounded-full bg-[var(--surface-3)]">
        <div className="h-full rounded-r-[4px] bg-[var(--series-1)]" style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-semibold tabular-nums text-[var(--text-strong)] w-14 text-right">{score}/100</span>
    </div>
  );
}

function ItemCard({ item, rank, muted, onOpen }: { item: RadarItem; rank: number; muted: boolean; onOpen: () => void }) {
  const t = useT();
  const active = item.signals.filter((s) => s.active);
  const up = (item.changePct ?? 0) >= 0;
  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onOpen} className="text-left">
            <span className="text-xs text-[var(--text)]/50">{t('rd.rankPrefix').replace('{rank}', String(rank))}</span>
            <span className="text-base font-semibold text-[var(--text-strong)] hover:underline">{item.name}</span>
            <span className="text-xs text-[var(--text)]/60"> {item.symbol} · {item.category}</span>
          </button>
          <button
            type="button"
            onClick={() => toggleMute(item.id)}
            aria-pressed={muted}
            title={muted ? t('rd.unmute') : t('rd.mute')}
            className={`shrink-0 inline-flex items-center gap-1 text-xs ${muted ? 'text-[var(--warning)]' : 'text-[var(--text)]/60 hover:text-[var(--text-strong)]'}`}
          >
            <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
            {muted ? t('rd.muted') : t('rd.mute')}
          </button>
        </div>
        <RatingBlock rating={item.rating} />
        <ScoreBar score={item.score} />
        <div className="text-xs text-[var(--text)]/70 tabular-nums">
          Giá {fmt(item.lastClose)}
          {item.changePct !== null && (
            <span className={up ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
              {up ? ` (+${fmt(item.changePct)}%)` : ` (${fmt(item.changePct)}%)`}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {active.length === 0 && <span className="text-xs text-[var(--text)]/50">{t('rd.item.noSignals')}</span>}
          {active.map((s) => (
            <span key={s.id} title={s.reason ?? ''} className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[#BFDBFE]">
              {s.label} +{s.points}
            </span>
          ))}
        </div>
        <LineChart points={item.spark.map((v, i) => ({ t: String(i), v }))} ariaLabel={`Giá 30 phiên gần nhất của ${item.name}`} height={64} formatValue={fmt} />
        <ul className="list-disc pl-4 text-sm text-[var(--text)] space-y-0.5">
          {item.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--text)]/50 flex items-center gap-2">
          <span>Phiên {item.asOf}</span>
          <SourceChip sources={item.source ? [item.source] : []} />
          {item.quality ? <span className="text-[var(--muted)]">({item.quality})</span> : null}
        </p>
      </div>
    </Card>
  );
}

function SetupCard({ s, onOpen }: { s: RadarSetup; onOpen: () => void }) {
  return (
    <Card>
      <div className="space-y-1.5">
        <button type="button" onClick={onOpen} className="text-left">
          <span className="text-base font-semibold text-[var(--text-strong)] hover:underline">{s.name}</span>
          <span className="text-xs text-[var(--text)]/60"> {s.symbol}</span>
        </button>
        <RatingBlock rating={s.rating} />
        <p className="text-sm text-[var(--text-strong)]">{s.description}</p>
        <ul className="list-disc pl-4 text-xs text-[var(--text)] space-y-0.5">
          {s.conditions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <ul className="list-disc pl-4 text-xs text-[var(--warning)] space-y-0.5">
          {s.risks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="text-[11px] text-[var(--text)]/50 flex items-center gap-2">
          <span>Phiên {s.asOf}</span>
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
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-white/10 text-[var(--text-strong)] hover:bg-white/5">
          <Copy className="w-3.5 h-3.5" aria-hidden="true" /> {t('rd.copyBtn')}
        </button>
        <button type="button" onClick={() => void refreshRadar()} disabled={radar.loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-white/10 text-[var(--text-strong)] hover:bg-white/5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${radar.loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('rd.refreshBtn')}
        </button>
        {copied && <span className="text-xs text-[var(--text)]/70">{copied}</span>}
      </div>

      <p className="text-xs text-[var(--text)]/70">{t('rd.rating.note')}</p>
      <div role="group" aria-label={t('rd.sort.label')} className="flex items-center gap-2 text-xs">
        <span className="text-[var(--text)]/70">{t('rd.sort.label')}</span>
        <div className="inline-flex rounded-md border border-white/10 overflow-hidden">
          {(['rating', 'activity'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSort(m)}
              aria-pressed={sort === m}
              className={`px-3 py-1.5 ${sort === m ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold' : 'text-[var(--text-strong)] hover:bg-white/5'}`}
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
              <ItemCard key={i.id} item={i} rank={idx + 1} muted={radar.settings.muted.includes(i.id)} onOpen={() => openInstrumentIn(i.symbol, 'instrument')} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('rd.setupTitle')}</h3>
        <p className="text-xs text-[var(--text)]/60">{t('rd.setupNote')}</p>
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

      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--text-strong)]">{t('rd.caveatsTitle')}</h3>
        <ul className="list-disc pl-4 text-xs text-[var(--text)]/80 space-y-0.5">
          {data.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
