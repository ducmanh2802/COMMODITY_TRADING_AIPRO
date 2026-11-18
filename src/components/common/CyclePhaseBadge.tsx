import type { BottomClassification, CyclePhase } from '../../shared/types/cycle';
import { useT } from '../../i18n';

const PHASE_STYLES: Record<CyclePhase, { label: string; textClass: string; borderClass: string }> = {
  PHASE_1_ACCUMULATION: {
    label: 'Giai đoạn 1 · Tích lũy đáy',
    textClass: 'text-[#38BDF8]',
    borderClass: 'border-[#38BDF8]/40 bg-[#38BDF8]/10',
  },
  PHASE_2_EARLY_RECOVERY: {
    label: 'Giai đoạn 2 · Phục hồi sớm',
    textClass: 'text-[#22C55E]',
    borderClass: 'border-[#22C55E]/40 bg-[#22C55E]/10',
  },
  PHASE_3_MARKUP: {
    label: 'Giai đoạn 3 · Tăng trưởng',
    textClass: 'text-[#6366F1]',
    borderClass: 'border-[#6366F1]/40 bg-[#6366F1]/10',
  },
  PHASE_4_DISTRIBUTION: {
    label: 'Giai đoạn 4 · Phân phối',
    textClass: 'text-[#F59E0B]',
    borderClass: 'border-[#F59E0B]/40 bg-[#F59E0B]/10',
  },
  DATA_UNAVAILABLE: {
    label: 'DATA_UNAVAILABLE',
    textClass: 'text-[#E5E7EB]/60',
    borderClass: 'border-[#263244] bg-[#0B0E14]/80',
  },
};

export function CyclePhaseBadge({ phase, compact = false }: { phase: CyclePhase; compact?: boolean }) {
  const t = useT();
  const key: CyclePhase = PHASE_STYLES[phase] ? phase : 'DATA_UNAVAILABLE';
  const cfg = PHASE_STYLES[key];
  return (
    <span
      title={key === 'DATA_UNAVAILABLE' ? t('fr.phase.DATA_UNAVAILABLE.desc') : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded border ${cfg.borderClass} ${cfg.textClass} ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      {t(`fr.phase.${key}`)}
    </span>
  );
}

export function getBottomScoreAccent(classification: BottomClassification): string {
  switch (classification) {
    case 'EXTREME_BOTTOM_OPPORTUNITY':
    case 'STRONG_BOTTOM_CANDIDATE':
      return 'text-[#22C55E]';
    case 'EARLY_ACCUMULATION_ZONE':
      return 'text-[#38BDF8]';
    case 'NEUTRAL':
      return 'text-[#F59E0B]';
    case 'NO_BOTTOM_SIGNAL':
      return 'text-[#E5E7EB]/65';
    default:
      return 'text-[#E5E7EB]/45';
  }
}
