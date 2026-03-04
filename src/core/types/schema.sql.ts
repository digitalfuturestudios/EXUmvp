/**
 * EXU — Supabase PostgreSQL DDL (Logical Schema Reference)
 *
 * This file documents the database schema for reference.
 * Run these statements in the Supabase SQL editor to initialize the DB.
 *
 * ⚠️  Note: This is a TypeScript file exporting SQL strings for documentation.
 *     Execute them in the Supabase Dashboard → SQL Editor.
 */

export const SCHEMA_DDL = `
-- ─────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  role               TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  avatar_url         TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'es' CHECK (preferred_language IN ('es', 'en')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own_read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_own_update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────
-- EXAMS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exams (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            JSONB NOT NULL,          -- BilingualContent: { es: "", en: "" }
  description      JSONB,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  passing_score    INTEGER NOT NULL DEFAULT 60 CHECK (passing_score BETWEEN 0 AND 100),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  allow_offline    BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

-- Teachers manage their own exams
CREATE POLICY "exams_teacher_crud"
  ON public.exams FOR ALL
  USING (auth.uid() = teacher_id);

-- Active exams are readable by everyone (students use exam code)
CREATE POLICY "exams_public_read_active"
  ON public.exams FOR SELECT
  USING (is_active = true);

CREATE INDEX idx_exams_teacher_id ON public.exams(teacher_id);
CREATE INDEX idx_exams_is_active  ON public.exams(is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────
-- QUESTIONS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id        UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  content        JSONB NOT NULL,      -- BilingualContent
  type           TEXT NOT NULL CHECK (type IN ('multiple_choice', 'true_false', 'short_answer')),
  options        JSONB,               -- QuestionOption[] | null
  correct_answer TEXT NOT NULL,
  points         INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
  order_index    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_teacher_crud"
  ON public.questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id AND e.teacher_id = auth.uid()
    )
  );

CREATE POLICY "questions_public_read_active_exam"
  ON public.questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id AND e.is_active = true
    )
  );

CREATE INDEX idx_questions_exam_id ON public.questions(exam_id, order_index);

-- ─────────────────────────────────────────────────────────
-- RESULTS
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.results (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id           UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id        TEXT NOT NULL,          -- Local student identifier
  student_name      TEXT NOT NULL,
  score             INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  total_points      INTEGER NOT NULL DEFAULT 0,
  earned_points     INTEGER NOT NULL DEFAULT 0,
  encrypted_payload TEXT NOT NULL,          -- AES-encrypted answers JSON
  sync_method       TEXT NOT NULL CHECK (sync_method IN ('QR', 'API')),
  started_at        TIMESTAMPTZ NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- Anyone can insert results (students submit without auth)
CREATE POLICY "results_public_insert"
  ON public.results FOR INSERT
  WITH CHECK (true);

-- Only exam teachers can read results
CREATE POLICY "results_teacher_read"
  ON public.results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id AND e.teacher_id = auth.uid()
    )
  );

CREATE INDEX idx_results_exam_id ON public.results(exam_id, created_at DESC);
CREATE INDEX idx_results_student ON public.results(student_id);
` as const;
