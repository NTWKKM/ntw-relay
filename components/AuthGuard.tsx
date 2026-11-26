'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { resolveAuthGuardDecision } from '@/lib/auth-guard';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  refreshUser: (updated: User) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: !isFirebaseConfigured,
  refreshUser: () => {},
});

export function useAuthUser(): AuthContextValue {
  return useContext(AuthContext);
}

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Protects wrapped routes/components (such as Workspace) so unauthenticated users
 * are redirected to /login and Firestore listeners never mount without an active Firebase session.
 */
export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured || !auth);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const decision = resolveAuthGuardDecision({
    isFirebaseConfigured: Boolean(isFirebaseConfigured && auth),
    authReady,
    hasUser: Boolean(user),
  });

  useEffect(() => {
    if (decision === 'redirect_login') {
      router.replace(redirectTo);
    }
  }, [decision, redirectTo, router]);

  if (decision === 'loading' || decision === 'redirect_login') {
    return (
      <div
        role="status"
        aria-label={decision === 'redirect_login' ? 'Redirecting to login' : 'Checking authentication'}
        className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex flex-col items-center justify-center gap-3 p-6"
      >
        <div className="w-7 h-7 rounded-full border-2 border-[#DDD6C8] dark:border-[#2C2925] border-t-[#181715] dark:border-t-[#F3EFE8] animate-spin" />
        <p className="text-xs text-[#787268] dark:text-[#8A8378]">
          {decision === 'redirect_login' ? 'Redirecting to sign in...' : 'Verifying session...'}
        </p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        refreshUser: (updated) => setUser(updated),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
