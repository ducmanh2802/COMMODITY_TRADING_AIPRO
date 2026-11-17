import { AlertCircle, CheckCircle2, Clock, Database, ShieldAlert, XCircle } from 'lucide-react';
import type { DataQualityStatus } from '../../shared/types/market';

interface DataStatusBadgeProps {
  status: DataQualityStatus;
  compact?: boolean;
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

export function DataStatusBadge({ status, compact = false }: DataStatusBadgeProps) {
  const meta = STATUS_META[status] ?? STATUS_META.UNAVAILABLE;
  const Icon = meta.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap ${meta.colorClass}`}
      title={`Data quality status: ${meta.label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{compact ? status : meta.label}</span>
    </span>
  );
}
