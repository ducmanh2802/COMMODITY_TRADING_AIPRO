import { useI18n } from '../../../i18n';
import type { Scorecard, ScorecardDimension, ScorecardDimensionId } from '../../../shared/types/scorecard';
import { Badge } from '../../ui/Badge';

type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';

export function dimOf(card: Scorecard, id: ScorecardDimensionId): ScorecardDimension | undefined {
  return card.dimensions.find((d) => d.id === id);
}

export const LEVEL_TONE: Record<string, Tone> = {
  STRONG_UP: 'positive', UP: 'positive', SIDEWAYS: 'neutral', DOWN: 'negative', STRONG_DOWN: 'negative',
  VERY_STRONG: 'positive', STRONG: 'positive', NEUTRAL: 'neutral', WEAK: 'negative', VERY_WEAK: 'negative',
  LOW: 'neutral', MEDIUM: 'warning', HIGH: 'negative',
  HIGH_VS_HISTORY: 'accent', MID_VS_HISTORY: 'neutral', LOW_VS_HISTORY: 'accent',
  RANGE_HIGH: 'accent', RANGE_MID: 'neutral', RANGE_LOW: 'accent',
  CLEAR: 'accent', MODERATE: 'neutral', UNCLEAR: 'neutral',
  GOOD: 'positive', LIMITED: 'warning', POOR: 'negative', UNAVAILABLE: 'neutral',
};

export function DimBadge({ dim }: { dim: ScorecardDimension | undefined }) {
  const { t, lang } = useI18n();
  if (!dim || dim.status !== 'OK' || !dim.label) return <span className="text-xs text-[var(--faint)]">{t('sc.noValue')}</span>;
  return <Badge tone={LEVEL_TONE[dim.level ?? ''] ?? 'neutral'}>{dim.label[lang]}</Badge>;
}

