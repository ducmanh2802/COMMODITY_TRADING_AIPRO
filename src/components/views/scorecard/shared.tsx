import { useI18n } from '../../../i18n';
import type { Scorecard, ScorecardDimension, ScorecardDimensionId } from '../../../shared/types/scorecard';
import { Badge } from '../../ui/Badge';
import { clampScore, qualityDotCount } from './scoreMath';

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


const TONE_VAR: Record<Tone, string> = {
  neutral: 'var(--muted)',
  accent: 'var(--accent)',
  positive: 'var(--positive)',
  negative: 'var(--negative)',
  warning: 'var(--warning)',
};

/** Thin 0-100 bar. Full label + score live in title/aria-label so the cell stays word-free. */
export function ScoreBar({ score, level, label }: { score: number | null; level?: string | null; label?: string }) {
  const { t } = useI18n();
  if (score === null || score === undefined) return <span className="text-xs text-[var(--faint)]" title={t('sc.noValue')}>—</span>;
  const pct = clampScore(score);
  const tone = LEVEL_TONE[level ?? ''] ?? 'neutral';
  const text = `${label ? `${label} · ` : ''}${Math.round(pct)}/100`;
  return (
    <span role="img" aria-label={text} title={text} className="inline-flex items-center gap-1.5">
      <span className="relative block h-2 w-14 rounded-full bg-[var(--surface-3)] overflow-hidden">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: TONE_VAR[tone] }} />
      </span>
    </span>
  );
}

/** Dimension → bar (falls back to em dash when unavailable). */
export function DimBar({ dim }: { dim: ScorecardDimension | undefined }) {
  const { lang } = useI18n();
  if (!dim || dim.status !== 'OK') return <ScoreBar score={null} />;
  return <ScoreBar score={dim.score} level={dim.level} label={dim.label?.[lang]} />;
}

/** Data-quality as 3 dots; label in title. */
export function QualityDots({ level, label, hint }: { level: string; label: string; hint?: string }) {
  const n = qualityDotCount(level);
  const tone = LEVEL_TONE[level] ?? 'neutral';
  const title = hint ? `${label} · ${hint}` : label;
  return (
    <span role="img" aria-label={label} title={title} className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: i < n ? TONE_VAR[tone] : 'var(--surface-3)' }} />
      ))}
    </span>
  );
}
