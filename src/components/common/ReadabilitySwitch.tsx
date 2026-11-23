import { useSyncExternalStore } from 'react';
import { useT } from '../../i18n';
import {
  DEFAULT_READABILITY,
  loadReadability,
  readabilityAttrs,
  saveReadability,
  type Readability,
  type TextSize,
} from '../../shared/theme/readability';

let state: Readability = DEFAULT_READABILITY;
let inited = false;
const listeners = new Set<() => void>();

function init() {
  if (inited || typeof document === 'undefined') return;
  inited = true;
  state = loadReadability();
}

function apply(r: Readability) {
  const el = document.documentElement;
  for (const [k, v] of Object.entries(readabilityAttrs(r))) {
    if (v === null) el.removeAttribute(k);
    else el.setAttribute(k, v);
  }
}

function update(patch: Partial<Readability>) {
  init();
  state = { ...state, ...patch };
  apply(state);
  saveReadability(state);
  listeners.forEach((l) => l());
}

function useReadability(): Readability {
  init();
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => DEFAULT_READABILITY
  );
}

/** Text size (3 options) + high-contrast toggle. */
export function ReadabilitySwitch({ large = false }: { large?: boolean }) {
  const t = useT();
  const r = useReadability();
  const sizes: { id: TextSize; label: string }[] = [
    { id: 'normal', label: t('read.sizeNormal') },
    { id: 'lg', label: t('read.sizeLg') },
    { id: 'xl', label: t('read.sizeXl') },
  ];
  const high = r.contrast === 'high';
  const h = large ? 'min-h-12' : 'min-h-10';
  const btn = (on: boolean) =>
    `${h} px-3 ${large ? 'text-base px-4' : 'text-xs'} font-semibold rounded-lg whitespace-nowrap transition-colors ${
      on ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)] hover:text-[var(--text-strong)]'
    }`;
  const box = 'inline-flex items-center gap-0.5 bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-0.5';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text)]">{t('read.sizeLabel')}</span>
        <div role="group" aria-label={t('read.sizeLabel')} className={box}>
          {sizes.map((s) => (
            <button key={s.id} type="button" aria-pressed={r.textSize === s.id} onClick={() => update({ textSize: s.id })} className={btn(r.textSize === s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text)]">{t('read.contrastLabel')}</span>
        <div role="group" aria-label={t('read.contrastLabel')} className={box}>
          <button type="button" aria-pressed={!high} onClick={() => update({ contrast: 'normal' })} className={btn(!high)}>
            {t('read.contrastOff')}
          </button>
          <button type="button" aria-pressed={high} onClick={() => update({ contrast: 'high' })} className={btn(high)}>
            {t('read.contrastOn')}
          </button>
        </div>
      </div>
    </div>
  );
}
