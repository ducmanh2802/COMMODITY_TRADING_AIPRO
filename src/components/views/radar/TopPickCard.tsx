import type { ReactNode } from 'react';
import { BellOff } from 'lucide-react';
import { useT } from '../../../i18n';
import type { RadarItem } from '../../../shared/types/radar';
import { Card } from '../../ui/Card';

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const CHIP = 'inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] text-[var(--text-strong)]';

/** Compact top-pick card: rank, name, score bar, signal chips. Long content lives in a collapsed <details>. */
export function TopPickCard({ item, rank, muted, onOpen, onToggleMute, children }: { item: RadarItem; rank: number; muted: boolean; onOpen: () => void; onToggleMute: () => void; children: ReactNode }) {
  const t = useT();
  const r = item.rating;
  // Bar follows the rating the list is ranked by; activity score stays in the details.
  const bar = r ? r.rating : item.score;
  const nActive = item.signals.filter((s) => s.active).length;
  const up = (item.changePct ?? 0) >= 0;
  return (
    <Card>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold tabular-nums text-[var(--accent-text)]">{rank}</span>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left min-h-10">
            <span className="sr-only">{t('tp.open', { name: item.name })}</span>
            <span aria-hidden="true" className="block truncate text-sm font-semibold text-[var(--text-strong)] hover:underline">{item.name}</span>
            <span aria-hidden="true" className="block truncate text-[11px] text-[var(--muted)]">{item.symbol}</span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? t('rd.unmute') : t('rd.mute')}
            title={muted ? t('rd.unmute') : t('rd.mute')}
            className={`shrink-0 w-10 h-10 inline-flex items-center justify-center ${muted ? 'text-[var(--warning)]' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'}`}
          >
            <BellOff className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-2" role="img" aria-label={r ? t('tp.ratingAria', { score: bar }) : t('tp.scoreAria', { score: bar })}>
          <div className="h-2 flex-1 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: 'var(--accent)' }} />
          </div>
          <span className="w-8 text-right text-sm font-semibold tabular-nums text-[var(--text-strong)]">{bar}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {r && <span className={`${CHIP} font-semibold tabular-nums`}>{t('tp.grade', { grade: r.grade })}</span>}
          {r && <span className={CHIP}>{t(`rd.rating.dir.${r.direction}` as 'rd.rating.dir.TĂNG')}</span>}
          {r && <span className={CHIP}>{t('tp.conf', { conf: r.confidence })}</span>}
          <span className={CHIP}>{t('tp.signals', { n: nActive })}</span>
        </div>
        <p className="text-xs tabular-nums text-[var(--muted)]">
          {fmt(item.lastClose)}
          {item.changePct !== null && <span style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}> {up ? '+' : ''}{fmt(item.changePct)}%</span>}
          {item.asOf ? <span className="text-[var(--faint)]"> · {t('rd.session', { d: item.asOf })}{item.quality ? ` (${item.quality})` : ''}</span> : null}
        </p>
        <details className="text-xs">
          <summary className="cursor-pointer inline-flex min-h-10 items-center text-[var(--accent-text)]">{t('tp.detail')}</summary>
          <div className="space-y-2 pt-1">{children}</div>
        </details>
      </div>
    </Card>
  );
}
