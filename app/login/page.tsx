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
      <div className="min-h-dvh bg-desk flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-rule-2 border-t-ink animate-spin keep-motion" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-desk text-ink flex flex-col">
      {/* Compact single-row Top Bar */}
      <header className="h-14 border-b border-rule bg-paper/80">
        <div className="max-w-4xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-6">
          <span className="font-display text-lg font-semibold tracking-tight text-ink whitespace-nowrap shrink-0">
            Relay
          </span>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              href="/sandbox"
              className="text-sm font-medium text-muted hover:text-ink hover:underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              Sandbox
            </Link>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              className="h-8 w-8 rounded-input text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer shrink-0"
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
        <div className="w-full max-w-[380px] rounded-card coral-stock p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink text-balance">
              Sign in
            </h1>
            <p className="text-sm text-muted">
              Cross-device clipboard and file relay.
            </p>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label
                htmlFor="login-email-input"
                className="block text-xs font-medium text-ink-2"
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
                className="mwg-input w-full h-11 rounded-input bg-paper border border-rule-2 px-3.5 text-sm text-ink placeholder:text-muted focus:border-focus transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password-input"
                className="block text-xs font-medium text-ink-2"
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
                  className="mwg-input w-full h-11 rounded-input bg-paper border border-rule-2 px-3.5 pr-11 text-sm text-ink placeholder:text-muted focus:border-focus transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-input text-muted hover:text-ink active:translate-y-px transition-colors cursor-pointer"
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
                className="h-4 w-4 rounded border-rule-2 bg-paper accent-board cursor-pointer"
              />
              <span className="text-xs text-muted">
                Remember this device
              </span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-xs text-error bg-paper-2 border border-error/30 rounded-input px-3.5 py-2.5 leading-relaxed"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="coral-btn-ink w-full h-11 rounded-stock disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{submitting ? 'Signing in...' : 'Sign in'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-rule" />
            <span className="px-3 text-xs text-muted">or</span>
            <div className="flex-1 border-t border-rule" />
          </div>

          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={submitting || googleLoading}
            className="coral-btn-secondary w-full h-11 rounded-stock disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium cursor-pointer"
          >
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>
      </main>
    </div>
  );
}
