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
import { useT } from '../../i18n';

/** TopBar bell for the market radar: unread count, notification list, mute per instrument, optional browser alerts. */
export function RadarBell() {
  const t = useT();
  const { setActiveModule } = useTerminal();
  const radar = useRadar();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => startRadarPolling(), []);
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
        aria-label={radar.unread > 0 ? t('rd.bell.unread').replace('{count}', String(radar.unread)) : t('rd.bell.title')}
        title={t('rd.bell.title')}
        className="relative w-9 h-9 grid place-items-center bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-[10px] text-[var(--text)] transition-colors"
      >
        <Bell className="w-3.5 h-3.5" aria-hidden="true" />
        {radar.unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#EF4444] text-white text-[10px] leading-4 text-center">
            {radar.unread > 9 ? '9+' : radar.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] z-40 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl p-3 space-y-2 text-xs text-[#E5E7EB]">
          <div className="flex items-center justify-between">
            <strong>{t('rd.bell.title')}</strong>
            <button type="button" onClick={goRadar} className="text-[#93C5FD] hover:underline">
              {t('rd.bell.open')}
            </button>
          </div>
          {radar.notes.length === 0 ? (
            <p className="text-[#E5E7EB]/60">{t('rd.bell.noNotes')}</p>
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
                    className="shrink-0 text-[#E5E7EB]/60 hover:text-white"
                  >
                    <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
            {settings.browserNotify ? (
              <button type="button" onClick={disableBrowserNotify} className="text-[#E5E7EB]/80 hover:text-white">
                {t('rd.bell.browserOff')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void enableBrowserNotify().then((r) => setMsg(r === 'granted' ? t('rd.bell.browserGranted') : r === 'denied' ? t('rd.bell.browserDenied') : t('rd.bell.browserUnsupported')))}
                className="text-[#93C5FD] hover:underline"
              >
                {t('rd.bell.browserOn')}
              </button>
            )}
            {radar.notes.length > 0 && (
              <button type="button" onClick={clearRadarNotes} className="ml-auto text-[#E5E7EB]/60 hover:text-white">
                {t('rd.bell.clear')}
              </button>
            )}
          </div>
          {msg && <p className="text-[#E5E7EB]/70">{msg}</p>}
          {settings.muted.length > 0 && <p className="text-[#E5E7EB]/50">{t('rd.bell.mutedCount').replace('{count}', String(settings.muted.length))}</p>}
        </div>
      )}
      {radar.toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 w-80 max-w-[90vw]" role="status" aria-live="polite">
          {radar.toasts.map((t) => (
            <div key={t.id} className="flex items-start gap-2 bg-[var(--surface)] border border-[#3B82F6]/50 rounded-xl shadow-xl p-3 text-xs text-white">
              <button type="button" onClick={goRadar} className="flex-1 text-left">
                {t.text}
              </button>
              <button type="button" onClick={() => dismissToast(t.id)} aria-label="Đóng thông báo" className="text-[#E5E7EB]/60 hover:text-white">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
