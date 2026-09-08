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

// An open browser can request an old lazy-loaded chunk just after a deployment.
// Reload once into the new build instead of leaving the user on a broken screen.
const FAILED_CHUNK_BUILD_KEY = 'masar_failed_chunk_build_v1';
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  if (sessionStorage.getItem(FAILED_CHUNK_BUILD_KEY) === __MASAR_BUILD_ID__) return;
  sessionStorage.setItem(FAILED_CHUNK_BUILD_KEY, __MASAR_BUILD_ID__);
  window.location.reload();
});

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
