import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { BriefFact, BriefSection, BriefSectionStatus } from '../../../shared/types/brief';
import { fmtDate, fmtDateTime, hasKey, useI18n, type TKey } from '../../../i18n';

const STATUS_STYLE: Record<BriefSectionStatus, string> = {
  OK: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  PARTIAL: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  UNAVAILABLE: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
};

const QUALITY_STYLE: Record<string, string> = {
  OFFICIAL: 'text-emerald-300',
  LICENSED_VENDOR: 'text-emerald-300',
  UNOFFICIAL: 'text-amber-300',
  USER_PROVIDED: 'text-sky-300',
  DERIVED: 'text-[#A5B4FC]',
  REFERENCE: 'text-[#E5E7EB]/70',
};

export function StatusBadge({ status }: { status: BriefSectionStatus }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>
      {t(`brief.status.${status}` as TKey)}
    </span>
  );
}

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
    <li className="py-2 border-b border-[#263244]/60 last:border-b-0">
      <div className={`flex flex-col gap-0.5 ${isLongText ? '' : 'sm:flex-row sm:items-baseline sm:justify-between sm:gap-4'}`}>
        <span className="text-xs text-[#E5E7EB]/70 min-w-0">{fact.label[lang]}</span>
        <span
          className={
            isLongText
              ? 'text-sm text-[#E5E7EB]/90 leading-relaxed'
              : 'text-sm font-mono tabular-nums text-white break-words sm:text-right sm:shrink-0 sm:max-w-[60%]'
          }
        >
          {fact.value ? fact.value[lang] : <span className="text-[#E5E7EB]/45">{t('brief.noValue')}</span>}
          {fact.value && unit ? <span className="text-[#E5E7EB]/55 text-xs"> {unit}</span> : null}
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-[#E5E7EB]/45 break-all">
        <span className={QUALITY_STYLE[fact.quality] ?? ''}>{t(`brief.quality.${fact.quality}` as TKey)}</span>
        {fresh ? ` · ${fresh}` : ''}
        {fact.asOf ? ` · ${t('brief.asOf')}: ${fmtAsOf(fact.asOf)}` : ''}
        {` · ${t('brief.source')}: `}
        {/^https?:\/\//.test(fact.source) ? (
          <a href={fact.source} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-[#E5E7EB]/80">
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
    <section className="bg-[#111622] border border-[#263244] rounded-lg p-4 flex flex-col gap-3 min-w-0" aria-labelledby={`brief-${section.id}`}>
      <header className="flex items-start justify-between gap-3">
        <h3 id={`brief-${section.id}`} className="text-sm font-semibold text-white">
          {t(`brief.section.${section.id}` as TKey)}
        </h3>
        <StatusBadge status={section.status} />
      </header>

      <p className="text-sm leading-relaxed text-[#E5E7EB]/90">{section.plainText[lang]}</p>

      {section.facts.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[#E5E7EB]/45 mb-1">{t('brief.numbers')}</p>
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
          className="flex items-center gap-1.5 text-xs text-[#A5B4FC] hover:text-white"
        >
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
          {t('brief.explain')}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {open && <p className="mt-2 text-xs leading-relaxed text-[#E5E7EB]/70 bg-[#0B0E14] border border-[#263244] rounded-md p-3">{section.whatItMeans[lang]}</p>}
      </div>
    </section>
  );
}
