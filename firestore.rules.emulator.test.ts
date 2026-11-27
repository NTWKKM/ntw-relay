import test, { after, before, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { initializeApp as initializeAdminApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { recomputeStorageStats } from './lib/storage-backfill';
import { setAllowedUserStatusWithDb } from './lib/allowlist-service';

/**
 * Executes firestore.rules inside the Firestore emulator (run via `npm run test:rules`).
 * Complements the JS mirror in firestore.rules.test.ts with real rule evaluation.
 */

const OWNER = 'user_alpha_1';
const OWNER_EMAIL = 'owner@example.com';
const ADMIN_UID = 'admin_1';
const ADMIN_EMAIL = 'admin@example.com';
const PENDING_UID = 'user_pending_1';
const PENDING_EMAIL = 'pending@example.com';
const MAX_FILE_SIZE = 10485760;
const STATS = ['stats', 'storage'] as const;
const utf8 = new TextEncoder();

let env: RulesTestEnvironment;
let adminApp: App;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-relay',
    firestore: { rules: fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8') },
  });
  adminApp = initializeAdminApp({ projectId: 'demo-relay' }, 'backfill-test');
});

after(async () => {
  if (adminApp) await deleteApp(adminApp);
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed({
    [`allowed_users/${OWNER_EMAIL}`]: {
      email: OWNER_EMAIL,
      status: 'approved',
      role: 'user',
      updatedAt: new Date(),
    },
    [`allowed_users/${ADMIN_EMAIL}`]: {
      email: ADMIN_EMAIL,
      status: 'approved',
      role: 'admin',
      updatedAt: new Date(),
    },
  });
});

function ownerDb(): Firestore {
  return env
    .authenticatedContext(OWNER, { email: OWNER_EMAIL, email_verified: true })
    .firestore() as unknown as Firestore;
}

function adminDb(): Firestore {
  return env
    .authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL, email_verified: true })
    .firestore() as unknown as Firestore;
}

function userDb(uid: string, email: string, emailVerified = true): Firestore {
  return env
    .authenticatedContext(uid, { email, email_verified: emailVerified })
    .firestore() as unknown as Firestore;
}

function textDrop(content: string, extra: Record<string, unknown> = {}) {
  return {
    ownerId: OWNER,
    type: 'text',
    content,
    isCode: false,
    counted: true,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

function textBytes(content: string): number {
  return utf8.encode(content).byteLength;
}

/** Atomic drop create + /stats/storage create/update in one batch. */
function atomicCreate(db: Firestore, dropId: string, drop: Record<string, unknown>, totalBytes: number, statsExists: boolean) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'drops', dropId), drop);
  const stats = { totalBytes, lastDropId: dropId, updatedAt: serverTimestamp() };
  if (statsExists) batch.update(doc(db, ...STATS), stats);
  else batch.set(doc(db, ...STATS), stats);
  return batch.commit();
}

async function seed(docs: Record<string, Record<string, unknown>>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    for (const [p, data] of Object.entries(docs)) {
      await setDoc(doc(db, p), data);
    }
  });
}

test('standalone drop create without a /stats/storage write is denied', async () => {
  const db = ownerDb();
  await assertFails(setDoc(doc(db, 'drops', 'drop_solo_1'), textDrop('hello')));
});

test('drop create missing the counted marker is denied even with a stats write', async () => {
  const db = ownerDb();
  const { counted: _counted, ...uncounted } = textDrop('hello');
  await assertFails(atomicCreate(db, 'drop_nomark_1', uncounted, textBytes('hello'), false));
});

test('atomic drop + stats initialization, then atomic increment, succeed with exact bytes', async () => {
  const db = ownerDb();
  await assertSucceeds(atomicCreate(db, 'drop_a', textDrop('สวัสดี'), textBytes('สวัสดี'), false));
  const second = textBytes('สวัสดี') + textBytes('abc');
  await assertSucceeds(atomicCreate(db, 'drop_b', textDrop('abc'), second, true));
  const snap = await getDoc(doc(db, ...STATS));
  if (snap.data()?.totalBytes !== second) throw new Error(`unexpected totalBytes ${snap.data()?.totalBytes}`);
});

test('atomic create with an inflated byte claim is denied', async () => {
  const db = ownerDb();
  await assertFails(atomicCreate(db, 'drop_c', textDrop('abc'), 11000000, false));
});

test('file drop at the 10 MiB limit succeeds; fileSize above the limit is denied', async () => {
  const db = ownerDb();
  const file = (fileSize: number) =>
    textDrop('a.bin', { type: 'file', fileName: 'a.bin', fileSize, mimeType: 'application/octet-stream', chunkCount: 14 });
  await assertFails(atomicCreate(db, 'drop_big', file(MAX_FILE_SIZE + 1), MAX_FILE_SIZE + 1 + 5, false));
  await assertSucceeds(atomicCreate(db, 'drop_max', file(MAX_FILE_SIZE), MAX_FILE_SIZE + 5, false));
});

