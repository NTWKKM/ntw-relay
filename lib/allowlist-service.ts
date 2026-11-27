'use client';

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

const ALLOWED_USERS_COLLECTION = 'allowed_users';

export type AllowlistStatus = 'pending' | 'approved' | 'rejected';

export interface AllowedUserRecord {
  email: string;
  status: AllowlistStatus;
  role: 'admin' | 'user';
  uid?: string;
  displayName?: string;
  requestedAt?: number;
  updatedAt?: number;
  reviewedBy?: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  return (
    normalized.length >= 3 &&
    normalized.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  );
}

function toMillis(ts: unknown): number | undefined {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return undefined;
}

function mapDocToAllowedUser(id: string, data: Record<string, unknown>): AllowedUserRecord {
  const status = data.status === 'approved' || data.status === 'rejected' ? data.status : 'pending';
  const role = data.role === 'admin' ? 'admin' : 'user';
  return {
    email: typeof data.email === 'string' ? data.email : id,
    status,
    role,
    uid: typeof data.uid === 'string' ? data.uid : undefined,
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    requestedAt: toMillis(data.requestedAt),
    updatedAt: toMillis(data.updatedAt),
    reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : undefined,
  };
}

export function subscribeToMyAllowlistStatus(
  email: string,
  onChange: (record: AllowedUserRecord | null) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  if (!db) {
    onChange(null);
    return () => {};
  }
  const normalized = normalizeEmail(email);
  const ref = doc(db, ALLOWED_USERS_COLLECTION, normalized);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(mapDocToAllowedUser(snap.id, snap.data() as Record<string, unknown>));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function requestAllowlistAccess(user: {
  email: string;
  uid: string;
  displayName?: string | null;
}): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const normalized = normalizeEmail(user.email);
  const ref = doc(db, ALLOWED_USERS_COLLECTION, normalized);
  const payload: Record<string, unknown> = {
    email: normalized,
    status: 'pending',
    role: 'user',
    uid: user.uid,
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const trimmedName = user.displayName?.trim();
  if (trimmedName) {
    payload.displayName = trimmedName.slice(0, 128);
  }
  await setDoc(ref, payload);
}

const STATUS_ORDER: Record<AllowlistStatus, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export function subscribeToAllAllowedUsers(
  onChange: (users: AllowedUserRecord[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  if (!db) {
    onChange([]);
    return () => {};
  }
  const ref = collection(db, ALLOWED_USERS_COLLECTION);
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((d) =>
        mapDocToAllowedUser(d.id, d.data() as Record<string, unknown>)
      );
      items.sort((a, b) => {
        const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (orderDiff !== 0) return orderDiff;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
      onChange(items);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function setAllowedUserStatus(params: {
  email: string;
  status: AllowlistStatus;
  adminEmail: string;
  role?: 'admin' | 'user';
}): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const normalized = normalizeEmail(params.email);
  if (!isValidEmailFormat(normalized)) {
    throw new Error('Invalid email address.');
  }
  const ref = doc(db, ALLOWED_USERS_COLLECTION, normalized);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const existingRole =
      snap.exists() && snap.data()?.role === 'admin' ? 'admin' : 'user';
    const nextRole = params.role ?? (snap.exists() ? existingRole : 'user');
    tx.set(
      ref,
      {
        email: normalized,
        status: params.status,
        role: nextRole,
        updatedAt: serverTimestamp(),
        reviewedBy: normalizeEmail(params.adminEmail),
      },
      { merge: true }
    );
  });
}

export async function removeAllowedUser(email: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const normalized = normalizeEmail(email);
  await deleteDoc(doc(db, ALLOWED_USERS_COLLECTION, normalized));
}
