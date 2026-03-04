// ============================================================
// EXAM STORE — Zustand slice for in-progress exam state.
// Source of truth for UI; Dexie is the persistence layer.
// ============================================================

import { create } from 'zustand';
import type { CachedExam, ExamSession, AnswerRecord } from '../../../core/types/local.types';

interface ExamState {
  cachedExam: CachedExam | null;
  session: ExamSession | null;
  currentQuestionIndex: number;
  isSubmitting: boolean;
  isFinished: boolean;

  // Actions
  initExam: (exam: CachedExam, session: ExamSession) => void;
  recordAnswer: (questionId: string, answer: string) => void;
  setCurrentQuestion: (index: number) => void;
  updateSession: (updates: Partial<ExamSession>) => void;
  setSubmitting: (value: boolean) => void;
  setFinished: () => void;
  resetExam: () => void;
}

export const useExamStore = create<ExamState>()((set) => ({
  cachedExam: null,
  session: null,
  currentQuestionIndex: 0,
  isSubmitting: false,
  isFinished: false,

  initExam: (exam, session) => {
    set({
      cachedExam: exam,
      session,
      currentQuestionIndex: session.current_question_index,
      isSubmitting: false,
      isFinished: false,
    });
  },

  recordAnswer: (questionId, answer) => {
    set((state) => {
      if (!state.session) return state;

      const answerRecord: AnswerRecord = {
        question_id: questionId,
        answer,
        answered_at: Date.now(),
      };

      return {
        session: {
          ...state.session,
          answers: {
            ...state.session.answers,
            [questionId]: answerRecord,
          },
        },
      };
    });
  },

  setCurrentQuestion: (index) => {
    set((state) => ({
      currentQuestionIndex: index,
      session: state.session
        ? { ...state.session, current_question_index: index }
        : null,
    }));
  },

  updateSession: (updates) => {
    set((state) => ({
      session: state.session ? { ...state.session, ...updates } : null,
    }));
  },

  setSubmitting: (value) => set({ isSubmitting: value }),

  setFinished: () => set({ isFinished: true, isSubmitting: false }),

  resetExam: () => set({
    cachedExam: null,
    session: null,
    currentQuestionIndex: 0,
    isSubmitting: false,
    isFinished: false,
  }),
}));