test('counted drop delete must decrement /stats/storage atomically', async () => {
  const db = ownerDb();
  await assertSucceeds(atomicCreate(db, 'drop_d', textDrop('abcd'), 4, false));
  await assertFails(deleteDoc(doc(db, 'drops', 'drop_d')));

  const batch = writeBatch(db);
  batch.delete(doc(db, 'drops', 'drop_d'));
  batch.update(doc(db, ...STATS), { totalBytes: 0, lastDropId: 'drop_d', updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
});

test('legacy (uncounted) drop can be deleted when /stats/storage is missing', async () => {
  await seed({
    'drops/drop_legacy_1': { ownerId: OWNER, type: 'text', content: 'old', createdAt: new Date() },
  });
  await assertSucceeds(deleteDoc(doc(ownerDb(), 'drops', 'drop_legacy_1')));
});

test('legacy (uncounted) drop delete may not decrement /stats/storage', async () => {
  await seed({
    'drops/drop_legacy_2': { ownerId: OWNER, type: 'text', content: 'oldold', createdAt: new Date() },
    'stats/storage': { totalBytes: 100, lastDropId: 'drop_prev', updatedAt: new Date() },
  });
  const db = ownerDb();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'drops', 'drop_legacy_2'));
  batch.update(doc(db, ...STATS), { totalBytes: 94, lastDropId: 'drop_legacy_2', updatedAt: serverTimestamp() });
  await assertFails(batch.commit());
});

test('owner may toggle isCode but not the counted marker', async () => {
  const db = ownerDb();
  await assertSucceeds(atomicCreate(db, 'drop_t', textDrop('x'), 1, false));
  await assertSucceeds(updateDoc(doc(db, 'drops', 'drop_t'), { isCode: true }));
  await assertFails(updateDoc(doc(db, 'drops', 'drop_t'), { counted: false }));
});

test('signed-in get on a missing drop returns non-existent; unauthenticated and cross-tenant gets are denied', async () => {
  const db = ownerDb();
  await assertSucceeds(atomicCreate(db, 'drop_existing_1', textDrop('secret'), 6, false));

  const missingSnap = await assertSucceeds(getDoc(doc(db, 'drops', 'drop_missing_1')));
  if (missingSnap.exists()) throw new Error('expected missing drop snapshot to have exists() === false');

  const unauthDb = env.unauthenticatedContext().firestore() as unknown as Firestore;
  await assertFails(getDoc(doc(unauthDb, 'drops', 'drop_missing_1')));

  const otherEmail = 'beta@example.com';
  await seed({
    [`allowed_users/${otherEmail}`]: {
      email: otherEmail,
      status: 'approved',
      role: 'user',
      updatedAt: new Date(),
    },
  });
  const otherDb = userDb('user_beta_2', otherEmail, true);
  await assertFails(getDoc(doc(otherDb, 'drops', 'drop_existing_1')));
});

// ---------------------------------------------------------------------------
// Admin SDK /stats/storage backfill (lib/storage-backfill.ts)
// ---------------------------------------------------------------------------

async function statsTotal(): Promise<number | undefined> {
  const snap = await getAdminFirestore(adminApp).collection('stats').doc('storage').get();
  return snap.get('totalBytes');
}

test('backfill dry run reports the recompute without writing', async () => {
  await seed({ 'drops/drop_old_1': { ownerId: OWNER, type: 'text', content: 'old', createdAt: new Date() } });
  const report = await recomputeStorageStats(getAdminFirestore(adminApp), { apply: false });
  if (report.applied || report.nextTotalBytes !== 3 || report.newlyCounted[0] !== 'drop_old_1') {
    throw new Error(JSON.stringify(report));
  }
  if ((await statsTotal()) !== undefined) throw new Error('dry run wrote /stats/storage');
});

