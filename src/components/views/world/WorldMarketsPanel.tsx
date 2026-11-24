import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { CircleCheck, CircleSlash, Info } from 'lucide-react';
import { divergingFill } from '../../../shared/theme/chartScale';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtFixed, useI18n } from '../../../i18n';
import type { TFunction } from '../../../i18n';
import type { TKey } from '../../../i18n/vi';
import type { FxResponse } from '../pulse/FxPanel';
import type { MacroDatapoint } from '../../../shared/types/macro';
import type { DataQualityStatus } from '../../../shared/types/market';
import type { MarketPulse } from '../../../shared/types/marketPulse';
import type { TodayResponse } from '../../../shared/types/today';
import type { ScorecardListResponse } from '../../../shared/types/scorecard';
import {
  EXCHANGE_SCHEDULES,
  exchangeStatus,
  offsetFromVietnamHours,
  sessionsInVietnam,
  type ExchangeSchedule,
  type VietnamSessionRange,
} from '../../../shared/utils/exchangeHours';
import { VIETNAM_TIMEZONE } from '../../../shared/utils/time';
import { fetchJsonWithRetry } from '../../../shared/utils/http';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { SourceChip } from '../../common/SourceChip';
import { ScaleLegend } from '../../ui/viz/ScaleLegend';
import { Card } from '../../ui/Card';
import { SectionHeader } from '../../ui/SectionHeader';
import { Skeleton } from '../../ui/Skeleton';

/* ───────────────────────── 1. Exchange clock ───────────────────────── */

function dayRange(t: TFunction, days: number[]): string {
  const name = (d: number) => t(`wd.day.${d}` as TKey);
  // Order Mon..Sun for display, compress consecutive runs.
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  const runs: number[][] = [];
  for (const d of order) {
    const last = runs[runs.length - 1];
    const idx = (x: number) => [1, 2, 3, 4, 5, 6, 0].indexOf(x);
    if (last && idx(last[last.length - 1]) + 1 === idx(d)) last.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length > 1 ? `${name(r[0])}–${name(r[r.length - 1])}` : name(r[0]))).join(', ');
}

function duration(t: TFunction, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? t('wd.clock.hm', { h, m }) : t('wd.clock.m', { m });
}

function offsetText(t: TFunction, tz: string, now: Date): string {
  const city = t(`wd.city.${tz}` as TKey);
  const h = offsetFromVietnamHours(tz, now);
  if (h === 0) return t('wd.clock.offsetSame', { city });
  return h > 0 ? t('wd.clock.offset', { city, h }) : t('wd.clock.offsetAhead', { city, h: Math.abs(h) });
}

