'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Clock, LogOut, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import {
  auth,
  isFirebaseConfigured,
  reloadCurrentUser,
  sendVerificationToCurrentUser,
  signOutUser,
} from '@/lib/firebase';
import { resolveAuthGuardDecision, type AllowlistGateState } from '@/lib/auth-guard';
import {
  requestAllowlistAccess,
  subscribeToMyAllowlistStatus,
} from '@/lib/allowlist-service';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  userVersion: number;
  refreshUser: (updated?: User) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authReady: !isFirebaseConfigured,
  isAdmin: false,
  userVersion: 0,
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
 * are redirected to /login and Firestore listeners never mount without an active,
 * allowlist-approved Firebase session.
 */
export function AuthGuard({ children, redirectTo = '/login' }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userVersion, setUserVersion] = useState(0);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured || !auth);
  const [subscriptionState, setSubscriptionState] = useState<{
    uid: string;
    state: AllowlistGateState;
    isAdmin: boolean;
    error: string | null;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState<'resend' | 'refresh' | 'retry' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const requestedUidsRef = useRef<Set<string>>(new Set());

  const applyUserRefresh = (updated?: User | null) => {
    if (updated) setUser(updated);
    setUserVersion((v) => v + 1);
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setSubscriptionState(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) return;
    if (!user || !user.emailVerified || !user.email) return;

    const unsub = subscribeToMyAllowlistStatus(
      user.email,
      (record) => {
        if (!record) {
          setSubscriptionState((prev) => ({
            uid: user.uid,
            state: 'pending',
            isAdmin: false,
            error: prev?.uid === user.uid ? prev.error : null,
          }));
          if (!requestedUidsRef.current.has(user.uid)) {
            requestedUidsRef.current.add(user.uid);
            void requestAllowlistAccess({
              email: user.email!,
              uid: user.uid,
              displayName: user.displayName,
            }).catch((err) => {
              setSubscriptionState({
                uid: user.uid,
                state: 'pending',
                isAdmin: false,
                error: err instanceof Error ? err.message : 'Failed to submit access request.',
              });
            });
          }
          return;
        }
        setSubscriptionState({
          uid: user.uid,
          state: record.status,
          isAdmin: record.role === 'admin' && record.status === 'approved',
          error: null,
        });
      },
      (err) => {
        setSubscriptionState({
          uid: user.uid,
          state: 'pending',
          isAdmin: false,
          error: err instanceof Error ? err.message : 'Unable to verify access status.',
        });
      }
    );

    return () => unsub();
  }, [user, userVersion]);

  const allowlistState: AllowlistGateState | undefined = !user
    ? undefined
    : !user.emailVerified || !user.email
      ? 'unverified'
      : subscriptionState?.uid === user.uid
        ? subscriptionState.state
        : 'loading';
  const isAdmin = Boolean(user && subscriptionState?.uid === user.uid && subscriptionState.isAdmin);
  const requestError =
    user && subscriptionState?.uid === user.uid ? subscriptionState.error : null;

  const decision = resolveAuthGuardDecision({
    isFirebaseConfigured: Boolean(isFirebaseConfigured && auth),
    authReady,
    hasUser: Boolean(user),
    allowlistState,
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

  if (decision === 'pending_approval') {
    const isRejected = allowlistState === 'rejected';
    const isUnverified = allowlistState === 'unverified';

    async function handleResendVerification() {
      setActionMessage(null);
      setActionBusy('resend');
      try {
        await sendVerificationToCurrentUser();
        setActionMessage('ส่งอีเมลยืนยันแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ');
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : 'Failed to send verification email.');
      } finally {
        setActionBusy(null);
      }
    }

    async function handleRefreshVerification() {
      setActionMessage(null);
      setActionBusy('refresh');
      try {
        const updated = await reloadCurrentUser();
        applyUserRefresh(updated);
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : 'Failed to refresh session.');
      } finally {
        setActionBusy(null);
      }
    }

    async function handleRetryAccessRequest() {
      if (!user?.email) return;
      setActionMessage(null);
      setActionBusy('retry');
      setSubscriptionState((prev) =>
        prev && prev.uid === user.uid ? { ...prev, error: null } : prev
      );
      try {
        await requestAllowlistAccess({
          email: user.email,
          uid: user.uid,
          displayName: user.displayName,
        });
        applyUserRefresh();
      } catch (err) {
        setSubscriptionState({
          uid: user.uid,
          state: 'pending',
          isAdmin: false,
          error: err instanceof Error ? err.message : 'Failed to submit access request.',
        });
      } finally {
        setActionBusy(null);
      }
    }

    return (
      <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#EAE5DB] dark:bg-[#24221E] flex items-center justify-center shrink-0">
              {isRejected || isUnverified ? (
                <ShieldAlert className="w-4 h-4 text-[#B42318] dark:text-[#F97066]" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-[#8A6D3B] dark:text-[#E0B973]" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-lg font-medium tracking-tight">
                {isRejected
                  ? 'Access denied'
                  : isUnverified
                    ? 'Email not verified'
                    : 'Waiting for approval'}
              </h1>
              <p className="text-xs text-[#6B655C] dark:text-[#968F84] break-all">
                Signed in as <span className="font-mono text-[#181715] dark:text-[#F3EFE8]">{user?.email}</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-[#4F4A42] dark:text-[#B9B2A6] leading-relaxed">
            {isRejected
              ? 'บัญชีนี้ไม่ได้รับอนุญาตให้เข้าใช้งานระบบ กรุณาติดต่อผู้ดูแลระบบ'
              : isUnverified
                ? 'กรุณายืนยันอีเมลของบัญชีก่อนเข้าใช้งาน'
                : 'ส่งคำขอเข้าใช้งานแล้ว กรุณารอผู้ดูแลระบบอนุมัติสิทธิ์ (หน้านี้จะปลดล็อกให้อัตโนมัติเมื่อได้รับการอนุมัติ)'}
          </p>

          {actionMessage && (
            <p className="text-xs text-[#3D3A35] dark:text-[#DFD9CE] bg-[#EFECE4] dark:bg-[#24221E] border border-[#DDD6C8] dark:border-[#34302A] rounded-lg px-3 py-2">
              {actionMessage}
            </p>
          )}

          {requestError && (
            <p
              role="alert"
              className="text-xs text-[#B42318] dark:text-[#F97066] bg-[#FEF3F2] dark:bg-[#2A1716] border border-[#FECDCA] dark:border-[#552623] rounded-lg px-3 py-2"
            >
              {requestError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {isUnverified && (
              <>
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => void handleResendVerification()}
                  className="h-9 px-3.5 rounded-lg border border-[#D8D1C4] dark:border-[#34302A] text-xs font-medium text-[#3D3A35] dark:text-[#DFD9CE] hover:bg-[#EFECE4] dark:hover:bg-[#25221E] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resend email</span>
                </button>
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => void handleRefreshVerification()}
                  className="h-9 px-3.5 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Refresh</span>
                </button>
              </>
            )}

            {!isRejected && !isUnverified && requestError && (
              <button
                type="button"
                disabled={actionBusy !== null}
                onClick={() => void handleRetryAccessRequest()}
                className="h-9 px-3.5 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="h-9 px-3.5 rounded-lg border border-[#D8D1C4] dark:border-[#34302A] text-xs font-medium text-[#3D3A35] dark:text-[#DFD9CE] hover:bg-[#EFECE4] dark:hover:bg-[#25221E] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        isAdmin,
        userVersion,
        refreshUser: applyUserRefresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
