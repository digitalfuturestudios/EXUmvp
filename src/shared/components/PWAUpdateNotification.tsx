// ============================================================
// PWAUpdateNotification — Service Worker update banner.
//
// Shows a top banner when a new version of the app is available.
// User can apply the update (reload with new SW) or dismiss it.
//
// Mechanism: Listens for a 'waiting' Service Worker via usePWAUpdate.
// Posting SKIP_WAITING causes the new SW to take control, then
// the 'controllerchange' event triggers a page reload.
// ============================================================

import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePWAUpdate } from '../hooks/usePWA';

export function PWAUpdateNotification(): JSX.Element | null {
  const { t } = useTranslation();
  const { needsUpdate, applyUpdate, dismissUpdate } = usePWAUpdate();

  return (
    <AnimatePresence>
      {needsUpdate && (
        <motion.div
          key="pwa-update-banner"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 350 }}
          // Positioned below the ConnectivityBanner (which is also fixed top)
          className="fixed left-0 right-0 top-0 z-[60] flex items-center justify-center"
        >
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 border-b border-indigo-500/30 bg-indigo-600/95 px-4 py-2.5 backdrop-blur-xl sm:mx-4 sm:mt-3 sm:rounded-2xl sm:border sm:shadow-2xl sm:shadow-indigo-900/50">
            {/* Icon + text */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 rounded-lg bg-white/15 p-1.5">
                <Zap className="size-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {t('pwa.update_available', '¡Nueva versión disponible!')}
                </p>
                <p className="truncate text-xs text-indigo-200">
                  {t('pwa.update_desc', 'Actualiza ahora para obtener las últimas mejoras.')}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={applyUpdate}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
              >
                <RefreshCw className="size-3" />
                {t('pwa.update_btn', 'Actualizar')}
              </motion.button>

              <button
                onClick={dismissUpdate}
                className="rounded-lg p-1.5 text-indigo-200 hover:bg-white/10 hover:text-white transition-colors"
                title={t('pwa.dismiss', 'Descartar')}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
