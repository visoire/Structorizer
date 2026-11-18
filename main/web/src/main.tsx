import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureLocale } from './i18n';
import { usePrefs } from './store/prefsStore';
import { App } from './ui/App';
import './styles.css';

declare const __SINGLE_FILE__: boolean;
const IS_SINGLE = typeof __SINGLE_FILE__ === 'boolean' && __SINGLE_FILE__;

if (!IS_SINGLE && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* ignore on file:// or insecure LAN */ });
  });
}

void ensureLocale(usePrefs.getState().lang).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
