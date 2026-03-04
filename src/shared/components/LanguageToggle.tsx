// ============================================================
// LanguageToggle — ES/EN switcher. Works 100% offline.
// ============================================================

import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';

interface LanguageToggleProps {
  className?: string;
}

export function LanguageToggle({ className = '' }: LanguageToggleProps): JSX.Element {
  const { i18n } = useTranslation();
  const isSpanish = i18n.language === 'es';

  const toggleLanguage = (): void => {
    i18n.changeLanguage(isSpanish ? 'en' : 'es');
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={toggleLanguage}
      className={`relative flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 ${className}`}
      aria-label="Toggle language"
    >
      <span className={isSpanish ? 'text-white' : 'text-white/50'}>ES</span>
      <span className="text-white/30">|</span>
      <span className={!isSpanish ? 'text-white' : 'text-white/50'}>EN</span>
    </motion.button>
  );
}
