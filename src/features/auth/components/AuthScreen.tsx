// ============================================================
// AuthScreen — Sign In / Sign Up for teachers and students.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, GraduationCap, BookOpen, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../../core/lib/serverApi';
import { supabase } from '../../../core/lib/supabaseClient';
import { useAuthStore } from '../store/authStore';
import { LanguageToggle } from '../../../shared/components/LanguageToggle';
import type { Profile, UserRole } from '../../../core/types/database.types';

type AuthMode = 'signin' | 'signup';

export function AuthScreen(): JSX.Element {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);

  const [mode, setMode] = useState<AuthMode>('signin');
  const [role, setRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { data, error: signupError } = await apiRequest<{ user: { id: string } }>(
          '/auth/signup',
          {
            method: 'POST',
            body: { email, password, full_name: fullName, role },
          },
        );

        if (signupError || !data) {
          setError(signupError ?? t('auth.error_generic'));
          return;
        }
      }

      const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !session) {
        setError(t('auth.error_invalid'));
        return;
      }

      const { data: profileData } = await apiRequest<Profile>(
        `/profiles/${session.user.id}`,
        { requiresAuth: false },
      );

      if (profileData) {
        setSession(profileData, session.access_token);
      }
    } catch (err) {
      console.error('[AuthScreen] Authentication error:', err);
      setError(t('auth.error_generic'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 p-4">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 size-96 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 size-96 rounded-full bg-purple-600/20 blur-3xl" />
      </div>

      {/* Language toggle */}
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
            <span className="text-3xl font-black text-white">E</span>
          </div>
          <h1 className="text-3xl font-black text-white">Exu</h1>
          <p className="mt-1 text-sm text-white/50">{t('app.tagline')}</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          {/* Mode tabs */}
          <div className="mb-6 flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(['signin', 'signup'] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                  mode === m
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {m === 'signin' ? t('auth.sign_in') : t('auth.sign_up')}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Role selector (signup only) */}
            <AnimatePresence>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-3 overflow-hidden"
                >
                  <RoleButton
                    role="student"
                    selected={role === 'student'}
                    icon={<GraduationCap className="size-5" />}
                    label={t('auth.role_student')}
                    onClick={() => setRole('student')}
                  />
                  <RoleButton
                    role="teacher"
                    selected={role === 'teacher'}
                    icon={<BookOpen className="size-5" />}
                    label={t('auth.role_teacher')}
                    onClick={() => setRole('teacher')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Full name (signup only) */}
            <AnimatePresence>
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <InputField
                    icon={<User className="size-4" />}
                    type="text"
                    placeholder={t('auth.full_name')}
                    value={fullName}
                    onChange={setFullName}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <InputField
              icon={<Mail className="size-4" />}
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={setEmail}
              required
            />

            <InputField
              icon={<Lock className="size-4" />}
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={setPassword}
              required
            />

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileTap={{ scale: 0.98 }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-opacity disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('auth.signing_in')}
                </>
              ) : (
                <>
                  {mode === 'signin' ? t('auth.sign_in') : t('auth.sign_up')}
                  <ArrowRight className="size-4" />
                </>
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

interface InputFieldProps {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}

function InputField({ icon, type, placeholder, value, onChange, required }: InputFieldProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <span className="shrink-0 text-white/40">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
      />
    </div>
  );
}

interface RoleButtonProps {
  role: UserRole;
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function RoleButton({ selected, icon, label, onClick }: RoleButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/30 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
