// ============================================================
// ConnectivityBanner — Animated top banner for network status.
// ============================================================

import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectivity } from '../hooks/useConnectivity';

export function ConnectivityBanner(): JSX.Element | null {
  const { t } = useTranslation();
  const { isOnline, wasOffline } = useConnectivity();

  const showBanner = !isOnline || wasOffline;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key={isOnline ? 'online' : 'offline'}
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 text-sm font-medium ${
            isOnline
              ? 'bg-emerald-500 text-white'
              : 'bg-amber-500 text-white'
          }`}
        >
          {isOnline ? (
            <>
              <RefreshCw className="size-4 animate-spin" />
              <span>{t('connectivity.reconnected')}</span>
            </>
          ) : (
            <>
              <WifiOff className="size-4" />
              <span>{t('connectivity.offline')} — {t('exam.offline_desc')}</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
