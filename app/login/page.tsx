'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { mapFirebaseAuthError, validateEmailAuthInput } from '@/lib/auth-errors';
import {
  auth,
  firebaseRuntimeConfig,
  isFirebaseConfigured,
  signInWithEmail,
  signInWithGoogle,
} from '@/lib/firebase';
import { useMaterialTheme } from '@/components/ThemeProvider';

const CAPABILITY_LEDGER = [
  {
    index: '01',
    title: 'Instant Clipboard & Screenshots',
    detail: 'Paste text, links, code, or Cmd/Ctrl+V images directly into your private stream.',
  },
  {
    index: '02',
    title: 'Resumable File Handoff',
    detail: 'Transfer documents, archives, and Thai UTF-8 filenames up to 10 MB, stored entirely in Firestore.',
  },
  {
    index: '03',
    title: 'QR Phone Pickup',
    detail: 'Scan any item or workspace QR code to pull links and files straight onto your phone.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useMaterialTheme();
  const [checkingSession, setCheckingSession] = useState(Boolean(isFirebaseConfigured && auth));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      router.replace('/');
      return;
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/');
      } else {
        setCheckingSession(false);
      }
    });
    return () => unsub();
  }, [router]);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validateEmailAuthInput(email, password);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid credentials.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(email, password, rememberDevice);
      router.replace('/');
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      if (msg) setError(msg);
      setSubmitting(false);
    }
  }

  async function handleGoogleClick() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace('/');
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      if (msg) setError(msg);
      setGoogleLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] dark:bg-[#121110] flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-[#DDD6C8] dark:border-[#2C2925] border-t-[#181715] dark:border-t-[#F3EFE8] animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
      {/* Left Editorial Architecture Panel */}
      <section className="flex flex-col justify-between px-6 sm:px-10 lg:px-16 py-8 lg:py-12 border-b lg:border-b-0 lg:border-r border-[#E2DCD0] dark:border-[#272420]">
        <div className="flex items-center justify-between gap-4">
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[#181715] dark:text-[#F3EFE8] whitespace-nowrap">
            NTW Relay
          </span>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to Inkstone dark theme' : 'Switch to Paper light theme'}
            className="h-9 px-3 rounded-lg border border-[#DDD6C8] dark:border-[#2E2A25] bg-[#FCFBF8] dark:bg-[#1A1917] text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Inkstone</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Paper</span>
              </>
            )}
          </button>
        </div>

        <div className="my-10 lg:my-auto max-w-xl space-y-8">
          <div className="space-y-4">
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.15rem,4vw,3.35rem)] font-medium leading-[1.12] tracking-tight text-[#181715] dark:text-[#F3EFE8] [text-wrap:balance]">
              Your private desk for cross-device handoff.
            </h1>
            <p className="text-base text-[#5D5850] dark:text-[#A8A196] leading-relaxed max-w-lg">
              Send links, code snippets, screenshots, and files between your workstation and phone with real-time owner-isolated sync.
            </p>
          </div>

          <div className="border-t border-[#E2DCD0] dark:border-[#272420] divide-y divide-[#E2DCD0] dark:divide-[#272420]">
            {CAPABILITY_LEDGER.map((item) => (
              <div
                key={item.index}
                className="py-4 grid grid-cols-[2.25rem_1fr] gap-3 items-baseline"
              >
                <span className="font-mono text-xs text-[#787268] dark:text-[#8A8378] tabular-nums">
                  {item.index}.
                </span>
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-[#181715] dark:text-[#F3EFE8]">
                    {item.title}
                  </h2>
                  <p className="text-sm text-[#5D5850] dark:text-[#A8A196] leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs text-[#787268] dark:text-[#8A8378]">
          <span>
            Isolated by Firebase Auth ·{' '}
            <span className="font-mono">{firebaseRuntimeConfig?.projectId ?? 'local'}</span>
          </span>
          <Link
            href="/sandbox"
            className="text-[#181715] dark:text-[#F3EFE8] font-medium underline underline-offset-4 decoration-[#C8C0B2] dark:decoration-[#4A453E] hover:decoration-current transition-colors whitespace-nowrap"
          >
            Preview local sandbox
          </Link>
        </div>
      </section>

      {/* Right Sign-In Column */}
      <section className="bg-[#FCFBF8] dark:bg-[#161513] flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-12">
        <div className="w-full max-w-[380px] mx-auto space-y-7">
          <div className="space-y-2">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[#181715] dark:text-[#F3EFE8]">
              Sign in to NTW Relay
            </h2>
            <p className="text-sm text-[#5D5850] dark:text-[#A8A196] leading-relaxed">
              Use your personal account to unlock live cross-device sync.
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="login-email-input"
                className="block text-xs font-semibold text-[#3D3A35] dark:text-[#CFC8BC]"
              >
                Email address
              </label>
              <input
                id="login-email-input"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                className="w-full h-11 rounded-lg bg-[#F5F2EB] dark:bg-[#121110] border border-[#DDD6C8] dark:border-[#2E2A25] px-3.5 text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] focus:ring-2 focus:ring-[#1D4ED8]/15 dark:focus:ring-[#60A5FA]/20 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password-input"
                className="block text-xs font-semibold text-[#3D3A35] dark:text-[#CFC8BC]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter password"
                  className="w-full h-11 rounded-lg bg-[#F5F2EB] dark:bg-[#121110] border border-[#DDD6C8] dark:border-[#2E2A25] px-3.5 pr-11 text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] focus:ring-2 focus:ring-[#1D4ED8]/15 dark:focus:ring-[#60A5FA]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label
              htmlFor="login-remember-device"
              className="flex items-center gap-3 min-h-[40px] cursor-pointer select-none"
            >
              <input
                id="login-remember-device"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-[#CFC7B8] dark:border-[#3D3831] bg-[#F5F2EB] dark:bg-[#121110] text-[#181715] accent-[#181715] dark:accent-[#F3EFE8] cursor-pointer"
              />
              <span className="text-sm text-[#5D5850] dark:text-[#A8A196]">
                Keep me signed in on this device
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-xs sm:text-sm text-[#991B1B] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#3A1717]/60 border border-[#FECACA] dark:border-[#7F1D1D]/70 rounded-lg px-3.5 py-2.5 leading-relaxed"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="w-full h-11 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] disabled:opacity-50 text-[#FCFBF8] dark:text-[#121110] text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{submitting ? 'Signing in...' : 'Sign in with Email'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-[#E2DCD0] dark:border-[#2A2723]" />
            <span className="px-3 text-xs text-[#787268] dark:text-[#8A8378]">or</span>
            <div className="flex-1 border-t border-[#E2DCD0] dark:border-[#2A2723]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={submitting || googleLoading}
            className="w-full h-11 rounded-lg bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#DDD6C8] dark:border-[#302C27] hover:border-[#B9B0A0] dark:hover:border-[#4A453E] text-[#181715] dark:text-[#F3EFE8] disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer"
          >
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>
      </section>
    </main>
  );
}
