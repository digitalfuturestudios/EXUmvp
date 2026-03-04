// ============================================================
// DATABASE TYPES — Supabase PostgreSQL Schema Interfaces
// These types mirror the remote database schema exactly.
// ============================================================

/** Supported exam question types */
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

/** Delivery method for result synchronization */
export type SyncMethod = 'QR' | 'API';

/** Bilingual content container used in question content and options */
export interface BilingualContent {
  es: string;
  en: string;
}

/** Bilingual option for multiple choice questions */
export interface QuestionOption {
  id: string;
  label: BilingualContent;
}

// ─────────────────────────────────────────────
// SUPABASE TABLE: exams
// ─────────────────────────────────────────────
export interface Exam {
  id: string;
  teacher_id: string;
  title: BilingualContent;
  description: BilingualContent | null;
  duration_minutes: number;
  passing_score: number; // percentage 0-100
  is_active: boolean;
  allow_offline: boolean;
  created_at: string; // ISO 8601
  updated_at: string;
}

export type ExamInsert = Omit<Exam, 'id' | 'created_at' | 'updated_at'>;
export type ExamUpdate = Partial<ExamInsert>;

// ─────────────────────────────────────────────
// SUPABASE TABLE: questions
// ─────────────────────────────────────────────
export interface Question {
  id: string;
  exam_id: string;
  content: BilingualContent;       // The question text
  type: QuestionType;
  options: QuestionOption[] | null; // null for short_answer
  correct_answer: string;          // option id OR 'true'/'false' OR text
  points: number;
  order_index: number;
  created_at: string;
}

export type QuestionInsert = Omit<Question, 'id' | 'created_at'>;

// ─────────────────────────────────────────────
// SUPABASE TABLE: results
// ─────────────────────────────────────────────
export interface ExamResult {
  id: string;
  exam_id: string;
  student_id: string;
  student_name: string;
  score: number;                   // 0–100 percentage
  total_points: number;
  earned_points: number;
  encrypted_payload: string;       // AES-encrypted answers JSON
  sync_method: SyncMethod;
  started_at: string;
  submitted_at: string;
  created_at: string;
}

export type ExamResultInsert = Omit<ExamResult, 'id' | 'created_at'>;

// ─────────────────────────────────────────────
// SUPABASE TABLE: profiles (extended auth.users)
// ─────────────────────────────────────────────
export type UserRole = 'teacher' | 'student';

export interface Profile {
  id: string;               // References auth.users.id
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  preferred_language: 'es' | 'en';
  created_at: string;
}

export type ProfileInsert = Omit<Profile, 'created_at'>;
