import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTerminal } from '../../../contexts/TerminalContext';
import { fmtDate, fmtFixed, fmtInt, useT } from '../../../i18n';
import { fetchJsonWithRetry } from '../../../shared/utils/http';

interface SessionRow {
  sessionDate: string;
  close: number;
  changePct: number | null;
  range: number;
  rangePct: number;
  rangeVsAtr: number | null;
  volume: number | null;
  bars: number | null;
  fromDaily: boolean;
  source: string;
  status: 'COMPLETE' | 'IN_PROGRESS';
  gapWeekdaysBefore: number;
}

interface SessionsResponse {
  count: number;
  status: 'HISTORICAL' | 'PARTIAL' | 'UNAVAILABLE';
  reason?: string;
  sessions: SessionRow[];
}

const SESSION_COUNT = 20;

function Bar({ widthPct, side, token }: { widthPct: number; side: 'left' | 'right'; token: string }) {
  return (
    <span className="relative block h-2 w-full" aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
      <span
        className="absolute inset-y-0 rounded-sm"
        style={{ background: token, width: `${Math.min(50, widthPct / 2)}%`, [side === 'right' ? 'left' : 'right']: '50%' }}
      />
    </span>
  );
}

/** Collapsible "20 phiên gần nhất" card. Fetches only when first opened. */
export function SessionHistoryCard() {
  const t = useT();
  const { selectedSymbol } = useTerminal();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [selectedSymbol]);

  useEffect(() => {
    if (!open || data || !selectedSymbol) return;
    const ctrl = new AbortController();
    setLoading(true);
    fetchJsonWithRetry<SessionsResponse>(
      `/api/market/sessions/${encodeURIComponent(selectedSymbol)}?count=${SESSION_COUNT}`,
      { signal: ctrl.signal }
    )
      .then((r) => setData(r))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'error');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [open, data, selectedSymbol]);

  const rows = data?.sessions ?? [];
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const up = rows.filter((r) => (r.changePct ?? 0) > 0).length;
    const down = rows.filter((r) => (r.changePct ?? 0) < 0).length;
    const avgRange = rows.reduce((s, r) => s + r.rangePct, 0) / rows.length;
    const biggest = rows.reduce((a, b) => (b.rangePct > a.rangePct ? b : a));
    const maxAbs = Math.max(0.0001, ...rows.map((r) => Math.abs(r.changePct ?? 0)));
    const maxVol = Math.max(1, ...rows.map((r) => r.volume ?? 0));
    return { up, down, avgRange, biggest, maxAbs, maxVol };
  }, [rows]);
  const dec = rows.length > 0 && Math.abs(rows[rows.length - 1].close) < 10 ? 3 : 2;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl min-w-0" aria-label={t('ses.title')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ins-sessions"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left min-h-[44px]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text-strong)]">{t('ses.title')}</span>
          <span className="block text-xs text-[var(--muted)]">{t('ses.hint')}</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id="ins-sessions" className="border-t border-[var(--border)] p-4 space-y-3 min-w-0">
          {loading && <p className="text-sm text-[var(--muted)]">{t('ses.loading')}</p>}
          {error && <p className="text-sm text-[var(--warning)]">{t('ses.error', { msg: error })}</p>}
          {data && rows.length === 0 && <p className="text-sm text-[var(--muted)]">{t('ses.empty')}</p>}
          {data && stats && (
            <>
              <p className="text-xs text-[var(--muted)] flex flex-wrap gap-x-4 gap-y-1">
                <span>{t('ses.stat.up')}: <b className="text-[var(--positive)]">{stats.up}</b></span>
                <span>{t('ses.stat.down')}: <b className="text-[var(--negative)]">{stats.down}</b></span>
                <span>{t('ses.stat.avgRange')}: <b className="text-[var(--text-strong)]">{fmtFixed(stats.avgRange, 2)}%</b></span>
                <span>
                  {t('ses.stat.biggest')}: <b className="text-[var(--text-strong)]">{fmtDate(stats.biggest.sessionDate)} ({fmtFixed(stats.biggest.rangePct, 2)}%)</b>
                </span>
              </p>
              {data.status === 'PARTIAL' && <p className="text-xs text-[var(--warning)]">{t('ses.partial', { n: data.count })}</p>}
              <div className="overflow-x-auto" tabIndex={0}>
                <table className="w-full min-w-[520px] text-xs">
                  <thead>
                    <tr className="text-left text-[var(--muted)]">
                      <th className="py-1 pr-2 font-medium">{t('ses.col.date')}</th>
                      <th className="py-1 pr-2 font-medium text-right">{t('ses.col.close')}</th>
                      <th className="py-1 px-2 font-medium w-40">{t('ses.col.change')}</th>
                      <th className="py-1 pr-2 font-medium text-right">{t('ses.col.range')}</th>
                      <th className="py-1 pl-2 font-medium w-28">{t('ses.col.volume')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows].reverse().map((r) => {
                      const ch = r.changePct;
                      const color = ch === null ? 'var(--muted)' : ch >= 0 ? 'var(--positive)' : 'var(--negative)';
                      return (
                        <tr key={r.sessionDate} className="border-t border-[var(--border)]">
                          <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--text-strong)]">
                            {fmtDate(r.sessionDate)}
                            {r.fromDaily && <span className="ml-1 text-[var(--muted)]" title={t('ses.fromDaily')}>D1</span>}
                            {r.status === 'IN_PROGRESS' && <span className="ml-1 text-[var(--warning)]" title={t('ses.inProgress')}>*</span>}
                            {r.gapWeekdaysBefore > 0 && (
                              <span className="ml-1 text-[var(--warning)]" title={t('ses.gap', { n: r.gapWeekdaysBefore })}>…</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{fmtFixed(r.close, dec)}</td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center gap-2">
                              <span className="w-14 text-right tabular-nums shrink-0" style={{ color }}>
                                {ch === null ? '—' : `${ch > 0 ? '+' : ''}${fmtFixed(ch, 2)}%`}
                              </span>
                              <Bar widthPct={ch === null ? 0 : (Math.abs(ch) / stats.maxAbs) * 100} side={ch !== null && ch < 0 ? 'left' : 'right'} token={color} />
                            </div>
                          </td>
                          <td
                            className="py-1.5 pr-2 text-right tabular-nums"
                            title={r.rangeVsAtr === null ? undefined : t('ses.rangeVsAtr', { x: fmtFixed(r.rangeVsAtr, 1) })}
                          >
                            {fmtFixed(r.range, dec)} <span className="text-[var(--muted)]">({fmtFixed(r.rangePct, 1)}%)</span>
                          </td>
                          <td className="py-1.5 pl-2">
                            {r.volume === null ? (
                              <span className="text-[var(--muted)]">—</span>
                            ) : (
                              <div className="flex items-center gap-2" title={fmtInt(r.volume)}>
                                <span className="relative block h-2 w-16 shrink-0" aria-hidden="true">
                                  <span
                                    className="absolute inset-y-0 left-0 rounded-sm bg-[var(--accent)] opacity-60"
                                    style={{ width: `${(r.volume / stats.maxVol) * 100}%` }}
                                  />
                                </span>
                                <span className="tabular-nums text-[var(--muted)]">{fmtInt(r.volume)}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-[var(--muted)]">{t('ses.source', { src: rows[rows.length - 1].source })}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
