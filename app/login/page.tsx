'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { mapFirebaseAuthError, validateEmailAuthInput } from '@/lib/auth-errors';
import {
  auth,
  isFirebaseConfigured,
  signInWithEmail,
  signInWithGoogle,
} from '@/lib/firebase';
import { useMaterialTheme } from '@/components/ThemeProvider';

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
        <div className="w-6 h-6 rounded-full border-2 border-[#DDD6C8] dark:border-[#2C2925] border-t-[#181715] dark:border-t-[#F3EFE8] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex flex-col">
      {/* Compact single-row Top Bar */}
      <header className="h-14 border-b border-[#E2DCD0] dark:border-[#272420]">
        <div className="max-w-4xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[#181715] dark:text-[#F3EFE8] whitespace-nowrap shrink-0">
            NTW Relay
          </span>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/sandbox"
              className="text-sm font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Sandbox
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              className="h-8 w-8 rounded-lg text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center justify-center cursor-pointer shrink-0"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Centered Minimal Sign-In Canvas */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-[380px] rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[#181715] dark:text-[#F3EFE8] [text-wrap:balance]">
              Sign in
            </h1>
            <p className="text-sm text-[#6B655C] dark:text-[#968F84]">
              Cross-device clipboard &amp; file relay.
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="login-email-input"
                className="block text-xs font-medium text-[#3D3A35] dark:text-[#CFC8BC]"
              >
                Email
              </label>
              <input
                id="login-email-input"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="you@example.com"
                className="mwg-input w-full h-11 rounded-lg bg-[#F5F2EB] dark:bg-[#121110] border border-[#DDD6C8] dark:border-[#2E2A25] px-3.5 text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] focus:ring-2 focus:ring-[#1D4ED8]/15 dark:focus:ring-[#60A5FA]/20 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password-input"
                className="block text-xs font-medium text-[#3D3A35] dark:text-[#CFC8BC]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  className="mwg-input w-full h-11 rounded-lg bg-[#F5F2EB] dark:bg-[#121110] border border-[#DDD6C8] dark:border-[#2E2A25] px-3.5 pr-11 text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] focus:ring-2 focus:ring-[#1D4ED8]/15 dark:focus:ring-[#60A5FA]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <label
              htmlFor="login-remember-device"
              className="flex items-center gap-2.5 min-h-[36px] cursor-pointer select-none"
            >
              <input
                id="login-remember-device"
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-[#CFC7B8] dark:border-[#3D3831] bg-[#F5F2EB] dark:bg-[#121110] accent-[#181715] dark:accent-[#F3EFE8] cursor-pointer"
              />
              <span className="text-xs text-[#5D5850] dark:text-[#A8A196]">
                Remember this device
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-xs text-[#991B1B] dark:text-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#3A1717]/60 border border-[#FECACA] dark:border-[#7F1D1D]/70 rounded-lg px-3.5 py-2.5 leading-relaxed"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="w-full h-11 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] disabled:opacity-50 text-[#FCFBF8] dark:text-[#121110] text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{submitting ? 'Signing in...' : 'Sign in'}</span>
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
            className="w-full h-11 rounded-lg bg-[#F5F2EB] dark:bg-[#141311] border border-[#DDD6C8] dark:border-[#302C27] hover:border-[#B9B0A0] dark:hover:border-[#4A453E] text-[#181715] dark:text-[#F3EFE8] disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer"
          >
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>
      </main>
    </div>
  );
}
