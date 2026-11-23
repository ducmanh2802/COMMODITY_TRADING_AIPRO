import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { fmtDate, fmtFixed, fmtInt, fmtNum, useT } from '../../i18n';
import type { MarketCandle } from '../../shared/types/market';
import {
  DEFAULT_SESSION_DISPLAY_LIMIT,
  SESSION_DISPLAY_PRESETS,
  buildBenchmarkSessionRows,
  buildCandleSessionRows,
  hasSufficientSessionsForAnalysis,
  sliceSessionRows,
} from '../../shared/utils/sessionHistory';
import { formatTimestampInZone } from '../../shared/utils/time';

type LimitOption = (typeof SESSION_DISPLAY_PRESETS)[number] | 'ALL';

interface BaseProps {
  decimals?: number;
  defaultLimit?: LimitOption;
  className?: string;
}

export type SessionHistoryTableProps =
  | (BaseProps & {
      mode: 'candles';
      candles: MarketCandle[];
      timeframe: string;
      priceUnit?: string | null;
      sourceNote?: string | null;
    })
  | (BaseProps & {
      mode: 'benchmark';
      points: ReadonlyArray<{ date: string; value: number }>;
      frequency: 'daily' | 'monthly';
      unit: string;
      sourceLabel: string;
    });

function isDailyOrWeekly(tf: string): boolean {
  const u = tf.trim().toUpperCase();
  return u === 'D1' || u === 'W1' || u === 'MN';
}

function formatSessionStamp(iso: string, tf: string): string {
  if (isDailyOrWeekly(tf)) {
    return fmtDate(iso.slice(0, 10));
  }
  return formatTimestampInZone(iso, 'Asia/Ho_Chi_Minh');
}

