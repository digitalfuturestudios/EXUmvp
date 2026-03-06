// ============================================================
// ExamEngine — Core exam-taking experience.
// Orchestrates: Guard + Timer + Questions + Submission.
// ============================================================

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Send, Maximize } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExamStore } from '../store/examStore';
import { useExuGuard } from '../hooks/useExuGuard';
import { useResilientTimer } from '../hooks/useResilientTimer';
import { useOfflineDelivery } from '../../offline-sync/hooks/useOfflineDelivery';
import { completeSession } from '../../../core/db/ExuLocalDB';
import { GuardOverlay } from './GuardOverlay';
import { TimerDisplay } from './TimerDisplay';
import { QuestionCard } from './QuestionCard';
import { QRDeliveryPanel } from '../../offline-sync/components/QRDeliveryPanel';
import type { AnswerRecord } from '../../../core/types/local.types';

export function ExamEngine(): JSX.Element {
  const { t } = useTranslation();
  const {
    cachedExam, session, currentQuestionIndex,
    isFinished, setCurrentQuestion, recordAnswer, setFinished, setSubmitting,
  } = useExamStore();

  const [showConfirm, setShowConfirm] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState(0);

  const { state: deliveryState, finishExam } = useOfflineDelivery();

  const guard = useExuGuard({
    examId: session?.exam_id ?? '',
    studentId: session?.student_id ?? '',
    onSuspended: () => handleSubmit(true),
    onStrike: (count) => {
      console.warn(`[ExamEngine] Strike ${count} issued`);
    },
  });

  const timerState = useResilientTimer({
    session,
    durationSeconds: (cachedExam?.exam.duration_minutes ?? 0) * 60,
    onExpire: () => handleSubmit(false),
    onAutoSave: (elapsed) => {
      console.debug(`[ExamEngine] Auto-save at ${elapsed}s`);
    },
  });

  const calculateScore = useCallback((): { score: number; earned: number; total: number } => {
    if (!cachedExam || !session) return { score: 0, earned: 0, total: 0 };

    let earned = 0;
    let total = 0;

    for (const question of cachedExam.questions) {
      total += question.points;
      const answer = session.answers[question.id];
      if (answer?.answer === question.correct_answer) {
        earned += question.points;
      }
    }

    const score = total > 0 ? Math.round((earned / total) * 100) : 0;
    return { score, earned, total };
  }, [cachedExam, session]);

  const handleSubmit = useCallback(async (forced: boolean = false): Promise<void> => {
    if (!session || !cachedExam) return;
    setSubmitting(true);
    setShowConfirm(false);

    try {
      const { score, earned, total } = calculateScore();
      setFinalScore(score);

      const payload = await finishExam({
        examId: session.exam_id,
        studentId: session.student_id,
        studentName: session.student_name,
        answers: session.answers as Record<string, AnswerRecord>,
        startTimestamp: session.start_timestamp,
        totalPoints: total,
        earnedPoints: earned,
        score,
      });

      await completeSession(session.exam_id, session.student_id);

      setQrPayload(payload);
      setFinished();

      if (forced) {
        console.info('[ExamEngine] Exam forcefully submitted due to guard suspension');
      }
    } catch (err) {
      console.error('[ExamEngine] Submission failed:', err);
      setSubmitting(false);
    }
  }, [session, cachedExam, calculateScore, finishExam, setSubmitting, setFinished]);

  if (!cachedExam || !session) return <></>;

  const questions = cachedExam.questions;
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // ─── Finished View ────────────────────────────────────────
  if (isFinished && qrPayload) {
    const passed = finalScore >= cachedExam.exam.passing_score;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg"
        >
          <div className={`mb-6 rounded-2xl border p-6 text-center ${
            passed
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}>
            <p className="text-5xl font-black text-white">{finalScore}%</p>
            <p className={`mt-1 text-lg font-semibold ${passed ? 'text-emerald-300' : 'text-red-400'}`}>
              {passed ? t('exam.passed') : t('exam.failed')}
            </p>
            <p className="mt-1 text-sm text-white/40">
              {t('exam.required_score')}: {cachedExam.exam.passing_score}%
            </p>
          </div>

          <QRDeliveryPanel
            payload={qrPayload}
            studentName={session.student_name}
            score={finalScore}
            deliveryState={deliveryState}
          />
        </motion.div>
      </div>
    );
  }

  // ─── Active Exam View ─────────────────────────────────────
  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      <GuardOverlay guard={guard} />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 bg-black/20 px-6 py-4 backdrop-blur-md">
        <div>
          <h1 className="font-semibold text-white">
            {cachedExam.exam.title[session.language] || cachedExam.exam.title.en}
          </h1>
          <p className="text-xs text-white/40">{session.student_name}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Fullscreen button — en el header, nunca tapa el footer */}
          {!guard.isFullscreen && guard.status === 'active' && (
            <button
              onClick={guard.requestFullscreen}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-900/60 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-800/80"
            >
              <Maximize className="size-3.5" />
              {t('guard.fullscreen_enter')}
            </button>
          )}

          <div className="flex gap-1">
            {Array.from({ length: guard.maxStrikes }).map((_, i) => (
              <div
                key={i}
                className={`size-2 rounded-full transition-colors ${
                  i < guard.strikes ? 'bg-red-500' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
          <TimerDisplay timerState={timerState} compact />
        </div>
      </header>

      {/* Progress bar — div estático con width dinámico via style */}
      <div className="h-0.5 bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
          style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Question area */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl py-8">
          <AnimatePresence mode="wait" initial={false}>
            <QuestionCard
              key={currentQuestion?.id}
              question={currentQuestion}
              questionNumber={currentQuestionIndex + 1}
              totalQuestions={totalQuestions}
              selectedAnswer={session.answers[currentQuestion?.id]?.answer}
              onAnswer={recordAnswer}
            />
          </AnimatePresence>
        </div>
      </main>

      {/* Navigation */}
      <footer className="border-t border-white/5 bg-black/20 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            onClick={() => setCurrentQuestion(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
            {t('exam.prev_question')}
          </button>

          {/* Question dots */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestion(i)}
                className={`size-2 rounded-full transition-all ${
                  i === currentQuestionIndex
                    ? 'scale-125 bg-indigo-400'
                    : session.answers[q.id]
                    ? 'bg-emerald-500/60'
                    : 'bg-white/20'
                }`}
              />
            ))}
          </div>

          {/* Botón siguiente/enviar — sin motion.button para compatibilidad Android */}
          {currentQuestionIndex < totalQuestions - 1 ? (
            <button
              onClick={() => setCurrentQuestion(currentQuestionIndex + 1)}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/20 active:scale-95"
            >
              {t('exam.next_question')}
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 active:scale-95 transition-transform"
            >
              <Send className="size-4" />
              {t('exam.submit')}
            </button>
          )}
        </div>
      </footer>

      {/* Confirm submit modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            key="confirm-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <motion.div
              key="confirm-modal-inner"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-8"
            >
              <h3 className="mb-2 text-lg font-bold text-white">{t('exam.confirm_submit')}</h3>
              <p className="mb-6 text-sm text-white/60">{t('exam.confirm_submit_desc')}</p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5"
                >
                  {t('exam.cancel')}
                </button>
                <button
                  onClick={() => handleSubmit(false)}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  {t('exam.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}