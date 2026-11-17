import { AlertCircle, CheckCircle2, Clock, Database, ShieldAlert, XCircle } from 'lucide-react';
import type { DataQualityStatus } from '../../shared/types/market';

interface DataStatusBadgeProps {
  status: DataQualityStatus;
  compact?: boolean;
  /** Optional source quality (e.g. 'UNOFFICIAL'); shown as an extra label when not official/licensed. */
  sourceQuality?: string;
  /** Optional declared source delay in minutes, shown next to the source-quality label. */
  delayMinutes?: number | null;
}

const STATUS_META: Record<
  DataQualityStatus,
  { label: string; colorClass: string; Icon: typeof CheckCircle2 }
> = {
  CURRENT: {
    label: 'CURRENT',
    colorClass: 'text-[#22C55E]',
    Icon: CheckCircle2,
  },
  DELAYED: {
    label: 'DELAYED',
    colorClass: 'text-[#F59E0B]',
    Icon: Clock,
  },
  HISTORICAL: {
    label: 'HISTORICAL',
    colorClass: 'text-[#6366F1]',
    Icon: Database,
  },
  STALE: {
    label: 'STALE',
    colorClass: 'text-[#F59E0B]',
    Icon: AlertCircle,
  },
  UNAVAILABLE: {
    label: 'DATA_UNAVAILABLE',
    colorClass: 'text-[#F59E0B]',
    Icon: ShieldAlert,
  },
  INVALID: {
    label: 'INVALID',
    colorClass: 'text-[#EF4444]',
    Icon: XCircle,
  },
};

export function DataStatusBadge({ status, compact = false, sourceQuality, delayMinutes }: DataStatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.UNAVAILABLE;
  const Icon = meta.Icon;
  const showQuality = sourceQuality === 'UNOFFICIAL';
  const delayLabel = typeof delayMinutes === 'number' && delayMinutes > 0 ? `~${delayMinutes}m delay` : null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap ${meta.colorClass}`}
      title={`Data quality status: ${meta.label}${showQuality ? ` · source ${sourceQuality}` : ''}${delayLabel ? ` · ${delayLabel}` : ''}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? status : meta.label}</span>
      {showQuality && (
        <span className="px-1 py-px rounded border border-[#F59E0B]/50 text-[10px] text-[#F59E0B]">
          {sourceQuality}
          {delayLabel ? ` · ${delayLabel}` : ''}
        </span>
      )}
    </span>
  );
}
