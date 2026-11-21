import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { OfflineBanner } from './components/common/OfflineBanner.tsx';
import './index.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silently fail — SW registration is progressive enhancement
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <OfflineBanner />
  </>
);