function ExchangeClockCard({ schedule, now }: { schedule: ExchangeSchedule; now: Date }) {
  const { t } = useI18n();
  const status = exchangeStatus(schedule, now);
  const ranges: VietnamSessionRange[] = useMemo(
    () => sessionsInVietnam(schedule, now),
    // Recompute only when the calendar day changes (DST shifts happen at day granularity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, now.toDateString()]
  );
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-strong)]">{t(`wd.ex.${schedule.id}` as TKey)}</div>
          <div className="text-[11px] text-[var(--muted)]">{schedule.scope}</div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium shrink-0 ${status.open ? 'text-[var(--positive)]' : 'text-[var(--muted)]'}`}
        >
          {status.open ? <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <CircleSlash className="h-3.5 w-3.5" aria-hidden="true" />}
          {status.open ? t('wd.clock.open') : t('wd.clock.closed')}
        </span>
      </div>
      {status.minutesToChange !== null && (
        <div className="text-xs text-[var(--text)]">
          {t(status.open ? 'wd.clock.closesIn' : 'wd.clock.opensIn', { t: duration(t, status.minutesToChange) })}
        </div>
      )}
      <ul className="space-y-0.5 text-xs tabular-nums text-[var(--text)]">
        {ranges.map((r) => (
          <li key={`${r.start}-${r.end}`} className="flex flex-wrap gap-x-1.5">
            <span className="text-[var(--muted)]">{t('wd.clock.dayLabel', { days: dayRange(t, r.days) })}</span>
            <span className="text-[var(--text-strong)]">
              {r.start}–{r.end}
              {r.endsNextDay ? t('wd.clock.nextDay') : ''}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-[var(--muted)]">{offsetText(t, schedule.tz, now)}</div>
    </Card>
  );
}

function ExchangeClock() {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const vnTime = new Intl.DateTimeFormat('en-GB', { timeZone: VIETNAM_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return (
    <section className="space-y-3">
      <SectionHeader title={t('wd.clock.title')} subtitle={t('wd.clock.subtitle')} actions={<span className="text-xs text-[var(--muted)] tabular-nums">{t('wd.clock.vnNow', { time: vnTime })}</span>} />
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {EXCHANGE_SCHEDULES.map((s) => (
          <ExchangeClockCard key={s.id} schedule={s} now={now} />
        ))}
      </div>
      <p className="text-xs text-[var(--warning)]">{t('wd.clock.note')}</p>
    </section>
  );
}

/* ───────────────────────── 2. Global macro tiles ───────────────────────── */

interface MacroTile {
  id: string;
  nameKey: TKey;
  hintKey: TKey;
  value: number | null;
  digits: number;
  suffix: string;
  /** Change text already formatted (without period label) and its sign for colouring. */
  change: { text: string; sign: number; periodKey: TKey } | null;
  status: DataQualityStatus;
  source: string | null;
  asOf: string | null;
  reason?: string;
}

const signed = (v: number, d: number, suffix: string): string => `${v > 0 ? '+' : ''}${fmtFixed(v, d)}${suffix}`;

function buildTiles(
  fx: { items: MacroDatapoint[] } | null,
  rates: FxResponse | null,
  pulse: MarketPulse | null
): MacroTile[] {
  const tiles: MacroTile[] = [];
  const sp: MacroTile = {
    id: 'sp500',
    nameKey: 'wd.macro.sp500.name',
    hintKey: 'wd.macro.sp500.hint',
    value: null,
    digits: 0,
    suffix: '',
    change: null,
    status: 'UNAVAILABLE',
    source: null,
    asOf: null,
  };

  const dxy = fx?.items.find((i) => i.id === 'DXY');
  const usdBroad = pulse?.fed.find((i) => i.id === 'USD_BROAD');
  if (dxy && dxy.value !== null && dxy.status !== 'UNAVAILABLE') {
    const prev = dxy.previousValue ?? null;
    tiles.push({
      id: 'dxy',
      nameKey: 'wd.macro.dxy.name',
      hintKey: 'wd.macro.dxy.hint',
      value: dxy.value,
      digits: 2,
      suffix: '',
      change: prev && prev !== 0 ? { text: signed(((dxy.value - prev) / prev) * 100, 2, '%'), sign: dxy.value - prev, periodKey: 'wd.macro.chgPrev' } : null,
      status: dxy.status,
      source: dxy.sourceName,
      asOf: dxy.asOf,
    });
  } else if (usdBroad && usdBroad.value !== null) {
    tiles.push({
      id: 'usdbroad',
      nameKey: 'wd.macro.usdbroad.name',
      hintKey: 'wd.macro.usdbroad.hint',
      value: usdBroad.value,
      digits: 2,
      suffix: '',
      change: usdBroad.change1m !== null ? { text: signed(usdBroad.change1m, 2, '%'), sign: usdBroad.change1m, periodKey: 'wd.macro.chg1m' } : null,
      status: 'HISTORICAL',
      source: usdBroad.source,
      asOf: usdBroad.asOf,
    });
  } else {
    tiles.push({
      id: 'dxy',
      nameKey: 'wd.macro.dxy.name',
      hintKey: 'wd.macro.dxy.hint',
      value: null,
      digits: 2,
      suffix: '',
      change: null,
      status: 'UNAVAILABLE',
      source: dxy?.sourceName ?? null,
      asOf: null,
      reason: dxy?.reason,
    });
  }

  const dgs10 = pulse?.fed.find((i) => i.id === 'DGS10');
  tiles.push({
    id: 'dgs10',
    nameKey: 'wd.macro.dgs10.name',
    hintKey: 'wd.macro.dgs10.hint',
    value: dgs10?.value ?? null,
    digits: 2,
    suffix: '%',
    change: dgs10 && dgs10.change1m !== null ? { text: signed(dgs10.change1m, 2, ' điểm %'), sign: dgs10.change1m, periodKey: 'wd.macro.chg1m' } : null,
    status: dgs10?.value != null ? 'HISTORICAL' : 'UNAVAILABLE',
    source: dgs10?.source ?? null,
    asOf: dgs10?.asOf ?? null,
    reason: dgs10?.note,
  });

  tiles.push(sp);

  const pairs: Array<{ pair: string; id: string; name: TKey; hint: TKey; digits: number }> = [
    { pair: 'EURUSD', id: 'eurusd', name: 'wd.macro.eurusd.name', hint: 'wd.macro.eurusd.hint', digits: 4 },
    { pair: 'USDCNY', id: 'usdcny', name: 'wd.macro.usdcny.name', hint: 'wd.macro.usdcny.hint', digits: 4 },
    { pair: 'USDBRL', id: 'usdbrl', name: 'wd.macro.usdbrl.name', hint: 'wd.macro.usdbrl.hint', digits: 4 },
  ];
  for (const p of pairs) {
    const r = rates?.rates.find((x) => x.pair === p.pair);
    tiles.push({
      id: p.id,
      nameKey: p.name,
      hintKey: p.hint,
      value: r?.value ?? null,
      digits: p.digits,
      suffix: '',
      change: r && r.change1w !== null ? { text: signed(r.change1w, 2, '%'), sign: r.change1w, periodKey: 'wd.macro.chg1w' } : null,
      status: r?.value != null ? 'HISTORICAL' : 'UNAVAILABLE',
      source: r?.source ?? null,
      asOf: r?.asOf ?? null,
      reason: r?.reason,
    });
  }
  return tiles;
}

/** (i) popover (pattern from InstrumentOverview ContextCard): one-line hint stays out of the card until asked. */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
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
        <span id={id} role="tooltip" className="absolute left-0 top-full z-50 mt-1 block w-60 max-w-[calc(100vw-48px)] text-xs font-normal leading-relaxed text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-2.5 shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}

function MacroTileCard({ tile }: { tile: MacroTile }) {
  const { t } = useI18n();
  const reason = tile.id === 'sp500' ? t('wd.macro.sp500.reason') : tile.reason;
  const has = tile.value !== null;
  const tone = !tile.change || tile.change.sign === 0 ? 'text-[var(--muted)]' : tile.change.sign > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]';
  return (
    <Card className="space-y-2" aria-label={t(tile.nameKey)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[var(--text-strong)]">
          <span className="min-w-0">{t(tile.nameKey)}</span>
          <InfoTip label={t('wd.macro.hintLabel', { name: t(tile.nameKey) })}>{t(tile.hintKey)}</InfoTip>
        </div>
        <DataStatusBadge status={tile.status} compact />
      </div>
      {has ? (
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-2xl font-semibold tabular-nums text-[var(--text-strong)]">
            {fmtFixed(tile.value, tile.digits)}
            {tile.suffix}
          </span>
          {tile.change && (
            <span className={`text-xs tabular-nums ${tone}`}>
              {t(tile.change.periodKey, { v: tile.change.text })}
            </span>
          )}
        </div>
      ) : (
        <div className="space-y-1 text-xs">
          <span className="inline-flex rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--faint)]">{t('wd.macro.unavailable')}</span>
          {reason && (
            <details>
              <summary className="cursor-pointer inline-flex min-h-10 items-center text-[11px] text-[var(--muted)] hover:text-[var(--text)]">{t('wd.macro.why')}</summary>
              <p className="text-[11px] text-[var(--muted)] break-words">{reason}</p>
            </details>
          )}
        </div>
      )}
      {(tile.source || tile.asOf) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
          {tile.asOf && <span className="tabular-nums" title={t('wd.macro.asOf', { v: tile.asOf })}>{tile.asOf.slice(0, 16).replace('T', ' ')}</span>}
          {tile.source && <SourceChip sources={[tile.source]} />}
        </div>
      )}
    </Card>
  );
}

function GlobalMacro() {
  const { t } = useI18n();
  const [fx, setFx] = useState<{ items: MacroDatapoint[] } | null>(null);
  const [rates, setRates] = useState<FxResponse | null>(null);
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    const opts = { signal: ctrl.signal };
    void Promise.allSettled([
      fetchJsonWithRetry<{ items: MacroDatapoint[] }>('/api/macro/fx', opts).then((r) => !ctrl.signal.aborted && setFx(r)),
      fetchJsonWithRetry<FxResponse>('/api/fx/rates', opts).then((r) => !ctrl.signal.aborted && setRates(r)),
      fetchJsonWithRetry<MarketPulse>('/api/market-pulse', opts).then((r) => !ctrl.signal.aborted && setPulse(r)),
    ]).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });
    return () => ctrl.abort();
  }, []);

  const tiles = useMemo(() => buildTiles(fx, rates, pulse), [fx, rates, pulse]);
  return (
    <section className="space-y-3">
      <SectionHeader title={t('wd.macro.title')} subtitle={t('wd.macro.subtitle')} />
      {loading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-busy="true" aria-label={t('wd.macro.loading')}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <MacroTileCard key={tile.id} tile={tile} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── 3. Performance by exchange ───────────────────────── */

const EXCHANGE_ORDER = ['CBOT', 'NYMEX', 'COMEX', 'ICEUS', 'ICEEU', 'ICE', 'SGX', 'CME'];

function pctText(v: number): string {
  const p = v * 100;
  return `${p > 0 ? '+' : ''}${fmtFixed(p, 2)}%`;
}

/** Background tint scaled to the move (saturates at 3%). */
function tint(pct: number): string {
  return divergingFill(pct, 0.03);
}

function ExchangePerformance() {
  const { t, lang } = useI18n();
  const { instruments, openInstrumentIn } = useTerminal();
  const [score, setScore] = useState<ScorecardListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchJsonWithRetry<TodayResponse>('/api/today', { signal: ctrl.signal })
      .then((r) => !ctrl.signal.aborted && setScore(r.scorecard))
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const groups = useMemo(() => {
    const bySymbol = new Map(instruments.map((i) => [i.exchangeSymbol, i]));
    const byEx = new Map<string, Array<{ sym: string; name: string; pct: number }>>();
    for (const c of score?.scorecards ?? []) {
      if (c.price.changePct === null) continue;
      const inst = bySymbol.get(c.exchangeSymbol);
      const label = inst?.mxvMapping?.mxvContractSpec?.linkedExchangeLabel || inst?.exchange || 'OTHER';
      const key = label === 'ICE' ? 'ICE' : label;
      const list = byEx.get(key) ?? [];
      list.push({ sym: c.exchangeSymbol, name: (lang === 'vi' && c.vietnameseName) || c.productName, pct: c.price.changePct });
      byEx.set(key, list);
    }
    return [...byEx.entries()]
      .map(([ex, items]) => ({
        ex,
        items: items.sort((a, b) => b.pct - a.pct),
        avg: items.reduce((s, x) => s + x.pct, 0) / items.length,
      }))
      .sort((a, b) => {
        const ia = EXCHANGE_ORDER.indexOf(a.ex);
        const ib = EXCHANGE_ORDER.indexOf(b.ex);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.ex.localeCompare(b.ex);
      });
  }, [score, instruments, lang]);

  const exLabel = (ex: string): string => {
    const key = `wd.ex.${ex}` as TKey;
    try {
      const label = t(key);
      return label === key ? ex : label;
    } catch {
      return ex;
    }
  };

  return (
    <section className="space-y-3">
      <SectionHeader title={t('wd.perf.title')} subtitle={t('wd.perf.subtitle')} />
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : groups.length === 0 ? (
        <Card className="text-sm text-[var(--muted)]">{t('wd.perf.empty')}</Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {groups.map((g) => {
            const w = Math.min(50, (Math.abs(g.avg) / 0.03) * 50);
            const up = g.avg >= 0;
            return (
              <Card key={g.ex} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-strong)]">
                    {exLabel(g.ex)} <span className="text-[11px] font-normal text-[var(--muted)]">· {t('wd.perf.count', { n: g.items.length })}</span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-[var(--text-strong)]">
                    {t('wd.perf.avg', { v: pctText(g.avg) })}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-[var(--surface-2)]" aria-hidden="true">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--chart-axis)]" />
                  <div
                    className={`absolute inset-y-0 ${up ? 'rounded-r-[4px]' : 'rounded-l-[4px]'} ${up ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'}`}
                    style={up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                  />
                </div>
                <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-3">
                  {g.items.map((it) => (
                    <button
                      key={it.sym}
                      type="button"
                      onClick={() => openInstrumentIn(it.sym, 'instrument')}
                      title={`${it.name} ${pctText(it.pct)}`}
                      className="rounded-md border border-[var(--border)] px-2 py-1.5 text-left transition hover:border-[var(--accent)]/60 min-w-0"
                      style={{ background: tint(it.pct) }}
                    >
                      <div className="truncate text-[11px] text-[var(--text-strong)]">{it.name}</div>
                      <div className="text-xs font-semibold tabular-nums text-[var(--text-strong)]">{pctText(it.pct)}</div>
                    </button>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
        <ScaleLegend kind="diverging" low={t('wd.perf.down')} mid="0" high={t('wd.perf.up')} />
        <span>{t('wd.perf.legend')}</span>
        <span className="text-[var(--faint)]">{t('wd.perf.asOf')}</span>
      </div>
    </section>
  );
}

/** "Thị trường quốc tế": exchange clock, global macro backdrop, performance by exchange. */
export function WorldMarketsPanel() {
  const { t } = useI18n();
  return (
    <div className="space-y-8">
      <ExchangeClock />
      <GlobalMacro />
      <ExchangePerformance />
    </div>
  );
}
