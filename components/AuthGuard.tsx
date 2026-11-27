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
    errorSource: 'request' | 'listener' | null;
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
            errorSource: prev?.uid === user.uid ? prev.errorSource : null,
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
                errorSource: 'request',
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
          errorSource: null,
        });
      },
      (err) => {
        setSubscriptionState({
          uid: user.uid,
          state: 'pending',
          isAdmin: false,
          error: err instanceof Error ? err.message : 'Unable to verify access status.',
          errorSource: 'listener',
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
        className="min-h-dvh bg-desk text-ink flex flex-col items-center justify-center gap-3 p-6"
      >
        <div className="w-7 h-7 rounded-full border-2 border-rule-2 border-t-ink animate-spin keep-motion" />
        <p className="text-xs text-muted">
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
        setActionMessage('Verification email sent. Please check your inbox.');
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
      const isListenerError = subscriptionState?.uid === user.uid && subscriptionState.errorSource === 'listener';
      setSubscriptionState((prev) =>
        prev && prev.uid === user.uid ? { ...prev, error: null, errorSource: null } : prev
      );
      applyUserRefresh();
      if (isListenerError) {
        setActionBusy(null);
        return;
      }
      try {
        await requestAllowlistAccess({
          email: user.email,
          uid: user.uid,
          displayName: user.displayName,
        });
      } catch (err) {
        setSubscriptionState({
          uid: user.uid,
          state: 'pending',
          isAdmin: false,
          error: err instanceof Error ? err.message : 'Failed to submit access request.',
          errorSource: 'request',
        });
      } finally {
        setActionBusy(null);
      }
    }

    return (
      <div className="min-h-dvh bg-desk text-ink flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card coral-stock p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-input bg-paper-2 flex items-center justify-center shrink-0">
              {isRejected || isUnverified ? (
                <ShieldAlert className="w-4 h-4 text-error" aria-hidden="true" />
              ) : (
                <Clock className="w-4 h-4 text-warning" aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <h1 className="font-display text-lg font-semibold tracking-tight text-ink">
                {isRejected
                  ? 'Access denied'
                  : isUnverified
                    ? 'Email not verified'
                    : 'Waiting for approval'}
              </h1>
              <p className="text-xs text-muted break-all">
                Signed in as <span className="font-outlier text-ink">{user?.email}</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-ink-2 leading-relaxed">
            {isRejected
              ? 'This account is not authorized to access Relay. Please contact an administrator.'
              : isUnverified
                ? 'Please verify your email address before continuing.'
                : 'Access request submitted. Please wait for an administrator to approve your account (this page unlocks automatically once approved).'}
          </p>

          {actionMessage && (
            <p className="text-xs text-ink-2 bg-paper-2 border border-rule rounded-input px-3 py-2">
              {actionMessage}
            </p>
          )}

          {requestError && (
            <p
              role="alert"
              className="text-xs text-error bg-paper-2 border border-error/30 rounded-input px-3 py-2"
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
                  className="coral-btn-secondary h-9 px-3.5 rounded-input text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Resend email</span>
                </button>
                <button
                  type="button"
                  disabled={actionBusy !== null}
                  onClick={() => void handleRefreshVerification()}
                  className="coral-btn-ink h-9 px-3.5 rounded-input text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="coral-btn-ink h-9 px-3.5 rounded-input text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="coral-btn-secondary h-9 px-3.5 rounded-input text-xs font-medium text-ink-2 flex items-center gap-1.5 cursor-pointer"
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
