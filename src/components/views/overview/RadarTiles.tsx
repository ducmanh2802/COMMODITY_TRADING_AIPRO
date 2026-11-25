import type { CommodityCycleSummary } from '../../../shared/types/cycle';
import { getCommodityVisual } from '../../../shared/data/commodityVisuals';
import { CyclePhaseBadge } from '../../common/CyclePhaseBadge';
import { DataStatusBadge } from '../../common/DataStatusBadge';
import { fmtPrice, hasPrice } from '../../common/quoteFormat';
import { fmtFixed, useT } from '../../../i18n';

interface Props {
  items: CommodityCycleSummary[];
  onOpen: (exchangeSymbol: string) => void;
}

export function RadarTiles({ items, onOpen }: Props) {
  const t = useT();
  if (items.length === 0) {
    return <p className="py-6 px-4 text-center text-xs text-[var(--text)]/55">{t('fr.ov2.radarEmpty')}</p>;
  }
  return (
    <div className="p-3 space-y-3">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {items.map((item) => {
          const nameVi = getCommodityVisual(item.instrument.id)?.nameVi ?? item.instrument.productName;
          const score = item.bottomScore;
          const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
          return (
            <li key={item.instrument.id}>
              <button
                type="button"
                onClick={() => onOpen(item.instrument.exchangeSymbol)}
                title={`${nameVi} · ${item.instrument.exchange} ${item.instrument.exchangeSymbol}${
                  item.instrument.mxvMapping?.mxvSymbol ? ` · MXV ${item.instrument.mxvMapping.mxvSymbol}` : ''
                }`}
                className="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)] transition-colors p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-strong)] truncate">
                    {item.instrument.exchangeSymbol}
                  </span>
                  <CyclePhaseBadge phase={item.cyclePhase} compact />
                </div>
                <div
                  role="img"
                  aria-label={`${t('rt.scoreLabel')}: ${score === null ? t('rt.noScore') : `${score}/100`}`}
                  className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden"
                >
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text)]/70 tabular-nums">
                  <span className="truncate">{nameVi}</span>
                  <span className="shrink-0">
                    {score !== null ? `${score}/100` : '—'}
                    {item.percentile10Y !== null ? ` · ${fmtFixed(item.percentile10Y, 0)}%` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                  {hasPrice(item.quote) ? (
                    <span className="text-[var(--text)]/90">{fmtPrice(item.quote.price)}</span>
                  ) : (
                    <span className="text-[var(--text)]/45">{t('fr.ov.noPrice')}</span>
                  )}
                  <DataStatusBadge
                    status={item.quote.status}
                    compact
                    sourceQuality={item.quote.sourceQuality}
                    delayMinutes={item.quote.delayMinutes}
                    kind={item.quote.kind}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <details className="text-xs text-[var(--text)]/70">
        <summary className="cursor-pointer font-medium text-[var(--accent-text)]">{t('rt.explain')}</summary>
        <div className="mt-2 space-y-1.5">
          <p>{t('fr.ov2.radarSub')}</p>
          <p>
            {t('fr.ov2.colBottom')} · {t('fr.ov2.colPct')} · {t('fr.ov2.colPhase')}
          </p>
          <p>{t('rt.explainBody')}</p>
        </div>
      </details>
    </div>
  );
}
