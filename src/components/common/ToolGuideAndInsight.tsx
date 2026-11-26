import { AlertTriangle, Compass, Lightbulb } from 'lucide-react';
import { useT, type TKey } from '../../i18n';
import type { AnalyticalInsight, InsightTone } from '../../shared/utils/advancedInsights';

export type AdvancedToolGuideKey =
  | 'term-structure'
  | 'explorer'
  | 'analysis'
  | 'scanner'
  | 'signals'
  | 'technical'
  | 'backtest';

/**
 * Plain-language banner explaining what an Advanced tool is used for and when to open it.
 */
export function ToolPurposeBanner({ toolKey }: { toolKey: AdvancedToolGuideKey }) {
  const t = useT();
  return (
    <div
      data-testid={`tool-guide-${toolKey}`}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 px-4 py-3 text-xs space-y-1"
    >
      <div className="flex items-center gap-2 font-semibold text-[var(--text-strong)]">
        <Compass className="w-4 h-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
        <span>
          <span className="text-[var(--accent-text)]">{t('adv.guide.badge')}</span>{' '}
          <span className="text-[var(--muted)] font-normal">·</span>{' '}
          {t(`adv.guide.${toolKey}.title` as TKey)}
        </span>
      </div>
      <p className="text-[var(--text)]/85 leading-relaxed">
        {t(`adv.guide.${toolKey}.purpose` as TKey)}
      </p>
      <p className="text-[var(--muted)] leading-relaxed">
        {t(`adv.guide.${toolKey}.when` as TKey)}
      </p>
    </div>
  );
}

const TONE_BORDER: Record<InsightTone, string> = {
  positive: 'border-[var(--positive)]/45 bg-[var(--positive)]/5',
  negative: 'border-[var(--negative)]/45 bg-[var(--negative)]/5',
  warning: 'border-[var(--warning)]/45 bg-[var(--warning)]/5',
  neutral: 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/30',
};

const TONE_ICON: Record<InsightTone, string> = {
  positive: 'text-[var(--positive)]',
  negative: 'text-[var(--negative)]',
  warning: 'text-[var(--warning)]',
  neutral: 'text-[var(--accent-text)]',
};

/**
 * Synthesizes raw indicators/metrics into plain-language analytical takeaways.
 */
export function InsightBox({
  insight,
  title,
  testId,
}: {
  insight: AnalyticalInsight;
  title?: string;
  testId?: string;
}) {
  const t = useT();
  return (
    <section
      data-testid={testId ?? 'analytical-insight-box'}
      className={`rounded-lg border px-4 py-3.5 space-y-2 ${TONE_BORDER[insight.tone]}`}
    >
      <div className="flex items-start gap-2.5">
        <Lightbulb
          className={`w-4 h-4 shrink-0 mt-0.5 ${TONE_ICON[insight.tone]}`}
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {title ?? t('adv.insight.title')}
          </p>
          <p className="text-sm font-semibold text-[var(--text-strong)] leading-snug">
            {insight.headline}
          </p>
        </div>
      </div>

      {insight.bullets.length > 0 && (
        <ul className="space-y-1 pl-6 text-xs text-[var(--text)]/90 list-disc leading-relaxed">
          {insight.bullets.map((b, idx) => (
            <li key={idx}>{b}</li>
          ))}
        </ul>
      )}

      {insight.cautions.length > 0 && (
        <div className="ml-6 rounded-md border border-[var(--warning)]/40 bg-[var(--surface)]/80 px-3 py-2 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--warning)]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t('adv.insight.cautionLabel')}</span>
          </div>
          <ul className="space-y-0.5 pl-5 list-disc text-[var(--text)]/85">
            {insight.cautions.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
