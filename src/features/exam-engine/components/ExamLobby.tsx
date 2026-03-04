// ============================================================
// ExamLobby — Student entry point. Enter code + name, join exam.
// ============================================================

import { useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound, User, ArrowRight, Loader2, WifiOff, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../../core/lib/serverApi';
import { setCachedExam, getCachedExam, saveExamCodeMap, getExamIdFromCode } from '../../../core/db/ExuLocalDB';
import { useExamStore } from '../store/examStore';
import { initExamSession } from '../hooks/useResilientTimer';
import { generateExamCode } from '../../../core/lib/crypto';
import { LanguageToggle } from '../../../shared/components/LanguageToggle';
import type { Exam, Question } from '../../../core/types/database.types';
import type { CachedExam } from '../../../core/types/local.types';

export function ExamLobby(): JSX.Element {
  const { t, i18n } = useTranslation();
  const initExam = useExamStore((s) => s.initExam);

  const [examCode, setExamCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = navigator.onLine;

  const handleJoin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const normalizedCode = examCode.trim().toUpperCase();

    try {
      let cachedBundle: CachedExam | null = null;

      // 1. Try to fetch fresh data from server
      if (isOnline) {
        const { data, error: apiError } = await apiRequest<{ exam: Exam; questions: Question[] }>(
          `/exams/code/${normalizedCode}`,
        );

        if (!apiError && data) {
          await setCachedExam(data.exam, data.questions);
          cachedBundle = await getCachedExam(data.exam.id);

          // Save code→id mapping for future offline access
          const generatedCode = generateExamCode(data.exam.id);
          await saveExamCodeMap(
            generatedCode,
            data.exam.id,
            data.exam.title.es,
            data.exam.title.en,
            data.exam.duration_minutes,
          );
        } else {
          console.warn('[ExamLobby] API unavailable, trying local cache');
        }
      }

      // 2. If offline or API failed, try the code map to find exam ID
      if (!cachedBundle) {
        const codeMapEntry = await getExamIdFromCode(normalizedCode);

        if (codeMapEntry) {
          // We have the exam ID — try to load from IndexedDB cache
          cachedBundle = await getCachedExam(codeMapEntry.exam_id);

          if (!cachedBundle) {
            setError(
              `Offline: Se encontró el examen "${codeMapEntry.title_es}" pero el contenido no está en caché. ` +
              `Necesitas conectarte al menos una vez para descargar las preguntas.`
            );
            return;
          }
        } else if (!isOnline) {
          setError('Sin conexión: El examen debe descargarse antes de ir offline. Conéctate e intenta de nuevo.');
          return;
        } else {
          setError(t('exam.not_found'));
          return;
        }
      }

      // 3. Init or recover the exam session
      const studentId = `student_${studentName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      const session = await initExamSession(
        cachedBundle.exam.id,
        studentId,
        studentName.trim(),
        i18n.language as 'es' | 'en',
      );

      initExam(cachedBundle, session);
    } catch (err) {
      console.error('[ExamLobby] Join failed:', err);
      setError(t('exam.not_found'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-3">
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          isOnline ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
        }`}>
          {isOnline
            ? <><Wifi className="size-3" /> {t('connectivity.online')}</>
            : <><WifiOff className="size-3" /> {t('connectivity.offline')}</>
          }
        </div>
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/30">
            <span className="text-3xl font-black text-white">E</span>
          </div>
          <h1 className="text-4xl font-black text-white">Exu</h1>
          <p className="mt-1 text-sm text-white/40">{t('app.tagline')}</p>
        </div>

        <form
          onSubmit={handleJoin}
          className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
        >
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
              {t('exam.enter_name')}
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20">
              <User className="size-4 shrink-0 text-white/30" />
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Ana García"
                required
                minLength={2}
                className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
              />
            </div>
          </div>

          {/* Exam Code */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
              {t('exam.enter_code')}
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20">
              <KeyRound className="size-4 shrink-0 text-white/30" />
              <input
                type="text"
                value={examCode}
                onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                placeholder="EXU-4F2A"
                required
                maxLength={8}
                className="flex-1 bg-transparent font-mono text-sm uppercase tracking-widest text-white placeholder-white/20 outline-none"
              />
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={isLoading || !studentName.trim() || !examCode.trim()}
            whileTap={{ scale: 0.98 }}
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-opacity disabled:opacity-50"
          >
            {isLoading ? (
              <><Loader2 className="size-4 animate-spin" />{t('exam.loading')}</>
            ) : (
              <><ArrowRight className="size-4" />{t('exam.join_exam')}</>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}