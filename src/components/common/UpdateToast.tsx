import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '../../i18n';

/** Shows a "new version" prompt when main.tsx reports a waiting service worker. */
export function UpdateToast(): ReactElement | null {
  const t = useT();
  const [worker, setWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => setWorker((e as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('ctap:sw-update', onUpdate);
    return () => window.removeEventListener('ctap:sw-update', onUpdate);
  }, []);

  if (!worker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-lg border px-4 py-2 shadow-lg md:left-auto md:right-4 md:w-auto"
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
    >
      <span className="text-sm font-medium">{t('pwaUpdate.ready')}</span>
      <span className="flex items-center gap-2">
        <button type="button" className="min-h-9 rounded-md px-3 text-sm" style={{ color: 'var(--muted)' }} onClick={() => setWorker(null)}>
          {t('pwaUpdate.later')}
        </button>
        <button
          type="button"
          className="min-h-9 rounded-md border px-3 text-sm font-semibold"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent-text)' }}
          onClick={() => worker.postMessage({ type: 'SKIP_WAITING' })}
        >
          {t('pwaUpdate.reload')}
        </button>
      </span>
    </div>
  );
}
