import { useEffect, useState, type ReactElement } from 'react';
import { useT } from '../../i18n';

export function OfflineBanner(): ReactElement | null {
  const t = useT();
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-2 md:bottom-4 md:left-4 md:right-auto md:w-auto md:rounded-lg shadow-lg border"
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--text)',
      }}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" style={{ color: 'var(--warning)' }}>
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.59 3.43A20.97 20.97 0 0 1 24 12" />
          <path d="M0 12a20.97 20.97 0 0 1 5.21-3.93" />
        </svg>
        {t('offline.banner')}
      </span>
    </div>
  );
}