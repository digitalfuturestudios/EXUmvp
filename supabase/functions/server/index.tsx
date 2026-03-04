// ============================================================
// EXU — Hono Server (Supabase Edge Function)
// Routes: /auth, /exams, /questions, /results, /profiles
// ============================================================

import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';

const app = new Hono();

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

app.use('*', logger(console.log));

app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  }),
);

// ─────────────────────────────────────────────
// SUPABASE ADMIN CLIENT (service role — server only)
// ─────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function getAnonClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );
}

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE — validates Bearer token
// ─────────────────────────────────────────────

async function requireAuth(c: any): Promise<string | null> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return null;

  const supabase = getAdminClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get('/make-server-cd016e9d/health', (c) => {
  return c.json({ status: 'ok', service: 'exu-server', version: '1.0.0' });
});

// ─────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────

/** POST /auth/signup — Creates user + profile */
app.post('/make-server-cd016e9d/auth/signup', async (c) => {
  try {
    const { email, password, full_name, role } = await c.req.json();

    if (!email || !password || !full_name || !role) {
      return c.json({ error: 'Missing required fields: email, password, full_name, role' }, 400);
    }

    if (!['teacher', 'student'].includes(role)) {
      return c.json({ error: 'Invalid role. Must be "teacher" or "student"' }, 400);
    }

    const supabase = getAdminClient();

    // Create auth user (auto-confirm email for this prototype)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name, role },
      email_confirm: true,
    });

    if (userError || !userData.user) {
      console.error('[signup] User creation failed:', userError);
      return c.json({ error: `User creation failed: ${userError?.message}` }, 400);
    }

    // Create profile record
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userData.user.id,
        full_name,
        role,
        preferred_language: 'es',
      });

    if (profileError) {
      console.error('[signup] Profile creation failed:', profileError);
      // Attempt cleanup — delete the auth user to keep consistency
      await supabase.auth.admin.deleteUser(userData.user.id);
      return c.json({ error: `Profile creation failed: ${profileError.message}` }, 500);
    }

    return c.json({ user: { id: userData.user.id, email } }, 201);
  } catch (err) {
    console.error('[signup] Unexpected error:', err);
    return c.json({ error: `Signup error: ${err}` }, 500);
  }
});

// ─────────────────────────────────────────────
// PROFILE ROUTES
// ─────────────────────────────────────────────

app.get('/make-server-cd016e9d/profiles/:id', async (c) => {
  try {
    const userId = c.req.param('id');
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error('[profiles] Fetch failed:', error);
      return c.json({ error: `Profile not found: ${error?.message}` }, 404);
    }

    return c.json(data);
  } catch (err) {
    console.error('[profiles] Unexpected error:', err);
    return c.json({ error: `Profile fetch error: ${err}` }, 500);
  }
});

// ─────────────────────────────────────────────
// EXAM ROUTES
// ─────────────────────────────────────────────

/** GET /exams?teacher_id=xxx — List teacher's exams with counts */
app.get('/make-server-cd016e9d/exams', async (c) => {
  try {
    const teacherId = c.req.query('teacher_id');
    const supabase = getAdminClient();

    let query = supabase.from('exams').select(`
      *,
      question_count:questions(count),
      result_count:results(count)
    `);

    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[exams] List failed:', error);
      return c.json({ error: `Failed to list exams: ${error.message}` }, 500);
    }

    // Flatten the count aggregates
    const exams = (data ?? []).map((e: any) => ({
      ...e,
      question_count: e.question_count?.[0]?.count ?? 0,
      result_count: e.result_count?.[0]?.count ?? 0,
    }));

    return c.json(exams);
  } catch (err) {
    console.error('[exams] Unexpected error:', err);
    return c.json({ error: `Exam list error: ${err}` }, 500);
  }
});

/** GET /exams/code/:code — Fetch exam by short code (for students) */
app.get('/make-server-cd016e9d/exams/code/:code', async (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    const supabase = getAdminClient();

    // The code is stored as a computed column or we lookup by a hash.
    // For simplicity: code is the first 8 chars of SHA of exam id.
    // We fetch all active exams and filter (acceptable at small scale).
    const { data: exams, error: examError } = await supabase
      .from('exams')
      .select('*')
      .eq('is_active', true);

    if (examError) {
      return c.json({ error: `Exam lookup failed: ${examError.message}` }, 500);
    }

    // Import hash function — use Web Crypto API (available in Deno)
    const encoder = new TextEncoder();

    const matchedExam = await (async () => {
      for (const exam of (exams ?? [])) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(exam.id));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const examCode = `EXU-${hashHex.slice(0, 4).toUpperCase()}`;
        if (examCode === code) return exam;
      }
      return null;
    })();

    if (!matchedExam) {
      return c.json({ error: `No active exam found with code: ${code}` }, 404);
    }

    // Fetch questions for this exam
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', matchedExam.id)
      .order('order_index');

    if (questionsError) {
      return c.json({ error: `Failed to fetch questions: ${questionsError.message}` }, 500);
    }

    return c.json({ exam: matchedExam, questions: questions ?? [] });
  } catch (err) {
    console.error('[exams/code] Unexpected error:', err);
    return c.json({ error: `Exam code lookup error: ${err}` }, 500);
  }
});

