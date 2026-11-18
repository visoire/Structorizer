import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureLocale } from './i18n';
import { usePrefs } from './store/prefsStore';
import { App } from './ui/App';
import './styles.css';

void ensureLocale(usePrefs.getState().lang).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
