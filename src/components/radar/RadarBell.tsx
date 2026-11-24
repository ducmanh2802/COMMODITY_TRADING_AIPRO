import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { useTerminal } from '../../contexts/TerminalContext';
import type { AppModuleId } from '../../shared/types/risk';
import {
  clearRadarNotes,
  disableBrowserNotify,
  dismissToast,
  enableBrowserNotify,
  markRadarRead,
  startRadarPolling,
  toggleMute,
  useRadar,
} from './radarStore';
import { afterFirstPaint } from '../../shared/utils/defer';
import { useT } from '../../i18n';

/** TopBar bell for the market radar: unread count, notification list, mute per instrument, optional browser alerts. */
export function RadarBell() {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const radar = useRadar();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    const cancel = afterFirstPaint(() => {
      stop = startRadarPolling();
    });
    return () => {
      cancel();
      stop?.();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  // toasts auto-dismiss after 8 s
  useEffect(() => {
    if (radar.toasts.length === 0) return;
    const timers = radar.toasts.map((t) => window.setTimeout(() => dismissToast(t.id), 8000));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [radar.toasts]);

  const goRadar = () => {
    setActiveModule('radar' as AppModuleId);
    setOpen(false);
  };
  const { settings } = radar;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          markRadarRead();
        }}
        aria-label={radar.unread > 0 ? t('rd.bell.unread', { count: radar.unread }) : t('rd.bell.title')}
        aria-haspopup="true"
        aria-expanded={open}
        title={t('rd.bell.title')}
        className="relative w-10 h-10 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-[10px] text-[var(--text)] transition-colors"
      >
        <Bell className="w-3.5 h-3.5" aria-hidden="true" />
        {radar.unread > 0 && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--negative)] text-white text-[10px] leading-4 text-center">
            {radar.unread > 9 ? '9+' : radar.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="region" aria-label={t('rd.bell.panel')} className="absolute right-0 mt-2 w-80 max-w-[90vw] z-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3 space-y-2 text-xs text-[var(--text)]">
          <div className="flex items-center justify-between">
            <strong>{t('rd.bell.title')}</strong>
            <button type="button" onClick={goRadar} className="text-[var(--accent-text)] hover:underline">
              {t('rd.bell.open')}
            </button>
          </div>
          {radar.notes.length === 0 ? (
            <p className="text-[var(--text)]/60">{t('rd.bell.noNotes')}</p>
          ) : (
            <ul className="space-y-1.5 max-h-64 overflow-auto">
              {radar.notes.map((n) => (
                <li key={n.id} className="flex items-start gap-2">
                  <span className="flex-1">{n.text}</span>
                  <button
                    type="button"
                    onClick={() => toggleMute(n.instrumentId)}
                    title={settings.muted.includes(n.instrumentId) ? t('rd.unmute') : t('rd.mute')}
                    aria-label={settings.muted.includes(n.instrumentId) ? t('rd.unmute').replace('mã này', n.name) : t('rd.mute').replace('mã này', n.name)}
                    className="shrink-0 grid place-items-center min-w-10 min-h-10 sm:min-w-0 sm:min-h-0 text-[var(--text)]/60 hover:text-[var(--text-strong)]"
                  >
                    <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
            {settings.browserNotify ? (
              <button type="button" onClick={disableBrowserNotify} className="text-[var(--text)]/80 hover:text-[var(--text-strong)]">
                {t('rd.bell.browserOff')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enableBrowserNotify().then((r) => setMsg(r === 'granted' ? t('rd.bell.browserGranted') : r === 'denied' ? t('rd.bell.browserDenied') : t('rd.bell.browserUnsupported')))}
                className="text-[var(--accent-text)] hover:underline"
              >
                {t('rd.bell.browserOn')}
              </button>
            )}
            {radar.notes.length > 0 && (
              <button type="button" onClick={clearRadarNotes} className="ml-auto text-[var(--text)]/60 hover:text-[var(--text-strong)]">
                {t('rd.bell.clear')}
              </button>
            )}
          </div>
          {msg && <p className="text-[var(--text)]/70">{msg}</p>}
          {settings.muted.length > 0 && <p className="text-[var(--text)]/50">{t('rd.bell.mutedCount').replace('{count}', String(settings.muted.length))}</p>}
        </div>
      )}
      {radar.toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80 max-w-[90vw]" role="status" aria-live="polite">
          {radar.toasts.map((toast) => (
            <div key={toast.id} className="flex items-start gap-2 bg-[var(--surface)] border border-[var(--accent)]/50 rounded-xl shadow-xl p-3 text-xs text-[var(--text-strong)]">
              <button type="button" onClick={goRadar} className="flex-1 text-left">
                {toast.text}
              </button>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label={t('rd.bell.dismiss')} className="grid place-items-center min-w-10 min-h-10 -m-2 text-[var(--text)]/60 hover:text-[var(--text-strong)]">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
