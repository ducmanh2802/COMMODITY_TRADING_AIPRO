import { Info } from 'lucide-react';
import { useI18n } from '../../../i18n';

/** (i) popover: long explanation hidden until opened. Closed <details> content is not rendered. */
export function InfoTip({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <details className="group relative inline-block align-middle">
      <summary
        aria-label={t('n2.tdv.info')}
        title={t('n2.tdv.info')}
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-strong)] [&::-webkit-details-marker]:hidden"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </summary>
      <p className="absolute left-0 top-7 z-20 w-64 max-w-[80vw] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs leading-snug text-[var(--text)] shadow-lg">
        {text}
      </p>
    </details>
  );
}
