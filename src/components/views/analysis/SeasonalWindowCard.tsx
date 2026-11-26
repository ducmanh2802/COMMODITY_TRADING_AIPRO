/**
 * Seasonal window check + overfitting lesson (S4). Pure maths in `src/shared/analytics/seasonalWindow.ts`.
 * Uses only the already-loaded D1 closes; shows sample size prominently and warns when N < 10.
 */
import { useMemo, useState } from 'react';
import type { SeriesPoint } from '../../../shared/analytics';
import { scanWindows, seasonalWindow } from '../../../shared/analytics';
import { Notice, Panel, fmtPct, inputClass, labelClass } from './shared';
import { fmtFixed, useT } from '../../../i18n';

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const tap = 'min-h-[40px]';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 min-w-[110px]">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-sm font-mono text-[var(--text-strong)] tabular-nums">{value}</div>
    </div>
  );
}

export function SeasonalWindowCard({ closes }: { closes: SeriesPoint[] }) {
  const t = useT();
  const [sm, setSm] = useState(3);
  const [sd, setSd] = useState(1);
  const [em, setEm] = useState(4);
  const [ed, setEd] = useState(30);
  const [scanOn, setScanOn] = useState(false);
  const [len, setLen] = useState(30);

  const res = useMemo(() => seasonalWindow(closes, { month: sm, day: sd }, { month: em, day: ed }), [closes, sm, sd, em, ed]);
  const scan = useMemo(() => (scanOn ? scanWindows(closes, { lengthDays: len }) : null), [closes, scanOn, len]);

  const sel = (id: string, label: string, value: number, set: (n: number) => void, opts: readonly number[], name = false) => (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} className={`${inputClass} ${tap}`} value={value} onChange={(e) => set(Number(e.target.value))}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {name ? t(`an.month.${o as (typeof MONTHS)[number]}`) : o}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Panel title={t('swin.title')} subtitle={t('swin.subtitle')}>
      <div className="flex flex-wrap items-end gap-3">
        {sel('swin-sm', t('swin.startMonth'), sm, setSm, MONTHS, true)}
        {sel('swin-sd', t('swin.startDay'), sd, setSd, DAYS)}
        {sel('swin-em', t('swin.endMonth'), em, setEm, MONTHS, true)}
        {sel('swin-ed', t('swin.endDay'), ed, setEd, DAYS)}
      </div>

      {res.status === 'INVALID_INPUT' && <Notice tone="warn">{t('swin.invalid', { reason: res.reason ?? '' })}</Notice>}
      {res.status === 'INSUFFICIENT_DATA' && <Notice tone="warn">{t('swin.noYears')}</Notice>}

      {res.status === 'OK' && (
        <>
          <p className="text-base font-semibold text-[var(--text-strong)]" data-testid="swin-sample">
            {t('swin.sample', { n: res.n })}
          </p>
          {res.n < 10 && <Notice tone="warn">{t('swin.lowN')}</Notice>}
          {res.skippedYears.length > 0 && (
            <p className="text-xs text-[var(--muted)]">{t('swin.skipped', { n: res.skippedYears.length, years: res.skippedYears.join(', ') })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Stat label={t('swin.winRate')} value={fmtPct(res.winRate, 0)} />
            <Stat label={t('swin.median')} value={fmtPct(res.median)} />
            <Stat label={t('swin.mean')} value={fmtPct(res.mean)} />
            <Stat label={t('swin.worst')} value={res.worst ? `${res.worst.year}: ${fmtPct(res.worst.ret)}` : '—'} />
          </div>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-xs font-mono min-w-[480px]">
              <thead>
                <tr className="text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-1.5 pr-3 text-left font-medium">{t('swin.year')}</th>
                  <th className="py-1.5 px-3 text-right font-medium">{t('swin.entry')}</th>
                  <th className="py-1.5 px-3 text-right font-medium">{t('swin.exit')}</th>
                  <th className="py-1.5 px-3 text-right font-medium">{t('swin.ret')}</th>
                  <th className="py-1.5 px-3 text-left font-medium">{t('swin.dir')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/70">
                {res.years.map((y) => (
                  <tr key={y.year}>
                    <td className="py-1.5 pr-3 text-[var(--text-strong)]">{y.year}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" title={y.entryDate}>{fmtFixed(y.entryClose, 2)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums" title={y.exitDate}>{fmtFixed(y.exitClose, 2)}</td>
                    <td className={`py-1.5 px-3 text-right tabular-nums ${y.up ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{fmtPct(y.ret)}</td>
                    <td className={`py-1.5 px-3 ${y.up ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{y.up ? t('swin.up') : t('swin.down')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          aria-pressed={scanOn}
          onClick={() => setScanOn((v) => !v)}
          className={`${tap} px-4 rounded-md border border-[var(--accent)] text-xs font-medium ${scanOn ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'text-[var(--text-strong)]'}`}
        >
          {scanOn ? t('swin.scanHide') : t('swin.scanBtn')}
        </button>
        {scanOn && (
          <div>
            <label htmlFor="swin-len" className={labelClass}>
              {t('swin.scanLen')}
            </label>
            <select id="swin-len" className={`${inputClass} ${tap}`} value={len} onChange={(e) => setLen(Number(e.target.value))}>
              {[14, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {scan && (
        <div className="rounded-md border border-[var(--warning)]/50 bg-[var(--warning)]/10 p-3 space-y-2 text-xs text-[var(--text)]" data-testid="swin-scan">
          <h4 className="text-sm font-semibold text-[var(--text-strong)]">{t('swin.scanTitle')}</h4>
          {scan.status !== 'OK' || !scan.best ? (
            <p>{t('swin.scanNone')}</p>
          ) : (
            <>
              <p>{t('swin.scanResult', { windows: scan.windows, len: scan.lengthDays, evaluated: scan.evaluated, min: scan.minYears, great: scan.great })}</p>
              <p>{t('swin.scanChance', { exp: fmtFixed(scan.expectedByChance, 1) })}</p>
              <p>
                {t('swin.scanBest', {
                  start: scan.best.startMonthDay,
                  rate: fmtPct(scan.best.stats.winRate, 0),
                  median: fmtPct(scan.best.stats.median),
                  n: scan.best.stats.n,
                })}
              </p>
            </>
          )}
          <p className="font-medium text-[var(--text-strong)]">{t('swin.scanLesson')}</p>
        </div>
      )}

      <details className="text-xs text-[var(--text)]/80">
        <summary className={`${tap} flex items-center cursor-pointer text-[var(--accent)]`}>{t('swin.explain')}</summary>
        <p className="mt-1">{t('swin.explainBody')}</p>
        <p className="mt-1 text-[var(--muted)]">{t('swin.refs')}</p>
      </details>
    </Panel>
  );
}
