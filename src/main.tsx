import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { OfflineBanner } from './components/common/OfflineBanner.tsx';
import { UpdateToast } from './components/common/UpdateToast.tsx';
import './index.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registerSw = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const notify = (w: ServiceWorker | null) => {
          // Prompt only when an older worker already controls the page (not on first install).
          if (w && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('ctap:sw-update', { detail: w }));
          }
        };
        notify(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed') notify(w);
          });
        });
      })
      .catch(() => {
        // Silently fail — SW registration is progressive enhancement
      });
    // Reload on takeover only when upgrading an existing worker (not on first install).
    let reloading = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || !hadController) return;
      reloading = true;
      window.location.reload();
    });
  };
  // The bundle may execute after window 'load' already fired.
  if (document.readyState === 'complete') registerSw();
  else window.addEventListener('load', registerSw);
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <OfflineBanner />
    <UpdateToast />
  </>
);
