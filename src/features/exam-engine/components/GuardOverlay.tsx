import { AnimatePresence, motion } from 'motion/react';
import { ShieldAlert, Maximize, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExuGuardState } from '../hooks/useExuGuard';

interface GuardOverlayProps {
  guard: ExuGuardState;
}

export function GuardOverlay({ guard }: GuardOverlayProps): JSX.Element {
  const { t } = useTranslation();
  const showOverlay = guard.status === 'blocked' || guard.status === 'suspended';

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          key="guard-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
        >
          {guard.status === 'suspended' ? (
            <SuspendedView strikes={guard.strikes} maxStrikes={guard.maxStrikes} />
          ) : (
            <BlockedView
              secondsRemaining={guard.blockSecondsRemaining}
              strikes={guard.strikes}
              maxStrikes={guard.maxStrikes}
              isFullscreen={guard.isFullscreen}
              requestFullscreen={guard.requestFullscreen}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface BlockedViewProps {
  secondsRemaining: number;
  strikes: number;
  maxStrikes: number;
  isFullscreen: boolean;
  requestFullscreen: () => Promise<void>;
}

function BlockedView({
  secondsRemaining, strikes, maxStrikes, isFullscreen, requestFullscreen,
}: BlockedViewProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex max-w-md flex-col items-center gap-6 rounded-2xl border border-amber-500/30 bg-amber-950/80 p-10 text-center shadow-2xl">
      <div className="rounded-full bg-amber-500/20 p-4">
        <ShieldAlert className="size-12 text-amber-400" />
      </div>
      <div>
        <h2 className="mb-2 text-xl font-bold text-amber-300">
          {t('guard.strike_warning')}
        </h2>
        <p className="text-sm text-amber-200/70">
          {t('guard.strike_count', { count: strikes, max: maxStrikes })}
        </p>
      </div>
      <p className="text-sm text-white/60">{t('guard.blocked_message')}</p>
      <div className="flex size-20 items-center justify-center rounded-full border-4 border-amber-500 bg-amber-900/50">
        <span className="text-3xl font-bold tabular-nums text-amber-300">
          {secondsRemaining}
        </span>
      </div>
      <p className="text-xs text-white/40">
        {t('guard.blocked_duration', { seconds: secondsRemaining })}
      </p>
      {!isFullscreen && (
        <button
          onClick={requestFullscreen}
          className="mt-2 flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:scale-95"
        >
          <Maximize className="size-4" />
          {t('guard.fullscreen_enter')}
        </button>
      )}
    </div>
  );
}

function SuspendedView({ strikes, maxStrikes }: { strikes: number; maxStrikes: number }): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex max-w-md flex-col items-center gap-6 rounded-2xl border border-red-500/30 bg-red-950/80 p-10 text-center shadow-2xl">
      <div className="rounded-full bg-red-500/20 p-4">
        <AlertTriangle className="size-12 text-red-400" />
      </div>
      <div>
        <h2 className="mb-2 text-2xl font-bold text-red-300">
          {t('guard.max_strikes')}
        </h2>
        <p className="text-sm text-red-200/70">
          {t('guard.strike_count', { count: strikes, max: maxStrikes })}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-white/60">
        Your exam has been automatically submitted with your current answers.
        Please contact your teacher for assistance.
      </p>
    </div>
  );
}