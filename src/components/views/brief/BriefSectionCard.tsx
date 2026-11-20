import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { BriefFact, BriefSection, BriefSectionStatus, BriefFactQuality } from '../../../shared/types/brief';
import { fmtDate, fmtDateTime, hasKey, useI18n, type TKey } from '../../../i18n';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';

const STATUS_STYLE: Record<BriefSectionStatus, 'positive' | 'warning' | 'neutral'> = {
  OK: 'positive',
  PARTIAL: 'warning',
  UNAVAILABLE: 'neutral',
};

const QUALITY_STYLE: Record<BriefFactQuality, 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'> = {
  OFFICIAL: 'positive',
  LICENSED_VENDOR: 'positive',
  UNOFFICIAL: 'warning',
  USER_PROVIDED: 'accent',
  DERIVED: 'accent',
  REFERENCE: 'neutral',
};

function fmtAsOf(v: string | null): string {
  if (!v) return '—';
  return /^\d{4}-\d{2}-\d{2}$/.test(v) || v.endsWith('T00:00:00.000Z') ? fmtDate(v.slice(0, 10)) : fmtDateTime(v);
}

function FactRow({ fact }: { fact: BriefFact }) {
  const { t, lang } = useI18n();
  const unitKey = fact.unit ? `brief.unit.${fact.unit}` : '';
  const unit = fact.unit ? (hasKey(unitKey) ? t(unitKey) : fact.unit) : '';
  const freshKey = fact.freshness ? `brief.fresh.${fact.freshness}` : '';
  const fresh = fact.freshness && hasKey(freshKey) ? t(freshKey) : null;
  // Text facts (notes, reasons, hours) read as prose; numbers stay right-aligned monospace.
  const isLongText = fact.raw === undefined && (fact.value?.[lang].length ?? 0) > 28;
  return (
    <li className="py-2 border-b border-[var(--border)]/60 last:border-b-0">
      <div className={`flex flex-col gap-0.5 ${isLongText ? '' : 'sm:flex-row sm:items-baseline sm:justify-between sm:gap-4'}`}>
        <span className="text-xs text-[var(--muted)] min-w-0">{fact.label[lang]}</span>
        <span
          className={
            isLongText
              ? 'text-sm text-[var(--text)] leading-relaxed'
              : 'text-sm font-mono tabular-nums text-[var(--text-strong)] break-words sm:text-right sm:shrink-0 sm:max-w-[60%]'
          }
        >
          {fact.value ? fact.value[lang] : <span className="text-[var(--faint)]">{t('brief.noValue')}</span>}
          {fact.value && unit ? <span className="text-[var(--faint)] text-xs"> {unit}</span> : null}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-[var(--faint)] break-all">
        <Badge tone={QUALITY_STYLE[fact.quality]}>{t(`brief.quality.${fact.quality}` as TKey)}</Badge>
        {fresh ? ` · ${fresh}` : ''}
        {fact.asOf ? ` · ${t('brief.asOf')}: ${fmtAsOf(fact.asOf)}` : ''}
        {` · ${t('brief.source')}: `}
        {/^https?:\/\//.test(fact.source) ? (
          <a href={fact.source} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-[var(--text)]/80">
            {fact.source.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          fact.source
        )}
      </div>
    </li>
  );
}

export function BriefSectionCard({ section }: { section: BriefSection }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3 min-w-0" aria-labelledby={`brief-${section.id}`}>
      <header className="flex items-start justify-between gap-3">
        <h3 id={`brief-${section.id}`} className="text-sm font-semibold text-[var(--text-strong)]">
          {t(`brief.section.${section.id}` as TKey)}
        </h3>
        <Badge tone={STATUS_STYLE[section.status]}>{t(`brief.status.${section.status}` as TKey)}</Badge>
      </header>

      <p className="text-sm leading-relaxed text-[var(--text)]">{section.plainText[lang]}</p>

      {section.facts.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)] mb-1">{t('brief.numbers')}</p>
          <ul>
            {section.facts.map((f, i) => (
              <FactRow key={`${f.label.en}-${i}`} fact={f} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-xs text-[var(--accent-text)] hover:text-white"
        >
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          {t('brief.explain')}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {open && <p className="mt-2 text-xs leading-relaxed text-[var(--muted)] bg-[var(--surface)] border border-[var(--border)] rounded-md p-3">{section.whatItMeans[lang]}</p>}
      </div>
    </Card>
  );
}
