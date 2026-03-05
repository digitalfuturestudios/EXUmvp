// ============================================================
// CreateExamModal — Modal para crear exámenes.
// - Inglés es OPCIONAL: si se deja vacío, se usa el español.
// - Validación solo requiere contenido en español.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, PlusCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../../core/lib/serverApi';
import { useAuthStore } from '../../auth/store/authStore';
import type { ExamInsert, QuestionInsert, QuestionType } from '../../../core/types/database.types';

interface CreateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DraftQuestion {
  id: string;
  content_es: string;
  content_en: string;
  type: QuestionType;
  correct_answer: string;
  options_es: string[];
  options_en: string[];
  points: number;
}

export function CreateExamModal({ isOpen, onClose }: CreateExamModalProps): JSX.Element {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const [titleEs, setTitleEs] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [duration, setDuration] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [questions, setQuestions] = useState<DraftQuestion[]>([createEmptyQuestion()]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('No authenticated teacher');

      // Si no hay traducción EN, usar el español como fallback
      const examPayload: ExamInsert = {
        teacher_id: profile.id,
        title: {
          es: titleEs.trim(),
          en: titleEn.trim() || titleEs.trim(),
        },
        description: null,
        duration_minutes: duration,
        passing_score: passingScore,
        is_active: false,
        allow_offline: true,
      };

      const { data: exam, error: examError } = await apiRequest<{ id: string }>(
        '/exams',
        { method: 'POST', body: examPayload, requiresAuth: true },
      );

      if (examError || !exam) throw new Error(examError ?? 'Exam creation failed');

      // Crear preguntas — EN es opcional, fallback a ES
      await Promise.all(
        questions.map((q, i) => {
          const questionPayload: QuestionInsert = {
            exam_id: exam.id,
            content: {
              es: q.content_es.trim(),
              en: q.content_en.trim() || q.content_es.trim(),
            },
            type: q.type,
            options: q.type === 'multiple_choice'
              ? q.options_es.map((label, idx) => ({
                  id: `opt_${idx}`,
                  label: {
                    es: label,
                    en: q.options_en[idx]?.trim() || label, // fallback a ES
                  },
                }))
              : null,
            correct_answer: q.correct_answer,
            points: q.points,
            order_index: i,
          };

          return apiRequest('/questions', {
            method: 'POST',
            body: questionPayload,
            requiresAuth: true,
          });
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-exams'] });
      onClose();
      resetForm();
    },
    onError: (err) => {
      console.error('[CreateExamModal] Create failed:', err);
    },
  });

  const resetForm = (): void => {
    setTitleEs('');
    setTitleEn('');
    setDuration(30);
    setPassingScore(60);
    setQuestions([createEmptyQuestion()]);
  };

  const addQuestion = (): void => {
    setQuestions((prev) => [...prev, createEmptyQuestion()]);
  };

  const removeQuestion = (id: string): void => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<DraftQuestion>): void => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  };

  // Validación: solo español es obligatorio
  const isValid =
    titleEs.trim().length > 0 &&
    questions.length > 0 &&
    questions.every((q) => q.content_es.trim().length > 0 && q.correct_answer.trim().length > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="create-exam-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative my-8 w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-2xl"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">{t('dashboard.create_exam')}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-6">
              {/* Títulos — EN opcional */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Título (ES) *">
                  <input
                    type="text"
                    value={titleEs}
                    onChange={(e) => setTitleEs(e.target.value)}
                    placeholder="Matemáticas Básicas"
                    className={inputClass}
                  />
                </Field>
                <Field label="Title (EN) — opcional">
                  <input
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                    placeholder="Basic Mathematics"
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Settings */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t('dashboard.duration')} (min)`}>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Passing score (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={passingScore}
                    onChange={(e) => setPassingScore(Number(e.target.value))}
                    className={inputClass}
                  />
                </Field>
              </div>

              {/* Questions */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-white/70">
                    Questions ({questions.length})
                  </p>
                  <button
                    onClick={addQuestion}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                  >
                    <Plus className="size-3" />
                    Add question
                  </button>
                </div>

                <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
                  {questions.map((q, i) => (
                    <QuestionDraftCard
                      key={q.id}
                      question={q}
                      index={i}
                      onUpdate={(updates) => updateQuestion(q.id, updates)}
                      onRemove={() => removeQuestion(q.id)}
                      canRemove={questions.length > 1}
                    />
                  ))}
                </div>
              </div>

              {/* Error message */}
              {createMutation.isError && (
                <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  Error al crear el examen. Intenta de nuevo.
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/60 hover:bg-white/5"
                >
                  {t('exam.cancel')}
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!isValid || createMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-50 hover:bg-indigo-500"
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="size-4 animate-spin" /> Creando...</>
                  ) : (
                    <><PlusCircle className="size-4" /> {t('dashboard.create_exam')}</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20';

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-widest text-white/40">
        {label}
      </label>
      {children}
    </div>
  );
}

interface QuestionDraftCardProps {
  question: DraftQuestion;
  index: number;
  onUpdate: (updates: Partial<DraftQuestion>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function QuestionDraftCard({ question, index, onUpdate, onRemove, canRemove }: QuestionDraftCardProps): JSX.Element {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold text-indigo-400">Q{index + 1}</span>
        <div className="flex items-center gap-2">
          <select
            value={question.type}
            onChange={(e) => onUpdate({ type: e.target.value as QuestionType, correct_answer: '' })}
            className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white outline-none"
          >
            <option value="multiple_choice">Multiple Choice</option>
            <option value="true_false">True / False</option>
            <option value="short_answer">Short Answer</option>
          </select>
          {canRemove && (
            <button onClick={onRemove} className="rounded p-1 text-white/30 hover:text-red-400">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Pregunta — ES obligatorio, EN opcional */}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={question.content_es}
          onChange={(e) => onUpdate({ content_es: e.target.value })}
          placeholder="Pregunta (ES) *"
          className={`${inputClass} text-xs`}
        />
        <input
          type="text"
          value={question.content_en}
          onChange={(e) => onUpdate({ content_en: e.target.value })}
          placeholder="Question (EN) — opcional"
          className={`${inputClass} text-xs opacity-60 focus:opacity-100`}
        />
      </div>

      <div className="mt-2">
        {question.type === 'true_false' ? (
          <div className="flex gap-2">
            {['true', 'false'].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => onUpdate({ correct_answer: val })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize transition-all ${
                  question.correct_answer === val
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : 'border-white/10 text-white/40 hover:border-white/30'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        ) : question.type === 'short_answer' ? (
          <input
            type="text"
            value={question.correct_answer}
            onChange={(e) => onUpdate({ correct_answer: e.target.value })}
            placeholder="Respuesta correcta *"
            className={`${inputClass} mt-1 text-xs`}
          />
        ) : (
          // Multiple choice — opciones ES obligatorio, EN opcional
          <div className="mt-2 flex flex-col gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdate({ correct_answer: `opt_${i}` })}
                  className={`size-4 shrink-0 rounded-full border-2 transition-colors ${
                    question.correct_answer === `opt_${i}`
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-white/30'
                  }`}
                />
                <input
                  type="text"
                  value={question.options_es[i] ?? ''}
                  onChange={(e) => {
                    const opts = [...question.options_es];
                    opts[i] = e.target.value;
                    onUpdate({ options_es: opts });
                  }}
                  placeholder={`Opción ${i + 1} *`}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-white/20 outline-none focus:border-indigo-500/50"
                />
                <input
                  type="text"
                  value={question.options_en[i] ?? ''}
                  onChange={(e) => {
                    const opts = [...question.options_en];
                    opts[i] = e.target.value;
                    onUpdate({ options_en: opts });
                  }}
                  placeholder={`Option ${i + 1} (EN)`}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/40 placeholder-white/15 outline-none focus:border-indigo-500/30 focus:text-white"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function createEmptyQuestion(): DraftQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    content_es: '',
    content_en: '',
    type: 'multiple_choice',
    correct_answer: '',
    options_es: ['', '', '', ''],
    options_en: ['', '', '', ''],
    points: 1,
  };
}