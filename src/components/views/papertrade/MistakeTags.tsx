import { useId, useState } from 'react';
import { Tag } from 'lucide-react';
import { useT, type TKey } from '../../../i18n';
import { MISTAKE_NOTE_MAX, MISTAKE_TAGS, normalizeMistakeTags, type MistakeTag } from './mistakeStats';
import type { PaperTrade, TradePatch } from './paperModel';
import { inputCls } from './paperUi';

const tagLabel = (tag: MistakeTag): TKey => `mk.tag.${tag}` as TKey;
const btn = 'inline-flex min-h-10 items-center justify-center px-3 rounded-md text-xs';

/** Read-only chips of the mistake tags on a trade. */
export function MistakeChips({ tags }: { tags?: MistakeTag[] }) {
  const t = useT();
  const list = normalizeMistakeTags(tags);
  if (list.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('mk.tags')}>
      {list.map((tag) => (
        <li key={tag} className="rounded-full border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-2 py-0.5 text-[11px] text-[var(--text-strong)]">
          {t(tagLabel(tag))}
        </li>
      ))}
    </ul>
  );
}

/** Mistake tags of one closed trade: chips + an inline editor (prompted on losing trades). */
export function MistakeTagger({ trade, onSave }: { trade: PaperTrade; onSave: (patch: TradePatch) => void }) {
  const t = useT();
  const uid = useId();
  const [draft, setDraft] = useState<{ tags: MistakeTag[]; note: string } | null>(null);
  const current = normalizeMistakeTags(trade.mistakeTags);
  const isLoss = trade.pnlVnd < 0;

  if (!draft) {
    return (
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <MistakeChips tags={current} />
        {trade.mistakeNote && <span className="text-[var(--text)]/70 break-words min-w-0">“{trade.mistakeNote}”</span>}
        {isLoss && current.length === 0 && <span className="text-[var(--text)]/60">{t('mk.prompt')}</span>}
        <button
          type="button"
          className={`${btn} gap-1.5 border border-[var(--border)] text-[var(--accent-text)]`}
          onClick={() => setDraft({ tags: current, note: trade.mistakeNote ?? '' })}
        >
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {current.length ? t('mk.edit') : t('mk.add')}
        </button>
      </div>
    );
  }

  const toggle = (tag: MistakeTag) =>
    setDraft({ ...draft, tags: draft.tags.includes(tag) ? draft.tags.filter((x) => x !== tag) : normalizeMistakeTags([...draft.tags, tag]) });

  return (
    <fieldset className="space-y-2 rounded-md border border-[var(--border)] p-2 min-w-0">
      <legend className="px-1 text-[var(--text-strong)]">{t('mk.title')}</legend>
      <div className="flex flex-wrap gap-1.5">
        {MISTAKE_TAGS.map((tag) => {
          const on = draft.tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(tag)}
              className={`${btn} rounded-full border ${on ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text-strong)] font-semibold' : 'border-[var(--border)] text-[var(--text)]/80'}`}
            >
              {t(tagLabel(tag))}
            </button>
          );
        })}
      </div>
      <label htmlFor={`${uid}-note`} className="sr-only">{t('mk.note')}</label>
      <input
        id={`${uid}-note`}
        value={draft.note}
        maxLength={MISTAKE_NOTE_MAX}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder={t('mk.note')}
        className={inputCls}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btn} bg-[var(--accent)] text-white`}
          onClick={() => {
            onSave({ mistakeTags: draft.tags, mistakeNote: draft.note.trim().slice(0, MISTAKE_NOTE_MAX) });
            setDraft(null);
          }}
        >
          {t('mk.save')}
        </button>
        <button type="button" className={`${btn} border border-[var(--border)]`} onClick={() => setDraft(null)}>{t('mk.cancel')}</button>
      </div>
    </fieldset>
  );
}
