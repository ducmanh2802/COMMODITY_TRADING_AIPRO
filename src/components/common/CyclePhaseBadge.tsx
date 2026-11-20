import { useState } from 'react';
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

const PHASE_ORDER: CyclePhase[] = [
  'PHASE_1_ACCUMULATION',
  'PHASE_2_EARLY_RECOVERY',
  'PHASE_3_MARKUP',
  'PHASE_4_DISTRIBUTION',
];

/** Phase badge; click opens a plain-language explanation of the phase and the exact rule the app uses. */
export function CyclePhaseBadge({ phase, compact = false }: { phase: CyclePhase; compact?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const key: CyclePhase = PHASE_STYLES[phase] ? phase : 'DATA_UNAVAILABLE';
  const cfg = PHASE_STYLES[key];
  const explainable = key !== 'DATA_UNAVAILABLE';
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (explainable) setOpen((v) => !v);
        }}
        title={explainable ? t('fr.phase.clickHint') : t('fr.phase.DATA_UNAVAILABLE.desc')}
        aria-expanded={explainable ? open : undefined}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded border ${cfg.borderClass} ${cfg.textClass} ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
        } ${explainable ? 'cursor-pointer hover:brightness-125' : 'cursor-default'}`}
      >
        {t(`fr.phase.${key}`)}
        {explainable && <span aria-hidden="true">ⓘ</span>}
      </button>
      {open && explainable && (
        <>
          <span className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <span
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] whitespace-normal rounded-lg border border-[var(--border,#263244)] bg-[var(--surface,#0F1623)] p-3 text-left text-xs leading-relaxed text-[#E5E7EB] shadow-xl"
          >
            <span className="mb-2 flex gap-1">
              {PHASE_ORDER.map((p, i) => (
                <span
                  key={p}
                  className={`flex-1 rounded px-1 py-0.5 text-center text-[10px] ${
                    p === key ? `${PHASE_STYLES[p].borderClass} ${PHASE_STYLES[p].textClass} border font-semibold` : 'bg-white/5 text-[#E5E7EB]/50'
                  }`}
                >
                  {i + 1}
                </span>
              ))}
            </span>
            <span className={`block text-sm font-semibold ${cfg.textClass}`}>{t(`fr.phase.${key}`)}</span>
            <span className="mt-1 block text-[#E5E7EB]/70">{t('fr.phase.cycleIntro')}</span>
            <span className="mt-2 block font-medium text-white">{t('fr.phase.lblWhat')}</span>
            <span className="block text-[#E5E7EB]/85">{t(`fr.phase.${key}.what`)}</span>
            <span className="mt-2 block font-medium text-white">{t('fr.phase.lblRule')}</span>
            <span className="block text-[#E5E7EB]/85">{t(`fr.phase.${key}.rule`)}</span>
            <span className="mt-2 block font-medium text-white">{t('fr.phase.lblWatch')}</span>
            <span className="block text-[#E5E7EB]/85">{t(`fr.phase.${key}.watch`)}</span>
            <span className="mt-2 block text-[10px] text-[#E5E7EB]/50">{t('fr.phase.disclaimer')}</span>
          </span>
        </>
      )}
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
