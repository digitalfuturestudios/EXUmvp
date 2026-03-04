// ============================================================
// ResultsView — Results tab for the teacher dashboard.
// Displays per-exam result list with score distribution.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart3, Users, Award, Clock, QrCode, Loader2,
  ChevronDown, TrendingUp, ShieldCheck, Wifi, WifiOff,
  AlertCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiRequest } from '../../../core/lib/serverApi';
import { generateExamCode } from '../../../core/lib/crypto';
import type { Exam, ExamResult } from '../../../core/types/database.types';

interface ExamWithCount extends Exam {
  question_count?: number;
  result_count?: number;
}

interface ResultsViewProps {
  exams: ExamWithCount[];
  onOpenQRDecoder: (payload: string, examId: string) => void;
}

export function ResultsView({ exams, onOpenQRDecoder }: ResultsViewProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as 'es' | 'en';
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id ?? '');

  const selectedExam = exams.find((e) => e.id === selectedExamId);

  // ─── Fetch results for selected exam ─────────────────────
  const { data: results = [], isLoading, error } = useQuery<ExamResult[]>({
    queryKey: ['exam-results', selectedExamId],
    queryFn: async () => {
      const { data, error } = await apiRequest<ExamResult[]>(
        `/results?exam_id=${selectedExamId}`,
        { requiresAuth: true },
      );
      if (error) throw new Error(`Failed to load results: ${error}`);
      return data ?? [];
    },
    enabled: Boolean(selectedExamId),
    staleTime: 30_000,
  });

  // ─── Score distribution data ──────────────────────────────
  const scoreDistribution = computeScoreDistribution(results);
  const stats = computeStats(results, selectedExam?.passing_score ?? 60);

  if (exams.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 py-20 text-center"
      >
        <div className="rounded-full bg-white/5 p-6">
          <BarChart3 className="size-10 text-white/20" />
        </div>
        <p className="text-white/40">{t('dashboard.no_exams')}</p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Exam selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold uppercase tracking-widest text-white/40">
          {t('dashboard.my_exams')}:
        </label>
        <div className="relative">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-2 pr-8 text-sm text-white outline-none focus:border-indigo-500/50"
          >
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id} className="bg-slate-900">
                {exam.title[lang] || exam.title.en} — {generateExamCode(exam.id)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-indigo-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">Error loading results. Please try again.</p>
        </div>
      ) : results.length === 0 ? (
        <EmptyResultsState />
      ) : (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultStatCard
              icon={<Users className="size-5 text-indigo-400" />}
              label="Total students"
              value={String(stats.total)}
              bg="bg-indigo-500/10 border-indigo-500/20"
            />
            <ResultStatCard
              icon={<TrendingUp className="size-5 text-emerald-400" />}
              label="Avg. score"
              value={`${stats.avgScore}%`}
              bg="bg-emerald-500/10 border-emerald-500/20"
            />
            <ResultStatCard
              icon={<Award className="size-5 text-amber-400" />}
              label="Passed"
              value={`${stats.passedCount} (${stats.passRate}%)`}
              bg="bg-amber-500/10 border-amber-500/20"
            />
            <ResultStatCard
              icon={<BarChart3 className="size-5 text-purple-400" />}
              label="High score"
              value={`${stats.maxScore}%`}
              bg="bg-purple-500/10 border-purple-500/20"
            />
          </div>

          {/* Score distribution chart */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="mb-4 text-sm font-semibold text-white/70">Score Distribution</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={scoreDistribution} barCategoryGap="20%">
                <XAxis
                  dataKey="range"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.passing ? '#10b981' : '#6366f1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Results table */}
          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/5 px-5 py-3">
              <h3 className="text-sm font-semibold text-white/70">Student Results</h3>
            </div>
            <div className="divide-y divide-white/5">
              <AnimatePresence>
                {results.map((result, i) => (
                  <ResultRow
                    key={result.id}
                    result={result}
                    index={i}
                    passingScore={selectedExam?.passing_score ?? 60}
                    onDecode={() => onOpenQRDecoder(result.encrypted_payload, result.exam_id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────

interface ResultStatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
}

function ResultStatCard({ icon, label, value, bg }: ResultStatCardProps): JSX.Element {
  return (
    <div className={`rounded-2xl border ${bg} p-4`}>
      <div className="mb-1.5">{icon}</div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-white/50">{label}</p>
    </div>
  );
}

interface ResultRowProps {
  result: ExamResult;
  index: number;
  passingScore: number;
  onDecode: () => void;
}

function ResultRow({ result, index, passingScore, onDecode }: ResultRowProps): JSX.Element {
  const passed = result.score >= passingScore;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors"
    >
      {/* Student info */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-bold text-indigo-300">
          {result.student_name[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{result.student_name}</p>
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Clock className="size-3" />
            <span>{new Date(result.submitted_at).toLocaleDateString()}</span>
            {result.sync_method === 'QR' ? (
              <span className="flex items-center gap-0.5 text-amber-400">
                <QrCode className="size-3" /> QR
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-emerald-400">
                <Wifi className="size-3" /> API
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score + actions */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <p className={`text-lg font-black ${passed ? 'text-emerald-400' : 'text-red-400'}`}>
            {result.score}%
          </p>
          <p className="text-xs text-white/30">
            {result.earned_points}/{result.total_points} pts
          </p>
        </div>

        <span className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:block ${
          passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-400'
        }`}>
          {passed ? '✓' : '✗'}
        </span>

        <button
          onClick={onDecode}
          title="Decode encrypted answers"
          className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-white/40 transition-colors hover:border-indigo-500/40 hover:text-indigo-300"
        >
          <ShieldCheck className="size-4" />
        </button>
      </div>
    </motion.div>
  );
}

function EmptyResultsState(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-white/10 py-16 text-center"
    >
      <div className="rounded-full bg-white/5 p-5">
        <WifiOff className="size-8 text-white/20" />
      </div>
      <div>
        <p className="font-semibold text-white/40">No results yet</p>
        <p className="mt-1 text-xs text-white/25">
          Results will appear here once students submit their exams.
        </p>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

interface ScoreBucket {
  range: string;
  count: number;
  passing: boolean;
}

function computeScoreDistribution(results: ExamResult[]): ScoreBucket[] {
  const buckets: ScoreBucket[] = [
    { range: '0–20', count: 0, passing: false },
    { range: '21–40', count: 0, passing: false },
    { range: '41–60', count: 0, passing: false },
    { range: '61–80', count: 0, passing: true },
    { range: '81–100', count: 0, passing: true },
  ];

  for (const r of results) {
    const idx = Math.min(Math.floor(r.score / 20), 4);
    buckets[idx].count++;
  }

  return buckets;
}

function computeStats(results: ExamResult[], passingScore: number) {
  if (results.length === 0) {
    return { total: 0, avgScore: 0, passedCount: 0, passRate: 0, maxScore: 0 };
  }

  const total = results.length;
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / total);
  const passedCount = results.filter((r) => r.score >= passingScore).length;
  const passRate = Math.round((passedCount / total) * 100);
  const maxScore = Math.max(...results.map((r) => r.score));

  return { total, avgScore, passedCount, passRate, maxScore };
}