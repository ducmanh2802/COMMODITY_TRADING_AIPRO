import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import { useT } from '../../i18n';
import { browserNotifyIfGranted, checkWatchlist, dismissWatchAlert, useWatchlist } from './watchlistStore';
import { useWatchMeta } from './useWatchMeta';

/** Mounted once (TopBar): checks zones on every quote refresh and shows "entered zone" toasts. */
export function WatchlistAlerts() {
  const t = useT();
  const { quotesBySymbol, openInstrumentIn } = useTerminal();
  const { alerts } = useWatchlist();
  const { nameOf, fmtPrice, fmtZone } = useWatchMeta();

  useEffect(() => {
    const fresh = checkWatchlist(quotesBySymbol, { nameOf, fmtPrice, fmtZone });
    for (const a of fresh) {
      const params = { name: a.name, zone: a.zoneText, price: a.priceText };
      browserNotifyIfGranted(t('wl.alert.title'), t(a.live ? 'wl.alert.live' : 'wl.alert.delayed', params), a.id);
    }
  }, [quotesBySymbol, nameOf, fmtPrice, fmtZone, t]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timers = alerts.map((a) => window.setTimeout(() => dismissWatchAlert(a.id), 12000));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [alerts]);

  if (alerts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:w-96" role="status" aria-live="polite">
      {alerts.map((a) => (
        <div key={a.id} className="bg-[var(--surface)] border border-[var(--warning)] rounded-xl shadow-xl p-3 text-xs text-[var(--text)] flex items-start gap-2">
          <button type="button" onClick={() => openInstrumentIn(a.symbol, 'instrument')} className="flex-1 min-w-0 text-left">
            <strong className="block text-[var(--warning)]">{t('wl.alert.title')}</strong>
            <span className="block mt-0.5">{t(a.live ? 'wl.alert.live' : 'wl.alert.delayed', { name: a.name, zone: a.zoneText, price: a.priceText })}</span>
            <span className="block mt-0.5 text-[var(--muted)]">{t('wl.alert.note')}</span>
          </button>
          <button type="button" onClick={() => dismissWatchAlert(a.id)} aria-label={t('wl.alert.dismiss')} className="shrink-0 p-1 text-[var(--muted)] hover:text-[var(--text-strong)]">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
