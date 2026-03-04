// ============================================================
// PWAInstallBanner — "Agregar a pantalla de inicio" prompt.
//
// Shows a bottom-slide-in banner when:
//   - The app is not yet installed (not running in standalone mode)
//   - The browser supports beforeinstallprompt (Chrome/Edge/Android)
//   OR
//   - The device is iOS (shows manual Safari instructions instead)
//
// Dismisses permanently for 7 days via localStorage.
// ============================================================

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X, Share, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePWAInstall, isIOS, isPWA } from '../hooks/usePWA';

const DISMISS_KEY = 'exu_pwa_install_dismissed_until';
const DISMISS_DURATION_DAYS = 7;

export function PWAInstallBanner(): JSX.Element | null {
  const { t } = useTranslation();
  const { canInstall, promptInstall } = usePWAInstall();
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  const isIOSDevice = isIOS();

  // Determine visibility on mount
  useEffect(() => {
    // Already installed as PWA → never show
    if (isPWA()) return;

    // Check if user dismissed recently
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

    // Show for iOS always (since beforeinstallprompt doesn't fire on Safari)
    if (isIOSDevice) {
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isIOSDevice]);

  // Show when install prompt becomes available
  useEffect(() => {
    if (canInstall) {
      const dismissedUntil = localStorage.getItem(DISMISS_KEY);
      if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

      const timer = setTimeout(() => setIsVisible(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [canInstall]);

  const handleDismiss = (): void => {
    const until = Date.now() + DISMISS_DURATION_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setIsVisible(false);
    setShowIOSGuide(false);
  };

  const handleInstall = async (): Promise<void> => {
    if (isIOSDevice) {
      setShowIOSGuide((prev) => !prev);
      return;
    }

    setIsInstalling(true);
    const outcome = await promptInstall();
    setIsInstalling(false);

    if (outcome === 'accepted') {
      setIsVisible(false);
    }
  };

  if (!isVisible && !canInstall) return null;
  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="pwa-install-banner"
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm sm:left-auto sm:right-6 sm:max-w-xs"
      >
        <div className="overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {/* Main banner */}
          <div className="flex items-start gap-3 p-4">
            {/* App icon */}
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
              <span className="text-xl font-black text-white">E</span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                {t('pwa.install_title', 'Instalar Exu')}
              </p>
              <p className="mt-0.5 text-xs text-white/50 leading-relaxed">
                {t('pwa.install_subtitle', 'Accede sin conexión, más rápido.')}
              </p>

              {/* Actions */}
              <div className="mt-3 flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                >
                  {isIOSDevice ? (
                    <>
                      <Share className="size-3" />
                      {t('pwa.ios_how', 'Cómo instalar')}
                    </>
                  ) : (
                    <>
                      <Download className="size-3" />
                      {isInstalling
                        ? t('pwa.installing', 'Instalando…')
                        : t('pwa.install_btn', 'Instalar')}
                    </>
                  )}
                </motion.button>

                <button
                  onClick={handleDismiss}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  {t('pwa.not_now', 'Ahora no')}
                </button>
              </div>
            </div>

            {/* Close */}
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-lg p-1 text-white/30 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* iOS Safari instructions — accordion */}
          <AnimatePresence>
            {showIOSGuide && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden border-t border-white/5"
              >
                <div className="px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-white/60 uppercase tracking-widest">
                    Safari iOS
                  </p>
                  {[
                    {
                      icon: <Share className="size-4 text-indigo-400" />,
                      text: t('pwa.ios_step1', 'Toca el botón Compartir (⎙) en Safari'),
                    },
                    {
                      icon: <Plus className="size-4 text-indigo-400" />,
                      text: t('pwa.ios_step2', 'Selecciona "Agregar a inicio"'),
                    },
                    {
                      icon: (
                        <span className="size-4 text-center text-xs font-bold text-indigo-400">✓</span>
                      ),
                      text: t('pwa.ios_step3', 'Confirma tocando "Agregar"'),
                    },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0">{step.icon}</div>
                      <p className="text-xs text-white/50">{step.text}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
