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
  isValidEmailFormat,
  normalizeEmail,
  removeAllowedUser,
  setAllowedUserStatus,
  subscribeToAllAllowedUsers,
  type AllowedUserRecord,
  type AllowlistStatus,
} from '@/lib/allowlist-service';
import { signOutUser } from '@/lib/firebase';

const STATUS_LABEL: Record<AllowlistStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_BADGE_CLASS: Record<AllowlistStatus, string> = {
  pending:
    'bg-[#FEF6E7] text-[#8A5A10] border-[#F3D9A4] dark:bg-[#2C2212] dark:text-[#E7B965] dark:border-[#4D3B1A]',
  approved:
    'bg-[#ECFDF3] text-[#067647] border-[#ABEFC6] dark:bg-[#10281B] dark:text-[#6CE9A6] dark:border-[#1E4D33]',
  rejected:
    'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA] dark:bg-[#2A1716] dark:text-[#F97066] dark:border-[#552623]',
};

function formatDateTime(ms?: number): string {
  if (!ms) return '—';
  return new Intl.DateTimeFormat('th-TH', {
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
      <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] p-6 space-y-4">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-medium">
            Admin access only
          </h1>
          <p className="text-sm text-[#6B655C] dark:text-[#968F84]">
            หน้านี้เปิดให้เฉพาะบัญชีผู้ดูแลระบบ (Admin) เท่านั้น
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#181715] dark:bg-[#F3EFE8] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium"
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
    if (!isValidEmailFormat(normalized)) {
      setError('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }

    setBusyKey(`add:${normalized}`);
    const existing = users.find((u) => normalizeEmail(u.email) === normalized);
    try {
      await setAllowedUserStatus({
        email: normalized,
        status: 'approved',
        adminEmail: user?.email ?? '',
        role: existing?.role,
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
    const existing = users.find((u) => normalizeEmail(u.email) === normalizeEmail(email));
    try {
      await setAllowedUserStatus({
        email,
        status,
        adminEmail: user?.email ?? '',
        role: existing?.role,
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
    <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex flex-col">
      <header className="h-14 border-b border-[#E2DCD0] dark:border-[#272420]">
        <div className="max-w-4xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Workspace</span>
            </Link>
            <span className="text-[#CFC8BC] dark:text-[#3A3630]">/</span>
            <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight flex items-center gap-1.5 whitespace-nowrap">
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Allowlist Admin</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              className="h-8 w-8 rounded-lg text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center justify-center cursor-pointer"
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
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center gap-1.5 cursor-pointer"
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
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight">
              User Access Allowlist
            </h1>
            <p className="text-sm text-[#6B655C] dark:text-[#968F84]">
              อนุมัติผู้ใช้ใหม่ที่เข้าผ่าน Google Login หรือเพิ่มอีเมลล่วงหน้า
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#F3D9A4] bg-[#FEF6E7] text-[#8A5A10] dark:bg-[#2C2212] dark:text-[#E7B965] dark:border-[#4D3B1A]">
              <Clock className="w-3 h-3" aria-hidden="true" />
              Pending: {counts.pending}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#ABEFC6] bg-[#ECFDF3] text-[#067647] dark:bg-[#10281B] dark:text-[#6CE9A6] dark:border-[#1E4D33]">
              <UserCheck className="w-3 h-3" aria-hidden="true" />
              Approved: {counts.approved}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#E2DCD0] bg-[#FCFBF8] text-[#6B655C] dark:bg-[#1A1917] dark:text-[#968F84] dark:border-[#2C2925]">
              <UserX className="w-3 h-3" aria-hidden="true" />
              Rejected: {counts.rejected}
            </span>
          </div>
        </div>

        {/* Add / Pre-approve form */}
        <form
          onSubmit={handleAddPreapproved}
          className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] p-4 flex flex-col sm:flex-row gap-3"
        >
          <input
            type="email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Add email to pre-approve (e.g. friend@gmail.com)"
            className="flex-1 h-9 px-3 rounded-lg bg-[#F5F2EB] dark:bg-[#121110] border border-[#DDD6C8] dark:border-[#2E2A24] text-sm placeholder:text-[#9A9388] focus:outline-none focus:border-[#181715] dark:focus:border-[#F3EFE8]"
          />
          <button
            type="submit"
            disabled={busyKey !== null || !newEmail.trim()}
            className="h-9 px-4 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add &amp; Approve</span>
          </button>
        </form>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] text-[#B42318] dark:border-[#552623] dark:bg-[#2A1716] dark:text-[#F97066] px-4 py-2.5 text-xs"
          >
            {error}
          </div>
        )}

        {/* List */}
        <div className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] divide-y divide-[#EAE5DB] dark:divide-[#272420]">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[#DDD6C8] dark:border-[#2C2925] border-t-[#181715] dark:border-t-[#F3EFE8] animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B655C] dark:text-[#968F84]">
              ยังไม่มีรายการใน Allowlist
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
                      <span className="font-mono text-sm font-medium break-all">
                        {item.email}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_BADGE_CLASS[item.status]}`}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                      {item.role === 'admin' && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-[#D8D1C4] dark:border-[#34302A] text-[#5D5850] dark:text-[#A8A196]">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B655C] dark:text-[#968F84]">
                      {item.displayName ? `${item.displayName} · ` : ''}
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
                          className="h-8 px-3 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                          className="h-8 px-3 rounded-lg border border-[#D8D1C4] dark:border-[#34302A] text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#B42318] dark:hover:text-[#F97066] hover:bg-[#FEF3F2] dark:hover:bg-[#2A1716] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                        className="h-8 w-8 rounded-lg text-[#787268] hover:text-[#B42318] dark:hover:text-[#F97066] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
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
