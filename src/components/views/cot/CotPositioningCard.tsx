import { useMemo, useState } from 'react';
import type { CotQueryResponse } from '../../../api/cotApi';
import { type CotCategory, categoriesFor } from '../../../shared/cot/analytics';
import { COT_PERCENTILE_WINDOW, computeCotPositioning } from '../../../shared/cot/positioning';
import { fmtDate, fmtFixed, fmtInt, tr, useT } from '../../../i18n';
import { Sparkline } from '../../ui/viz/Sparkline';
import { Panel } from '../analysis/shared';

/**
 * Positioning percentile card: latest net of one trader group vs its own trailing 156-week window.
 * Descriptive only; uses the stored CFTC rows already loaded by CotView.
 */
export function CotPositioningCard({ data }: { data: CotQueryResponse }) {
  const t = useT();
  const cats = useMemo<CotCategory[]>(() => categoriesFor(data.reportType).filter((c) => c !== 'nonReportables'), [data.reportType]);
  const [picked, setPicked] = useState<CotCategory | null>(null);
  const cat: CotCategory =
    picked && cats.includes(picked) ? picked : cats.includes('managedMoney') ? 'managedMoney' : cats.includes('nonCommercial') ? 'nonCommercial' : cats[0];
  const rows = data.analytics.rows;
  const res = useMemo(
    () =>
      computeCotPositioning(
        rows.flatMap((r) => {
          const v = r.categories[cat];
          return v ? [{ date: r.reportDate, net: v.net }] : [];
        })
      ),
    [rows, cat]
  );
  const label = (c: CotCategory) => tr(`cot.cat.${c}`);
  const idx = res.cotIndex;
  const bandText = res.band === 'low' ? t('cotpx.low') : res.band === 'high' ? t('cotpx.high') : res.band === 'mid' ? t('cotpx.mid') : null;
  const bandColor = res.band === 'low' ? 'var(--negative)' : res.band === 'high' ? 'var(--positive)' : 'var(--accent)';
  const spark = res.window.map((p) => ({ label: fmtDate(p.date), value: p.net }));

  return (
    <Panel title={t('cotpx.title')} subtitle={t('cotpx.subtitle')}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('cotpx.cat')}>
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={c === cat}
            onClick={() => setPicked(c)}
            className={`min-h-[40px] px-3 rounded-md border text-xs ${
              c === cat ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]' : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]'
            }`}
          >
            {label(c)}
          </button>
        ))}
      </div>

      {res.latestNet === null || res.percentile === null ? (
        <p className="text-xs text-[var(--text)]/70" data-testid="cotpx-none">
          {t('cotpx.none')}
        </p>
      ) : (
        <div className="space-y-3" data-testid="cotpx-card">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="text-[11px] text-[var(--text)]/60">{t('cotpx.net')}</div>
              <div className="text-xl font-semibold tabular-nums text-[var(--text-strong)]" data-testid="cotpx-net">
                {res.latestNet > 0 ? '+' : ''}
                {fmtInt(res.latestNet)}
              </div>
              {res.latestDate && <div className="text-[11px] text-[var(--text)]/55">{t('cotpx.asOf', { date: fmtDate(res.latestDate) })}</div>}
            </div>
            <div>
              <div className="text-[11px] text-[var(--text)]/60">{t('cotpx.pct')}</div>
              <div className="text-xl font-semibold tabular-nums text-[var(--text-strong)]" data-testid="cotpx-pct">
                {fmtFixed(res.percentile, 0)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text)]/60">{t('cotpx.index')}</div>
              <div className="text-xl font-semibold tabular-nums text-[var(--text-strong)]" data-testid="cotpx-index">
                {idx === null ? '—' : fmtFixed(idx, 0)}
              </div>
            </div>
            {res.window.length >= 2 && (
              <div className="min-w-[120px] flex-1 max-w-[220px]">
                <div className="text-[11px] text-[var(--text)]/60">{t('cotpx.spark')}</div>
                <Sparkline points={spark} format={(v) => fmtInt(v)} className="h-10" />
              </div>
            )}
          </div>

          <div>
            <div
              role="img"
              aria-label={`${t('cotpx.index')}: ${idx === null ? '—' : fmtFixed(idx, 0)} / 100`}
              className="relative h-3 rounded-full bg-[var(--surface-2)] border border-[var(--border)]"
            >
              <span className="absolute inset-y-0 left-0 w-[10%] rounded-l-full bg-[var(--negative)]/25" aria-hidden="true" />
              <span className="absolute inset-y-0 right-0 w-[10%] rounded-r-full bg-[var(--positive)]/25" aria-hidden="true" />
              {idx !== null && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)]"
                  style={{ left: `${Math.min(100, Math.max(0, idx))}%`, background: bandColor }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[var(--text)]/55 tabular-nums">
              <span>0 · {t('cotpx.low')}</span>
              <span>100 · {t('cotpx.high')}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--text)]/60">{t('cotpx.gauge')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {bandText && (
              <span className="inline-flex items-center rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-strong)]" data-testid="cotpx-band">
                {bandText}
              </span>
            )}
            {res.insufficient && (
              <span
                className="inline-flex items-center rounded-full border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]"
                data-testid="cotpx-few"
              >
                {t('cotpx.few')}
              </span>
            )}
            <span className="text-[var(--text)]/65">{t('cotpx.n', { n: res.n, w: COT_PERCENTILE_WINDOW })}</span>
          </div>
          {res.insufficient && <p className="text-[11px] text-[var(--warning)]">{t('cotpx.fewNote', { n: res.n, w: COT_PERCENTILE_WINDOW })}</p>}
          {res.zeroRange && <p className="text-[11px] text-[var(--warning)]">{t('cotpx.zero')}</p>}
          {res.min !== null && res.max !== null && (
            <p className="text-[11px] text-[var(--text)]/60 tabular-nums">{t('cotpx.range', { min: fmtInt(res.min), max: fmtInt(res.max) })}</p>
          )}
          <p className="text-[11px] text-[var(--text)]/60">{t('cotpx.bandNote')}</p>
        </div>
      )}

      <details className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
        <summary className="cursor-pointer select-none px-3 min-h-[44px] flex items-center text-xs font-medium text-[var(--text-strong)]">{t('cotpx.explain')}</summary>
        <ul className="space-y-1.5 border-t border-[var(--border)] p-3 text-[11px] text-[var(--text)]/75 list-disc pl-6">
          {(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'] as const).map((k) => (
            <li key={k}>{t(`cotpx.${k}`)}</li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
