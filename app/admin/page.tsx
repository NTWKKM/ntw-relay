'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock,
  LogOut,
  Moon,
  Plus,
  Shield,
  Sun,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { AuthGuard, useAuthUser } from '@/components/AuthGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useMaterialTheme } from '@/components/ThemeProvider';
import {
  normalizeEmail,
  removeAllowedUser,
  subscribeToAllAllowedUsers,
  type AllowedUserRecord,
  type AllowlistStatus,
} from '@/lib/allowlist-service';
import {
  submitAllowlistStatusChange,
  submitPreapprovedEmail,
} from '@/lib/admin-allowlist-actions';
import { signOutUser } from '@/lib/firebase';

const STATUS_LABEL: Record<AllowlistStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<AllowlistStatus, string> = {
  pending: 'bg-paper-2 text-warning border-rule',
  approved: 'bg-paper-2 text-success border-rule',
  rejected: 'bg-paper-2 text-error border-rule',
};

function formatDateTime(ms?: number): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

function AdminAllowlistContent() {
  const { user, isAdmin } = useAuthUser();
  const { theme, toggleTheme } = useMaterialTheme();

  const [users, setUsers] = useState<AllowedUserRecord[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [newEmail, setNewEmail] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToAllAllowedUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'Failed to load allowlist.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const counts = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        acc[u.status] += 1;
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0 }
    );
  }, [users]);

  if (!isAdmin) {
    return (
      <div className="min-h-dvh bg-desk text-ink flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-card coral-stock p-6 space-y-4">
          <h1 className="font-display text-lg font-semibold">
            Admin access only
          </h1>
          <p className="text-sm text-muted">
            This page is restricted to administrator accounts.
          </p>
          <Link
            href="/"
            className="coral-btn-ink inline-flex items-center gap-1.5 h-9 px-3.5 rounded-input text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Workspace</span>
          </Link>
        </div>
      </div>
    );
  }

  async function handleAddPreapproved(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = normalizeEmail(newEmail);
    setBusyKey(`add:${normalized}`);
    try {
      await submitPreapprovedEmail({
        email: newEmail,
        adminEmail: user?.email ?? '',
      });
      setNewEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleStatusChange(email: string, status: AllowlistStatus) {
    setError(null);
    setBusyKey(`${status}:${email}`);
    try {
      await submitAllowlistStatusChange({
        email,
        status,
        adminEmail: user?.email ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(email: string) {
    setError(null);
    setBusyKey(`remove:${email}`);
    try {
      await removeAllowedUser(email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="min-h-dvh bg-desk text-ink flex flex-col">
      <header className="h-14 border-b border-rule bg-paper/80">
        <div className="max-w-4xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="h-8 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Workspace</span>
            </Link>
            <span className="text-rule-2">/</span>
            <span className="font-display text-sm font-semibold tracking-tight flex items-center gap-1.5 whitespace-nowrap">
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Allowlist Admin</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="h-8 w-8 rounded-input text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer"
            >
              {theme === 'light' ? (
                <Moon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void signOutUser()}
              className="h-8 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              User Access Allowlist
            </h1>
            <p className="text-sm text-muted">
              Approve users who signed in with Google or pre-approve emails below.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-rule bg-paper-2 text-warning">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Pending: {counts.pending}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-rule bg-paper-2 text-success">
              <UserCheck className="w-3 h-3" aria-hidden="true" />
              Approved: {counts.approved}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill border border-rule bg-cotton text-muted">
              <UserX className="w-3 h-3" aria-hidden="true" />
              Rejected: {counts.rejected}
            </span>
          </div>
        </div>

        {/* Add / Pre-approve form */}
        <form
          onSubmit={handleAddPreapproved}
          className="rounded-card coral-stock p-4 flex flex-col sm:flex-row gap-3"
        >
          <input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Add email to pre-approve (e.g. friend@example.com)"
            className="mwg-input flex-1 h-9 px-3 rounded-input bg-paper border border-rule-2 text-sm text-ink placeholder:text-muted focus:border-focus transition-colors"
          />
          <button
            type="submit"
            disabled={busyKey !== null || !newEmail.trim()}
            className="coral-btn-ink h-9 px-4 rounded-input text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add &amp; Approve</span>
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="rounded-input border border-error/30 bg-paper-2 text-error px-4 py-2.5 text-xs"
          >
            {error}
          </div>
        )}

        {/* List */}
        <div className="rounded-card coral-stock divide-y divide-rule">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-rule-2 border-t-ink animate-spin keep-motion" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No entries in the allowlist yet.
            </div>
          ) : (
            users.map((item) => {
              const isSelf = normalizeEmail(item.email) === normalizeEmail(user?.email ?? '');
              const isRowBusy = busyKey?.endsWith(`:${item.email}`) ?? false;

              return (
                <div
                  key={item.email}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-outlier text-sm font-medium break-all text-ink">
                        {item.email}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-pill border ${STATUS_BADGE_CLASS[item.status]}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                      {item.role === 'admin' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-pill border border-rule text-muted">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {item.displayName ? `${item.displayName}, ` : ''}
                      Updated {formatDateTime(item.updatedAt)}
                    </p>
                  </div>

                  {!isSelf && (
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status !== 'approved' && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          onClick={() => void handleStatusChange(item.email, 'approved')}
                          className="coral-btn-ink h-8 px-3 rounded-input text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Approve</span>
                        </button>
                      )}
                      {item.status !== 'rejected' && (
                        <button
                          type="button"
                          disabled={isRowBusy}
                          onClick={() => void handleStatusChange(item.email, 'rejected')}
                          className="coral-btn-secondary h-8 px-3 rounded-input text-xs font-medium text-ink-2 hover:text-error flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{item.status === 'approved' ? 'Revoke' : 'Reject'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isRowBusy}
                        onClick={() => void handleRemove(item.email)}
                        title="Remove from allowlist"
                        aria-label={`Remove ${item.email}`}
                        className="h-8 w-8 rounded-input text-muted hover:text-error hover:bg-paper-2 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

export default function AdminPage() {
  return (
    <ErrorBoundary>
      <AuthGuard>
        <AdminAllowlistContent />
      </AuthGuard>
    </ErrorBoundary>
  );
}
