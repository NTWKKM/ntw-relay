'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { mapFirebaseAuthError, validateEmailAuthInput } from '@/lib/auth-errors';
import {
  auth,
  firebaseRuntimeConfig,
  isFirebaseConfigured,
  signInWithEmail,
  signInWithGoogle,
} from '@/lib/firebase';

export default function LoginPage() {
  const router = useRouter();
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
      <div className="min-h-screen bg-[#0B0D11] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0D11] text-[#F4F5F7] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-11 h-11 rounded-xl bg-[#13161C] border border-zinc-800 flex items-center justify-center text-indigo-400">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F4F5F7]">Personal Drop</h1>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
            Sign in to access your private cross-device clipboard and files.
          </p>
        </div>

        <div className="rounded-xl bg-[#13161C] border border-zinc-800/90 p-6 space-y-5">
          <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="login-email-input" className="block text-sm font-medium text-zinc-300">
                Email
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
                className="w-full h-11 rounded-lg bg-[#0B0D11] border border-zinc-800 px-3.5 text-sm text-[#F4F5F7] placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="login-password-input"
                className="block text-sm font-medium text-zinc-300"
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
                  className="w-full h-11 rounded-lg bg-[#0B0D11] border border-zinc-800 px-3.5 pr-11 text-sm text-[#F4F5F7] placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/25 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
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
                className="h-4 w-4 rounded border-zinc-700 bg-[#0B0D11] text-indigo-500 accent-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-zinc-300">Keep me signed in on this device</span>
            </label>

            {error && (
              <p
                role="alert"
                className="text-xs sm:text-sm text-red-300 bg-red-500/10 border border-red-500/25 rounded-lg px-3.5 py-2.5 leading-relaxed"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="w-full h-11 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{submitting ? 'Signing in...' : 'Sign in with Email'}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-zinc-800" />
            <span className="px-3 text-xs text-zinc-500">or</span>
            <div className="flex-1 border-t border-zinc-800" />
          </div>

          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={submitting || googleLoading}
            className="w-full h-11 rounded-lg bg-[#0B0D11] border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer"
          >
            {googleLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
        </div>

        <p className="mt-5 text-center text-xs text-zinc-500 leading-relaxed">
          Protected by Firebase Auth ({firebaseRuntimeConfig?.projectId ?? 'local'}). Firestore data is isolated to your signed-in account.
        </p>
      </div>
    </main>
  );
}
