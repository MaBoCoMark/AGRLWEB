/**
 * src/utils/ServiceWorkerManager.js
 * PWA Service Worker Registration & Lifecycle Manager (Phase 7.7 Deobfuscation)
 *
 * Provides safe registration, status polling, and error recovery for the offline PWA cache.
 * Gracefully skips execution in non-secure or development contexts.
 *
 * Upstream deobfuscated symbols:
 * - lB -> waitForServiceWorkerActivation
 * - cB -> registerGameServiceWorker
 * - td -> DEFAULT_SW_SCOPE
 * - pm -> DEFAULT_SW_SCRIPT
 */

export const DEFAULT_SW_SCOPE = '/';
export const DEFAULT_SW_SCRIPT = `${DEFAULT_SW_SCOPE}game-sw.js`;

/**
 * Waits for a ServiceWorker instance to reach 'installed' or 'activated' state.
 * Rejects if the worker becomes 'redundant'.
 *
 * @param {ServiceWorker} worker
 * @returns {Promise<void>}
 */
export function waitForServiceWorkerActivation(worker) {
  if (!worker) return Promise.resolve();
  if (worker.state === 'activated' || worker.state === 'installed') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        worker.removeEventListener('statechange', onStateChange);
        resolve();
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onStateChange);
        reject(new Error('The complete game could not be downloaded. Check your connection and reload.'));
      }
    };
    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

/**
 * Registers the game PWA service worker if supported and running in a secure context.
 *
 * @param {string} [scope=DEFAULT_SW_SCOPE]
 * @param {string} [scriptUrl=DEFAULT_SW_SCRIPT]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerGameServiceWorker(scope = DEFAULT_SW_SCOPE, scriptUrl = DEFAULT_SW_SCRIPT) {
  if (typeof window === 'undefined') return null;

  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) {
    console.log('[App] Service Worker skipped: running in development or insecure context.');
    return null;
  }

  const handleMessage = (event) => {
    if (event?.data?.kind) {
      // Optional message handler for future cache updates
    }
  };
  navigator.serviceWorker.addEventListener('message', handleMessage);

  try {
    const existingReg = await navigator.serviceWorker.getRegistration(scope);
    const registration = (existingReg?.active && !navigator.onLine)
      ? existingReg
      : await navigator.serviceWorker.register(scriptUrl, {
          scope,
          updateViaCache: 'none'
        }).catch((err) => {
          if (existingReg?.active) return existingReg;
          console.warn('[App] Service Worker registration skipped:', err.message);
          return null;
        });

    if (!registration) return null;

    if (registration.installing) {
      try {
        await waitForServiceWorkerActivation(registration.installing);
      } catch (err) {
        if (!registration.active) return null;
      }
    }

    await navigator.serviceWorker.ready;
    return registration;
  } catch (swErr) {
    console.warn('[App] Service Worker registration skipped:', swErr.message);
    return null;
  }
}

// Backward-compatibility aliases
export {
  waitForServiceWorkerActivation as lB,
  registerGameServiceWorker as cB,
  DEFAULT_SW_SCOPE as td,
  DEFAULT_SW_SCRIPT as pm
};