export function SessionHistoryTable(props: SessionHistoryTableProps) {
  const t = useT();
  const [limit, setLimit] = useState<LimitOption>(props.defaultLimit ?? DEFAULT_SESSION_DISPLAY_LIMIT);
  const decimals = props.decimals ?? 2;

  const candleRows = useMemo(
    () => (props.mode === 'candles' ? buildCandleSessionRows(props.candles) : []),
    [props.mode, props.mode === 'candles' ? props.candles : null]
  );

  const benchmarkRows = useMemo(
    () => (props.mode === 'benchmark' ? buildBenchmarkSessionRows(props.points) : []),
    [props.mode, props.mode === 'benchmark' ? props.points : null]
  );

  const totalCount = props.mode === 'candles' ? candleRows.length : benchmarkRows.length;
  const sufficient = hasSufficientSessionsForAnalysis(totalCount);

  if (totalCount === 0) {
    return null;
  }

  const shownCandles = props.mode === 'candles' ? sliceSessionRows(candleRows, limit) : [];
  const shownBenchmark = props.mode === 'benchmark' ? sliceSessionRows(benchmarkRows, limit) : [];
  const shownCount = props.mode === 'candles' ? shownCandles.length : shownBenchmark.length;
  const hasVolume = props.mode === 'candles' && shownCandles.some((r) => r.volume !== null && r.volume > 0);

  return (
    <section
      aria-label={t('sessions.title')}
      data-testid="session-history-panel"
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden ${props.className ?? ''}`}
    >
      <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{t('sessions.title')}</h2>
          <span className="px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] font-mono text-[11px] text-[var(--text-strong)]">
            {props.mode === 'candles'
              ? props.timeframe
              : t(props.frequency === 'daily' ? 'bm.freq.daily' : 'bm.freq.monthly')}
          </span>
          <span
            data-testid="session-history-count"
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
              sufficient
                ? 'border-[var(--positive)]/40 bg-[var(--positive)]/10 text-[var(--positive)]'
                : 'border-[var(--warning)]/40 bg-[var(--warning)]/10 text-[var(--warning)]'
            }`}
          >
            {sufficient ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{t('sessions.countBadge', { n: fmtInt(totalCount) })}</span>
          </span>
          <span className="text-[11px] text-[var(--muted)] hidden sm:inline">
            {sufficient ? t('sessions.sufficient') : t('sessions.insufficient', { n: totalCount })}
          </span>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={t('sessions.show')}>
          <span className="text-[11px] text-[var(--muted)] mr-1">{t('sessions.show')}:</span>
          {SESSION_DISPLAY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={totalCount < preset}
              aria-pressed={limit === preset}
              onClick={() => setLimit(preset)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors disabled:opacity-40 ${
                limit === preset
                  ? 'bg-[var(--accent)] text-white font-semibold'
                  : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] hover:text-[var(--text-strong)]'
              }`}
            >
              {preset}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={limit === 'ALL'}
            onClick={() => setLimit('ALL')}
            className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
              limit === 'ALL'
                ? 'bg-[var(--accent)] text-white font-semibold'
                : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] hover:text-[var(--text-strong)]'
            }`}
          >
            {t('sessions.all')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        {props.mode === 'candles' ? (
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums" data-testid="session-history-table">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-[11px] text-[var(--muted)] border-b border-[var(--border)] z-10">
              <tr>
                <th className="py-2 px-3 font-medium">{t('sessions.col.idx')}</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">{t('sessions.col.session')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('sessions.col.open')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('sessions.col.high')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('sessions.col.low')}</th>
                <th className="py-2 px-3 font-medium text-right">{t('sessions.col.close')}</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{t('sessions.col.change')}</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{t('sessions.col.range')}</th>
                {hasVolume && (
                  <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{t('sessions.col.volume')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {shownCandles.map((row, idx) => {
                const upBar = row.close >= row.open;
                const upDelta = row.changeAbs !== null ? row.changeAbs >= 0 : true;
                return (
                  <tr
                    key={row.timestamp}
                    className="hover:bg-[var(--surface-2)]/50 transition-colors"
                    data-testid="session-history-row"
                  >
                    <td className="py-1.5 px-3 text-[var(--muted)]">{idx + 1}</td>
                    <td className="py-1.5 px-3 text-[var(--text-strong)] whitespace-nowrap">
                      {formatSessionStamp(row.timestamp, props.timeframe)}
                    </td>
                    <td className="py-1.5 px-3 text-right text-[var(--text)]">{fmtFixed(row.open, decimals)}</td>
                    <td className="py-1.5 px-3 text-right text-[var(--text)]">{fmtFixed(row.high, decimals)}</td>
                    <td className="py-1.5 px-3 text-right text-[var(--text)]">{fmtFixed(row.low, decimals)}</td>
                    <td
                      className={`py-1.5 px-3 text-right font-semibold ${
                        upBar ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {fmtFixed(row.close, decimals)}
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right whitespace-nowrap ${
                        row.changePct === null
                          ? 'text-[var(--muted)]'
                          : upDelta
                            ? 'text-[var(--positive)]'
                            : 'text-[var(--negative)]'
                      }`}
                    >
                      {row.changePct !== null
                        ? `${row.changePct >= 0 ? '+' : ''}${fmtFixed(row.changePct, 2)}%`
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-right whitespace-nowrap text-[var(--text)]/80">
                      {fmtFixed(row.rangeAbs, decimals)}
                      {row.rangePct !== null ? ` (${fmtFixed(row.rangePct, 2)}%)` : ''}
                    </td>
                    {hasVolume && (
                      <td className="py-1.5 px-3 text-right text-[var(--text)]/75">
                        {row.volume !== null ? fmtNum(row.volume) : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums" data-testid="session-history-table">
            <thead className="sticky top-0 bg-[var(--surface-2)] text-[11px] text-[var(--muted)] border-b border-[var(--border)] z-10">
              <tr>
                <th className="py-2 px-3 font-medium">{t('sessions.col.idx')}</th>
                <th className="py-2 px-3 font-medium whitespace-nowrap">{t('sessions.col.session')}</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{t('sessions.col.value')}</th>
                <th className="py-2 px-3 font-medium text-right whitespace-nowrap">{t('sessions.col.change')}</th>
                <th className="py-2 px-3 font-medium">{t('sessions.col.source')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]/60">
              {shownBenchmark.map((row, idx) => {
                const upDelta = row.changeAbs !== null ? row.changeAbs >= 0 : true;
                return (
                  <tr
                    key={row.date}
                    className="hover:bg-[var(--surface-2)]/50 transition-colors"
                    data-testid="session-history-row"
                  >
                    <td className="py-1.5 px-3 text-[var(--muted)]">{idx + 1}</td>
                    <td className="py-1.5 px-3 text-[var(--text-strong)] whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="py-1.5 px-3 text-right font-semibold text-[var(--text-strong)]">
                      {fmtFixed(row.value, decimals)} <span className="text-[var(--muted)] font-normal">{props.unit}</span>
                    </td>
                    <td
                      className={`py-1.5 px-3 text-right whitespace-nowrap ${
                        row.changePct === null
                          ? 'text-[var(--muted)]'
                          : upDelta
                            ? 'text-[var(--positive)]'
                            : 'text-[var(--negative)]'
                      }`}
                    >
                      {row.changePct !== null && row.changeAbs !== null
                        ? `${row.changeAbs >= 0 ? '+' : ''}${fmtFixed(row.changeAbs, decimals)} (${row.changePct >= 0 ? '+' : ''}${fmtFixed(row.changePct, 2)}%)`
                        : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-[var(--muted)] font-sans text-[11px]">{props.sourceLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]/40 text-[11px] text-[var(--muted)] flex flex-wrap items-center justify-between gap-2">
        <span>
          {props.mode === 'benchmark'
            ? t('sessions.benchmarkNote')
            : t('sessions.candleNote', {
                shown: fmtInt(shownCount),
                total: fmtInt(totalCount),
                tf: props.timeframe,
                unit: props.priceUnit || t('common.na'),
              })}
        </span>
        {props.mode === 'candles' && props.sourceNote && (
          <span className="font-mono truncate max-w-md">{props.sourceNote}</span>
        )}
      </div>
    </section>
  );
}
