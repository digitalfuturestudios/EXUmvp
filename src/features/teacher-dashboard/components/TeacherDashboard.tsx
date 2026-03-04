// ============================================================
// TeacherDashboard — Exam management panel for teachers.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlusCircle, BookOpen, BarChart3, LogOut, Copy, Check,
  Users, Clock, ToggleLeft, ToggleRight, Loader2,
  Trash2, ScanLine, AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store/authStore';
import { supabase } from '../../../core/lib/supabaseClient';
import { apiRequest } from '../../../core/lib/serverApi';
import { generateExamCode } from '../../../core/lib/crypto';
import { LanguageToggle } from '../../../shared/components/LanguageToggle';
import { CreateExamModal } from './CreateExamModal';
import { ResultsView } from './ResultsView';
import { QRDecoderModal } from './QRDecoderModal';
import type { Exam } from '../../../core/types/database.types';

interface ExamWithCount extends Exam {
  question_count?: number;
  result_count?: number;
}

type DashboardTab = 'exams' | 'results';

interface QRDecoderState {
  isOpen: boolean;
  payload: string;
  examId: string;
}

export function TeacherDashboard(): JSX.Element {
  const { t } = useTranslation();
  // Selectors separados — NO objeto inline, evita infinite loop en Zustand
  const profile = useAuthStore((s) => s.profile);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DashboardTab>('exams');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [qrDecoder, setQrDecoder] = useState<QRDecoderState>({
    isOpen: false,
    payload: '',
    examId: '',
  });

  // ─── Fetch exams ──────────────────────────────────────────
  // Only fires when BOTH profile.id AND accessToken are available.
  // This prevents the 401 on first render after a page reload.
  const { data: exams = [], isLoading, error: examsError } = useQuery<ExamWithCount[]>({
    queryKey: ['teacher-exams', profile?.id],
    queryFn: async () => {
      const { data, error } = await apiRequest<ExamWithCount[]>(
        `/exams?teacher_id=${profile?.id}`,
        { requiresAuth: true },
      );
      if (error) throw new Error(`Failed to load exams: ${error}`);
      return data ?? [];
    },
    enabled: Boolean(profile?.id) && Boolean(accessToken), // ← KEY FIX
    staleTime: 30_000,
    retry: 1,           // max 1 retry to prevent infinite loop
    retryDelay: 2_000,
  });

  // ─── Toggle active ────────────────────────────────────────
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ examId, isActive }: { examId: string; isActive: boolean }) => {
      const { error } = await apiRequest(`/exams/${examId}`, {
        method: 'PATCH',
        body: { is_active: !isActive },
        requiresAuth: true,
      });
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-exams'] });
    },
  });

  // ─── Delete exam ──────────────────────────────────────────
  const deleteExamMutation = useMutation({
    mutationFn: async (examId: string) => {
      const { error } = await apiRequest(`/exams/${examId}`, {
        method: 'DELETE',
        requiresAuth: true,
      });
      if (error) throw new Error(`Delete failed: ${error}`);
    },
    onSuccess: () => {
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['teacher-exams'] });
    },
    onError: (err) => {
      console.error('[TeacherDashboard] Delete exam error:', err);
      setDeleteConfirmId(null);
    },
  });

  // ─── Sign out ─────────────────────────────────────────────
  const handleSignOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    clearSession();
  };

  // ─── Copy exam code ───────────────────────────────────────
  const copyCode = async (examId: string): Promise<void> => {
    const code = generateExamCode(examId);
    await navigator.clipboard.writeText(code);
    setCopiedCode(examId);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ─── QR Decoder ───────────────────────────────────────────
  const openQRDecoder = (payload: string = '', examId: string = ''): void => {
    setQrDecoder({ isOpen: true, payload, examId });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
              <span className="text-lg font-black text-white">E</span>
            </div>
            <div>
              <h1 className="font-bold text-white">Exu</h1>
              <p className="text-xs text-white/40">{t('dashboard.title')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />

            {/* QR Decoder button */}
            <button
              onClick={() => openQRDecoder()}
              title="Decode QR result"
              className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
            >
              <ScanLine className="size-4" />
              <span className="hidden sm:inline">Decode QR</span>
            </button>

            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:flex">
              <div className="size-6 rounded-full bg-indigo-600 text-center text-xs font-bold leading-6 text-white">
                {profile?.full_name?.[0]?.toUpperCase() ?? 'T'}
              </div>
              <span className="text-sm text-white/70">{profile?.full_name}</span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/50 transition-colors hover:border-white/30 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Stats row */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<BookOpen className="size-5 text-indigo-400" />}
            label={t('dashboard.my_exams')}
            value={exams.length}
            bg="bg-indigo-500/10 border-indigo-500/20"
          />
          <StatCard
            icon={<BarChart3 className="size-5 text-purple-400" />}
            label={t('dashboard.results')}
            value={exams.reduce((sum, e) => sum + (e.result_count ?? 0), 0)}
            bg="bg-purple-500/10 border-purple-500/20"
          />
          <StatCard
            icon={<Users className="size-5 text-emerald-400" />}
            label={t('dashboard.students')}
            value={exams.filter((e) => e.is_active).length}
            bg="bg-emerald-500/10 border-emerald-500/20"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Tabs */}
        <div className="mb-6 flex items-center justify-between border-b border-white/10">
          <div className="flex gap-2">
            {(['exams', 'results'] as DashboardTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 px-4 pb-3 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-white/40 hover:text-white'
                }`}
              >
                {tab === 'exams' ? t('dashboard.my_exams') : t('dashboard.results')}
              </button>
            ))}
          </div>
          {activeTab === 'exams' && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreateModal(true)}
              className="mb-3 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500"
            >
              <PlusCircle className="size-4" />
              {t('dashboard.create_exam')}
            </motion.button>
          )}
        </div>

        {/* Error state */}
        {examsError && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>Error al cargar exámenes. Intenta recargar la página.</span>
          </div>
        )}

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'exams' ? (
            <motion.div
              key="exams-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="size-8 animate-spin text-indigo-400" />
                </div>
              ) : exams.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {exams.map((exam, i) => (
                      <ExamCard
                        key={exam.id}
                        exam={exam}
                        index={i}
                        copiedCode={copiedCode}
                        deleteConfirmId={deleteConfirmId}
                        onCopyCode={copyCode}
                        onToggle={() => toggleActiveMutation.mutate({
                          examId: exam.id,
                          isActive: exam.is_active,
                        })}
                        onDelete={() => setDeleteConfirmId(exam.id)}
                        onDeleteConfirm={() => deleteExamMutation.mutate(exam.id)}
                        onDeleteCancel={() => setDeleteConfirmId(null)}
                        isTogglingActive={toggleActiveMutation.isPending}
                        isDeleting={deleteExamMutation.isPending && deleteConfirmId === exam.id}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="results-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <ResultsView
                exams={exams}
                onOpenQRDecoder={(payload, examId) => openQRDecoder(payload, examId)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <CreateExamModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <QRDecoderModal
        isOpen={qrDecoder.isOpen}
        onClose={() => setQrDecoder((s) => ({ ...s, isOpen: false }))}
        initialPayload={qrDecoder.payload}
        initialExamId={qrDecoder.examId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
  className?: string;
}

function StatCard({ icon, label, value, bg, className = '' }: StatCardProps): JSX.Element {
  return (
    <div className={`rounded-2xl border ${bg} p-5 ${className}`}>
      <div className="mb-2">{icon}</div>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

interface ExamCardProps {
  exam: ExamWithCount;
  index: number;
  copiedCode: string | null;
  deleteConfirmId: string | null;
  onCopyCode: (id: string) => void;
  onToggle: () => void;
  onDelete: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  isTogglingActive: boolean;
  isDeleting: boolean;
}

function ExamCard({
  exam, index, copiedCode, deleteConfirmId,
  onCopyCode, onToggle, onDelete, onDeleteConfirm, onDeleteCancel,
  isTogglingActive, isDeleting,
}: ExamCardProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'es' | 'en';
  const examCode = generateExamCode(exam.id);
  const isCopied = copiedCode === exam.id;
  const isConfirming = deleteConfirmId === exam.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.05 }}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
    >
      {/* Status badge + controls */}
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          exam.is_active
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-white/10 text-white/40'
        }`}>
          {exam.is_active ? t('dashboard.active') : t('dashboard.inactive')}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            disabled={isTogglingActive}
            className="text-white/40 transition-colors hover:text-white"
          >
            {exam.is_active
              ? <ToggleRight className="size-6 text-emerald-400" />
              : <ToggleLeft className="size-6" />
            }
          </button>

          {/* Delete with confirmation */}
          {isConfirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDeleteConfirm}
                disabled={isDeleting}
                className="flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/30"
              >
                {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <AlertCircle className="size-3" />}
                Sure?
              </button>
              <button
                onClick={onDeleteCancel}
                className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={onDelete}
              className="rounded-lg p-1 text-white/20 transition-colors hover:text-red-400"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-white line-clamp-2">
          {exam.title[lang] || exam.title.en}
        </h3>
        <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {exam.duration_minutes} {t('exam.minutes')}
          </span>
          {exam.question_count !== undefined && (
            <span>{t('dashboard.questions_count', { count: exam.question_count })}</span>
          )}
        </div>
      </div>

      {/* Exam code */}
      <button
        onClick={() => onCopyCode(exam.id)}
        className="flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 transition-all hover:bg-indigo-500/20"
      >
        <span className="font-mono text-sm font-bold tracking-widest text-indigo-300">
          {examCode}
        </span>
        {isCopied
          ? <Check className="size-4 text-emerald-400" />
          : <Copy className="size-4 text-indigo-400" />
        }
      </button>

      {/* Exam ID (for QR decoder reference) */}
      <div className="rounded-lg bg-white/3 px-3 py-1.5 border border-white/5">
        <p className="truncate font-mono text-[10px] text-white/20" title={exam.id}>
          ID: {exam.id}
        </p>
      </div>

      {exam.result_count !== undefined && (
        <p className="text-xs text-white/30">
          {t('dashboard.total_results', { count: exam.result_count })}
        </p>
      )}
    </motion.div>
  );
}

function EmptyState(): JSX.Element {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 py-20 text-center"
    >
      <div className="rounded-full bg-white/5 p-6">
        <PlusCircle className="size-10 text-white/20" />
      </div>
      <p className="text-white/40">{t('dashboard.no_exams')}</p>
    </motion.div>
  );
}