test('backfill recomputes exact totals, marks legacy drops, skips unsizable ones, and fixes drift', async () => {
  const db = ownerDb();
  await assertSucceeds(atomicCreate(db, 'drop_new_1', textDrop('abcd'), 4, false));
  await seed({
    'drops/drop_old_1': {
      ownerId: OWNER, type: 'file', content: 'a.bin', fileName: 'a.bin', fileSize: 1000, chunkCount: 2, createdAt: new Date(),
    },
    'drops/drop_bad_1': { ownerId: OWNER, type: 'file', downloadUrl: 'https://x', createdAt: new Date() },
    // Drifted counter (e.g. drops counted before the marker existed)
    'stats/storage': { totalBytes: 999999, lastDropId: 'drop_new_1', updatedAt: new Date() },
  });

  const report = await recomputeStorageStats(getAdminFirestore(adminApp), { apply: true });
  const expected = 4 + 1000 + 5;
  if (!report.applied || report.nextTotalBytes !== expected || report.skipped[0]?.id !== 'drop_bad_1') {
    throw new Error(JSON.stringify(report));
  }
  if ((await statsTotal()) !== expected) throw new Error(`totalBytes ${await statsTotal()}`);

  // Backfilled drop is now counted: plain delete is denied, atomic decrement succeeds
  await assertFails(deleteDoc(doc(db, 'drops', 'drop_old_1')));
  const batch = writeBatch(db);
  batch.delete(doc(db, 'drops', 'drop_old_1'));
  batch.update(doc(db, ...STATS), { totalBytes: 4, lastDropId: 'drop_old_1', updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());

  // Unsizable legacy drop stays uncounted and remains deletable without a stats write
  await assertSucceeds(deleteDoc(doc(db, 'drops', 'drop_bad_1')));

  // Second run is idempotent
  const again = await recomputeStorageStats(getAdminFirestore(adminApp), { apply: true });
  if (again.newlyCounted.length !== 0 || again.nextTotalBytes !== 4) throw new Error(JSON.stringify(again));
});

test('backfilled drop with fractional legacy fileSize decrements by the truncated rules delta', async () => {
  await seed({
    'drops/drop_frac_1': { ownerId: OWNER, type: 'file', content: 'a', fileSize: 1.8, createdAt: new Date() },
    'drops/drop_keep_1': { ownerId: OWNER, type: 'text', content: 'x'.repeat(100), createdAt: new Date() },
  });
  const report = await recomputeStorageStats(getAdminFirestore(adminApp), { apply: true });
  if (report.nextTotalBytes !== 2 + 100) throw new Error(JSON.stringify(report));

  const db = ownerDb();
  const decrement = (totalBytes: number) => {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'drops', 'drop_frac_1'));
    batch.update(doc(db, ...STATS), { totalBytes, lastDropId: 'drop_frac_1', updatedAt: serverTimestamp() });
    return batch.commit();
  };
  await assertFails(decrement(102 - 3)); // Math.round(1.8) + 1 would be rejected
  await assertSucceeds(decrement(102 - 2)); // int(1.8) + 1 matches rules
});

test('backfill on an empty project writes nothing', async () => {
  const report = await recomputeStorageStats(getAdminFirestore(adminApp), { apply: true });
  if (report.applied || report.dropCount !== 0) throw new Error(JSON.stringify(report));
  if ((await statsTotal()) !== undefined) throw new Error('empty backfill created /stats/storage');
});

test('allowed_users: verified user can self-request pending only; cannot self-approve or become admin', async () => {
  const pending = userDb(PENDING_UID, PENDING_EMAIL);
  await assertFails(
    setDoc(doc(pending, 'allowed_users', PENDING_EMAIL), {
      email: PENDING_EMAIL,
      status: 'approved',
      role: 'user',
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(pending, 'allowed_users', PENDING_EMAIL), {
      email: PENDING_EMAIL,
      status: 'pending',
      role: 'admin',
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    setDoc(doc(pending, 'allowed_users', PENDING_EMAIL), {
      email: PENDING_EMAIL,
      status: 'pending',
      role: 'user',
      uid: PENDING_UID,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  // Pending user cannot access drops until approved
  await assertFails(
    atomicCreate(pending, 'drop_pending_1', textDrop('blocked', { ownerId: PENDING_UID }), textBytes('blocked'), false)
  );
});

test('allowed_users: admin can approve, reject, and delete others; non-admin is denied', async () => {
  const pending = userDb(PENDING_UID, PENDING_EMAIL);
  const admin = adminDb();
  const nonAdmin = ownerDb();

  await assertSucceeds(
    setDoc(doc(pending, 'allowed_users', PENDING_EMAIL), {
      email: PENDING_EMAIL,
      status: 'pending',
      role: 'user',
      uid: PENDING_UID,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  // Non-admin cannot approve or delete
  await assertFails(
    updateDoc(doc(nonAdmin, 'allowed_users', PENDING_EMAIL), {
      status: 'approved',
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(deleteDoc(doc(nonAdmin, 'allowed_users', PENDING_EMAIL)));

  // Admin can approve, then reject, then delete
  await assertSucceeds(
    updateDoc(doc(admin, 'allowed_users', PENDING_EMAIL), {
      status: 'approved',
      reviewedBy: ADMIN_EMAIL,
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(
    updateDoc(doc(admin, 'allowed_users', PENDING_EMAIL), {
      status: 'rejected',
      reviewedBy: ADMIN_EMAIL,
      updatedAt: serverTimestamp(),
    })
  );
  await assertSucceeds(deleteDoc(doc(admin, 'allowed_users', PENDING_EMAIL)));

  // Admin cannot delete their own record
  await assertFails(deleteDoc(doc(admin, 'allowed_users', ADMIN_EMAIL)));
});

test('allowed_users: status-only update preserves admin role in Firestore even when caller has stale user view', async () => {
  const promotedEmail = 'promoted@example.com';
  await seed({
    [`allowed_users/${promotedEmail}`]: {
      email: promotedEmail,
      status: 'pending',
      role: 'admin',
      updatedAt: new Date(),
    },
  });

  const admin = adminDb();
  await assertSucceeds(
    setAllowedUserStatusWithDb(admin, {
      email: promotedEmail,
      status: 'approved',
      adminEmail: ADMIN_EMAIL,
    })
  );

  const snap = await getDoc(doc(admin, 'allowed_users', promotedEmail));
  if (snap.data()?.status !== 'approved' || snap.data()?.role !== 'admin') {
    throw new Error(`expected approved admin, got ${JSON.stringify(snap.data())}`);
  }
});
