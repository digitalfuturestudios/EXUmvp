// ============================================================
// usePWA — Progressive Web App hooks
//
// Exports two hooks:
//   usePWAInstall — Captures the beforeinstallprompt event and
//                   exposes a trigger to show the native install dialog.
//
//   usePWAUpdate  — Listens for a waiting Service Worker and exposes
//                   a function to skip waiting + reload to apply the update.
//
// Design:
//   - No dependency on vite-plugin-pwa's virtual module (more portable).
//   - Both hooks clean up their event listeners on unmount.
//   - usePWAInstall detects standalone mode to hide the banner when
//     the app is already installed.
// ============================================================

import { useEffect, useState, useCallback } from 'react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// ─────────────────────────────────────────────
// usePWAInstall
// ─────────────────────────────────────────────

export interface PWAInstallState {
  /** True when the install prompt is available and app is not yet installed */
  canInstall: boolean;
  /** True if the app is already running in standalone/fullscreen mode */
  isInstalled: boolean;
  /** Call this to show the native install dialog */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    // Check if already running as PWA
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as any).standalone === true
    );
  });

  useEffect(() => {
    // Listen for the install prompt
    const handleBeforeInstall = (e: Event): void => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Listen for successful installation
    const handleAppInstalled = (): void => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.info('[PWA] App installed successfully');
    };

    // Listen for display mode changes (e.g., user installs while app is open)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent): void => {
      if (e.matches) setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      console.info(`[PWA] Install prompt outcome: ${outcome}`);
      return outcome;
    } catch (err) {
      console.error('[PWA] Install prompt error:', err);
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    canInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    promptInstall,
  };
}

// ─────────────────────────────────────────────
// usePWAUpdate
// ─────────────────────────────────────────────

export interface PWAUpdateState {
  /** True when a new Service Worker is waiting to activate */
  needsUpdate: boolean;
  /** Call this to skip waiting and reload with the new SW */
  applyUpdate: () => void;
  /** Dismiss the update notification (won't apply update) */
  dismissUpdate: () => void;
}

export function usePWAUpdate(): PWAUpdateState {
  const [needsUpdate, setNeedsUpdate] = useState<boolean>(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForWaitingWorker = (registration: ServiceWorkerRegistration): void => {
      // Already a waiting worker when we check
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setNeedsUpdate(true);
        return;
      }

      // Watch for a new worker installing
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          // New SW is installed and waiting — prompt user
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setNeedsUpdate(true);
            console.info('[PWA] New service worker waiting — update available');
          }
        });
      });
    };

    // Check current registration
    navigator.serviceWorker.ready.then(checkForWaitingWorker).catch((err) => {
      console.warn('[PWA] Service worker ready failed:', err);
    });

    // Also listen for controller change (another tab already skipped waiting)
    let refreshing = false;
    const handleControllerChange = (): void => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback((): void => {
    if (!waitingWorker) return;

    // Tell the waiting SW to skip waiting and take control
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    setNeedsUpdate(false);
    // The page will reload via the 'controllerchange' listener above
  }, [waitingWorker]);

  const dismissUpdate = useCallback((): void => {
    setNeedsUpdate(false);
  }, []);

  return { needsUpdate, applyUpdate, dismissUpdate };
}

// ─────────────────────────────────────────────
// UTILITY: Check if app is running as PWA
// ─────────────────────────────────────────────

export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

// ─────────────────────────────────────────────
// UTILITY: Check if device is iOS (for custom install instructions)
// ─────────────────────────────────────────────

export function isIOS(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /mac/i.test(navigator.userAgent))
  );
}
