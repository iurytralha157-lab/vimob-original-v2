console.log('[App] Starting main.tsx...');
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload when a stale chunk fails to load (after a new deploy)
const handleChunkError = (event: Event | PromiseRejectionEvent) => {
  const message =
    'reason' in event
      ? String((event as PromiseRejectionEvent).reason?.message || '')
      : String((event as ErrorEvent).message || '');

  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    const key = 'lovable_chunk_reload_at';
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }
};
window.addEventListener('error', handleChunkError);
window.addEventListener('unhandledrejection', handleChunkError);

// Aggressive version management and cache busting
const CACHE_BUST_VERSION = '2.1.5-refreshfix-20260606';
const BUST_KEY = 'lovable_app_version';
const BUST_RELOAD_KEY = 'lovable_app_version_reload_at';

async function cleanupServiceWorkers(reload = false) {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        await Promise.all(registrations.map(async (registration) => {
          registration.active?.postMessage({ type: 'CLEAR_CACHES' });
          await registration.update();
        }));
        console.log('Service Workers updated');
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      if (keys.length > 0) {
        await Promise.all(keys.map(k => caches.delete(k)));
        console.log('All Caches cleared');
      }
    }
    
    if (reload) {
      const lastReload = Number(sessionStorage.getItem(BUST_RELOAD_KEY) || 0);
      if (Date.now() - lastReload < 10000) {
        console.warn('[VersionCheck] Reload skipped to avoid a refresh loop');
        return;
      }
      sessionStorage.setItem(BUST_RELOAD_KEY, String(Date.now()));

      const url = new URL(window.location.href);
      url.searchParams.set('v_refresh', CACHE_BUST_VERSION);
      window.location.replace(url.toString());
    }
  } catch (e) {
    console.warn('Cleanup failed', e);
  }
}

// Background version checker
async function checkSystemVersion() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    
    const data = await response.json();
    const currentVersion = localStorage.getItem(BUST_KEY);
    
    if (currentVersion && data.version && currentVersion !== data.version) {
      console.log(`[VersionCheck] New version found: ${data.version}. Updating...`);
      localStorage.setItem(BUST_KEY, data.version);
      await cleanupServiceWorkers(true);
    }
  } catch (err) {
    console.warn('[VersionCheck] Background check failed', err);
  }
}

// Check version on load and then every 5 minutes
const currentVersion = localStorage.getItem(BUST_KEY);
if (currentVersion !== CACHE_BUST_VERSION) {
  localStorage.setItem(BUST_KEY, CACHE_BUST_VERSION);
  cleanupServiceWorkers(currentVersion !== null);
}

// Set up periodic check
setInterval(checkSystemVersion, 1000 * 60 * 5);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);
        registration.update();

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          installingWorker?.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Service Worker is push-only and does not cache app shell/assets.
