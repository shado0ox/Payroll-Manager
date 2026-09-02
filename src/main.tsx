import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';
import { initRuntimeProtection } from './utils/security';
import { initUiNormalization } from './utils/uiNormalization';

// Initialize Security & Integrity Layer
initRuntimeProtection();
initUiNormalization();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider><App /></LanguageProvider>
  </StrictMode>,
);

// Keep PWA support isolated from development/AI Studio previews.
// The worker never caches API requests or authentication responses.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
  });
}
