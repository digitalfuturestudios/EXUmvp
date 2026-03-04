// ============================================================
// TimerDisplay — Resilient countdown timer UI component.
// Visually warns when time is low (< 5 min, < 1 min).
// ============================================================

import { motion, AnimatePresence } from 'motion/react';
import { Clock, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TimerState } from '../../../core/types/local.types';

interface TimerDisplayProps {
  timerState: TimerState;
  compact?: boolean;
}

type UrgencyLevel = 'normal' | 'warning' | 'critical' | 'expired';

function getUrgencyLevel(remainingSeconds: number): UrgencyLevel {
  if (remainingSeconds <= 0) return 'expired';
  if (remainingSeconds <= 60) return 'critical';
  if (remainingSeconds <= 300) return 'warning';
  return 'normal';
}

const urgencyStyles: Record<UrgencyLevel, string> = {
  normal:   'border-white/20 bg-white/5 text-white',
  warning:  'border-amber-500/50 bg-amber-500/10 text-amber-300',
  critical: 'border-red-500/50 bg-red-500/10 text-red-400',
  expired:  'border-red-600/50 bg-red-600/10 text-red-500',
};

export function TimerDisplay({ timerState, compact = false }: TimerDisplayProps): JSX.Element {
  const { t } = useTranslation();
  const urgency = getUrgencyLevel(timerState.remaining_seconds);
  const isCritical = urgency === 'critical' || urgency === 'expired';

  return (
    <motion.div
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 ${urgencyStyles[urgency]} transition-colors`}
      animate={isCritical ? { scale: [1, 1.03, 1] } : {}}
      transition={{ repeat: isCritical ? Infinity : 0, duration: 1.5 }}
    >
      {urgency === 'expired' ? (
        <AlertCircle className="size-4 shrink-0" />
      ) : (
        <Clock className="size-4 shrink-0" />
      )}

      <div className="flex flex-col">
        {!compact && (
          <span className="text-xs font-medium opacity-60">
            {t('exam.time_remaining')}
          </span>
        )}
        <AnimatePresence mode="wait">
          <motion.span
            key={timerState.formatted_remaining}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-xl font-bold tabular-nums leading-none"
          >
            {timerState.is_expired ? t('exam.time_expired') : timerState.formatted_remaining}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