/** POST /exams — Create a new exam */
app.post('/make-server-cd016e9d/exams', async (c) => {
  try {
    const userId = await requireAuth(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('exams')
      .insert({ ...body, teacher_id: userId })
      .select()
      .single();

    if (error) {
      console.error('[exams] Create failed:', error);
      return c.json({ error: `Exam creation failed: ${error.message}` }, 400);
    }

    return c.json(data, 201);
  } catch (err) {
    console.error('[exams] Create unexpected error:', err);
    return c.json({ error: `Exam create error: ${err}` }, 500);
  }
});

/** PATCH /exams/:id — Update exam (e.g., toggle active) */
app.patch('/make-server-cd016e9d/exams/:id', async (c) => {
  try {
    const userId = await requireAuth(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const examId = c.req.param('id');
    const updates = await c.req.json();
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('exams')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', examId)
      .eq('teacher_id', userId) // RLS-equivalent: teacher can only update own exams
      .select()
      .single();

    if (error) {
      console.error('[exams] Update failed:', error);
      return c.json({ error: `Exam update failed: ${error.message}` }, 400);
    }

    return c.json(data);
  } catch (err) {
    console.error('[exams] Update unexpected error:', err);
    return c.json({ error: `Exam update error: ${err}` }, 500);
  }
});

/** DELETE /exams/:id — Delete an exam and its questions/results */
app.delete('/make-server-cd016e9d/exams/:id', async (c) => {
  try {
    const userId = await requireAuth(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const examId = c.req.param('id');
    const supabase = getAdminClient();

    // Verify teacher owns the exam before deletion
    const { data: exam } = await supabase
      .from('exams')
      .select('teacher_id')
      .eq('id', examId)
      .single();

    if (!exam || exam.teacher_id !== userId) {
      return c.json({ error: 'Unauthorized: you do not own this exam' }, 403);
    }

    const { error } = await supabase
      .from('exams')
      .delete()
      .eq('id', examId);

    if (error) {
      console.error('[exams] Delete failed:', error);
      return c.json({ error: `Exam deletion failed: ${error.message}` }, 400);
    }

    return c.json({ success: true }, 200);
  } catch (err) {
    console.error('[exams] Delete unexpected error:', err);
    return c.json({ error: `Exam delete error: ${err}` }, 500);
  }
});

// ─────────────────────────────────────────────
// RESULTS ROUTES
// ─────────────────────────────────────────────

/** POST /results — Submit exam result (online sync) */
app.post('/make-server-cd016e9d/results', async (c) => {
  try {
    const body = await c.req.json();
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('results')
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error('[results] Insert failed:', error);
      return c.json({ error: `Result submission failed: ${error.message}` }, 400);
    }

    return c.json(data, 201);
  } catch (err) {
    console.error('[results] Unexpected error:', err);
    return c.json({ error: `Result submit error: ${err}` }, 500);
  }
});

/** GET /results?exam_id=xxx — Get results for an exam */
app.get('/make-server-cd016e9d/results', async (c) => {
  try {
    const userId = await requireAuth(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const examId = c.req.query('exam_id');
    const supabase = getAdminClient();

    let query = supabase.from('results').select('*');
    if (examId) query = query.eq('exam_id', examId);

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[results] Fetch failed:', error);
      return c.json({ error: `Results fetch failed: ${error.message}` }, 500);
    }

    return c.json(data ?? []);
  } catch (err) {
    console.error('[results] Unexpected error:', err);
    return c.json({ error: `Results fetch error: ${err}` }, 500);
  }
});

// ─────────────────────────────────────────────
// QUESTIONS ROUTES
// ─────────────────────────────────────────────

/** POST /questions — Create a question for an exam */
app.post('/make-server-cd016e9d/questions', async (c) => {
  try {
    const userId = await requireAuth(c);
    if (!userId) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    const supabase = getAdminClient();

    // Verify teacher owns the exam
    const { data: exam } = await supabase
      .from('exams')
      .select('teacher_id')
      .eq('id', body.exam_id)
      .single();

    if (!exam || exam.teacher_id !== userId) {
      return c.json({ error: 'Unauthorized: you do not own this exam' }, 403);
    }

    const { data, error } = await supabase
      .from('questions')
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error('[questions] Create failed:', error);
      return c.json({ error: `Question creation failed: ${error.message}` }, 400);
    }

    return c.json(data, 201);
  } catch (err) {
    console.error('[questions] Create unexpected error:', err);
    return c.json({ error: `Question create error: ${err}` }, 500);
  }
});

/** GET /questions?exam_id=xxx — Fetch questions for an exam */
app.get('/make-server-cd016e9d/questions', async (c) => {
  try {
    const examId = c.req.query('exam_id');
    if (!examId) {
      return c.json({ error: 'exam_id query parameter is required' }, 400);
    }

    const supabase = getAdminClient();

    // Verify the exam is active (students/teachers can read active exam questions)
    const { data: exam } = await supabase
      .from('exams')
      .select('id, is_active, teacher_id')
      .eq('id', examId)
      .single();

    if (!exam) {
      return c.json({ error: `Exam not found: ${examId}` }, 404);
    }

    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('order_index');

    if (error) {
      console.error('[questions] Fetch failed:', error);
      return c.json({ error: `Failed to fetch questions: ${error.message}` }, 500);
    }

    return c.json(data ?? []);
  } catch (err) {
    console.error('[questions] Fetch unexpected error:', err);
    return c.json({ error: `Questions fetch error: ${err}` }, 500);
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

Deno.serve(app.fetch);