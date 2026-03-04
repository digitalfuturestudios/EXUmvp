// ============================================================
// useConnectivity — Network Status Monitor
// Tracks online/offline state and fires callbacks on changes.
// ============================================================

import { useEffect, useState, useCallback } from 'react';

export interface ConnectivityState {
  isOnline: boolean;
  wasOffline: boolean; // True if connection was just restored
}

interface UseConnectivityOptions {
  onOnline?: () => void;
  onOffline?: () => void;
}

export function useConnectivity(options: UseConnectivityOptions = {}): ConnectivityState {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [wasOffline, setWasOffline] = useState<boolean>(false);

  const { onOnline, onOffline } = options;

  const handleOnline = useCallback((): void => {
    setIsOnline(true);
    setWasOffline(true);
    onOnline?.();
    // Reset wasOffline after a short delay so consumers can show a banner
    setTimeout(() => setWasOffline(false), 4000);
  }, [onOnline]);

  const handleOffline = useCallback((): void => {
    setIsOnline(false);
    setWasOffline(false);
    onOffline?.();
  }, [onOffline]);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline };
}
