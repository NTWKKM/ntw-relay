import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dirty Dozen Security Policy Verification Suite
 * Evaluates both the static ruleset gates and an exact JS mirror of isValidDrop /
 * action rules against all 12 adversarial payloads from security_spec.md.
 */

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const DRAFT_PATH = path.resolve(process.cwd(), 'DRAFT_firestore.rules');
const activeRulesPath = fs.existsSync(RULES_PATH) ? RULES_PATH : DRAFT_PATH;
const rulesText = fs.readFileSync(activeRulesPath, 'utf8');

interface MockAuth {
  uid: string;
  emailVerified: boolean;
}

const REQUEST_TIME = 1764100000000;
const MAX_FILE_SIZE = 10485760;
const MAX_CHUNK_BYTES = 786432;
const MAX_STORAGE_BYTES = 10737418240;
const MAX_STORAGE_DELTA = 11000000;
const ALLOWED_KEYS = new Set([
  'ownerId',
  'type',
  'content',
  'fileName',
  'fileSize',
  'mimeType',
  'chunkCount',
  'previewDataUrl',
  'isCode',
  'createdAt',
]);
const REQUIRED_KEYS = ['ownerId', 'type', 'content', 'createdAt'];
const CHUNK_KEYS = ['ownerId', 'index', 'data'];
const STORAGE_STATS_KEYS = ['totalBytes', 'lastDropId', 'updatedAt'];

interface MockDropBatchState {
  beforeDrops: Record<string, Record<string, unknown>>;
  afterDrops: Record<string, Record<string, unknown>>;
}

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function isValidDrop(data: Record<string, unknown>, auth: MockAuth | null): boolean {
  if (!auth) return false;
  const keys = Object.keys(data);
  if (!REQUIRED_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => ALLOWED_KEYS.has(k))) return false;
  if (typeof data.ownerId !== 'string' || !isValidId(data.ownerId) || data.ownerId !== auth.uid) return false;
  if (data.type !== 'text' && data.type !== 'image' && data.type !== 'file') return false;
  if (typeof data.content !== 'string' || data.content.length > 50000) return false;
  if (typeof data.createdAt !== 'number') return false;
  if ('fileName' in data && (typeof data.fileName !== 'string' || data.fileName.length > 255)) return false;
  if ('fileSize' in data && (typeof data.fileSize !== 'number' || data.fileSize < 0 || data.fileSize > MAX_FILE_SIZE)) return false;
  if ('mimeType' in data && (typeof data.mimeType !== 'string' || data.mimeType.length > 128)) return false;
  if (
    'chunkCount' in data &&
    (typeof data.chunkCount !== 'number' || !Number.isInteger(data.chunkCount) || data.chunkCount < 0 || data.chunkCount > 14)
  ) {
    return false;
  }
  if (
    'previewDataUrl' in data &&
    (typeof data.previewDataUrl !== 'string' ||
      data.previewDataUrl.length > 160000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.previewDataUrl))
  ) {
    return false;
  }
  if ('isCode' in data && typeof data.isCode !== 'boolean') return false;
  return true;
}

function isValidChunk(data: Record<string, unknown>, chunkId: string, auth: MockAuth | null): boolean {
  if (!auth) return false;
  const keys = Object.keys(data);
  if (!CHUNK_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => CHUNK_KEYS.includes(k))) return false;
  if (typeof data.ownerId !== 'string' || data.ownerId.length < 1 || data.ownerId.length > 128 || data.ownerId !== auth.uid) {
    return false;
  }
  if (typeof data.index !== 'number' || !Number.isInteger(data.index) || data.index < 0 || data.index > 13) return false;
  if (!/^[0-9]{1,2}$/.test(chunkId) || chunkId !== String(data.index)) return false;
  if (!(data.data instanceof Uint8Array)) return false;
  if (data.data.byteLength < 1 || data.data.byteLength > MAX_CHUNK_BYTES) return false;
  return true;
}

function canGet(auth: MockAuth | null, dropId: string, existing: Record<string, unknown>): boolean {
  return Boolean(auth && isValidId(dropId) && existing.ownerId === auth.uid);
}

function canList(auth: MockAuth | null, resource: Record<string, unknown>): boolean {
  return Boolean(auth && resource.ownerId === auth.uid);
}

function canCreate(auth: MockAuth | null, dropId: string, incoming: Record<string, unknown>): boolean {
  return Boolean(
    auth &&
      auth.emailVerified === true &&
      isValidId(dropId) &&
      isValidDrop(incoming, auth) &&
      incoming.createdAt === REQUEST_TIME
  );
}

function canUpdate(
  auth: MockAuth | null,
  dropId: string,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): boolean {
  if (!auth || !auth.emailVerified || !isValidId(dropId)) return false;
  if (!isValidDrop(incoming, auth)) return false;
  if (existing.ownerId !== auth.uid) return false;
  if (incoming.ownerId !== existing.ownerId || incoming.createdAt !== existing.createdAt) return false;
  const changedKeys = Object.keys({ ...existing, ...incoming }).filter((k) => existing[k] !== incoming[k]);
  return changedKeys.every((k) => k === 'isCode');
}

function canGetChunk(auth: MockAuth | null, dropId: string, chunkId: string, existing: Record<string, unknown>): boolean {
  return Boolean(auth && isValidId(dropId) && /^[0-9]{1,2}$/.test(chunkId) && existing.ownerId === auth.uid);
}

function canListChunk(auth: MockAuth | null, resource: Record<string, unknown>): boolean {
  return Boolean(auth && resource.ownerId === auth.uid);
}

function canCreateChunk(
  auth: MockAuth | null,
  dropId: string,
  chunkId: string,
  incoming: Record<string, unknown>
): boolean {
  return Boolean(auth && auth.emailVerified === true && isValidId(dropId) && isValidChunk(incoming, chunkId, auth));
}

function canUpdateChunk(
  _auth: MockAuth | null,
  _dropId: string,
  _chunkId: string,
  _existing: Record<string, unknown>,
  _incoming: Record<string, unknown>
): boolean {
  return false;
}

function canDeleteChunk(
  auth: MockAuth | null,
  dropId: string,
  chunkId: string,
  existing: Record<string, unknown>
): boolean {
  return Boolean(
    auth && auth.emailVerified === true && isValidId(dropId) && /^[0-9]{1,2}$/.test(chunkId) && existing.ownerId === auth.uid
  );
}

function isValidStorageStats(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  if (!STORAGE_STATS_KEYS.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => STORAGE_STATS_KEYS.includes(k))) return false;
  if (
    typeof data.totalBytes !== 'number' ||
    !Number.isInteger(data.totalBytes) ||
    data.totalBytes < 0 ||
    data.totalBytes > MAX_STORAGE_BYTES
  ) {
    return false;
  }
  if (typeof data.lastDropId !== 'string' || !isValidId(data.lastDropId)) return false;
  if (typeof data.updatedAt !== 'number') return false;
  return true;
}

const utf8Encoder = new TextEncoder();

function dropStorageBytes(d: Record<string, unknown>): number {
  const fileBytes = 'fileSize' in d ? Math.trunc(d.fileSize as number) : 0;
  const contentBytes = utf8Encoder.encode(d.content as string).byteLength;
  const previewBytes = 'previewDataUrl' in d ? (d.previewDataUrl as string).length : 0;
  return Math.min(MAX_STORAGE_DELTA, fileBytes + contentBytes + previewBytes);
}

function isAtomicDropCreate(auth: MockAuth | null, dropId: string, batch: MockDropBatchState): boolean {
  if (!auth) return false;
  const existedBefore = Object.prototype.hasOwnProperty.call(batch.beforeDrops, dropId);
  const existsAfter = Object.prototype.hasOwnProperty.call(batch.afterDrops, dropId);
  return !existedBefore && existsAfter && batch.afterDrops[dropId]?.ownerId === auth.uid;
}

function isAtomicDropDelete(auth: MockAuth | null, dropId: string, batch: MockDropBatchState): boolean {
  if (!auth) return false;
  const existedBefore = Object.prototype.hasOwnProperty.call(batch.beforeDrops, dropId);
  const existsAfter = Object.prototype.hasOwnProperty.call(batch.afterDrops, dropId);
  return existedBefore && !existsAfter && batch.beforeDrops[dropId]?.ownerId === auth.uid;
}

function canGetStorageStats(auth: MockAuth | null): boolean {
  return Boolean(auth);
}

function canListStorageStats(_auth: MockAuth | null): boolean {
  return false;
}

function canCreateStorageStats(
  auth: MockAuth | null,
  incoming: Record<string, unknown>,
  batch: MockDropBatchState
): boolean {
  if (!auth || auth.emailVerified !== true) return false;
  if (!isValidStorageStats(incoming)) return false;
  if (incoming.updatedAt !== REQUEST_TIME) return false;
  const dropId = incoming.lastDropId as string;
  if (!isAtomicDropCreate(auth, dropId, batch)) return false;
  const createdDrop = batch.afterDrops[dropId];
  return incoming.totalBytes === dropStorageBytes(createdDrop);
}

function canUpdateStorageStats(
  auth: MockAuth | null,
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  batch: MockDropBatchState
): boolean {
  if (!auth || auth.emailVerified !== true) return false;
  if (!isValidStorageStats(incoming)) return false;
  if (typeof existing.totalBytes !== 'number' || !Number.isInteger(existing.totalBytes)) return false;
  if (incoming.updatedAt !== REQUEST_TIME) return false;
  const incBytes = incoming.totalBytes as number;
  const extBytes = existing.totalBytes as number;
  const dropId = incoming.lastDropId as string;
  const validCreateTransition =
    isAtomicDropCreate(auth, dropId, batch) &&
    incBytes === Math.min(MAX_STORAGE_BYTES, extBytes + dropStorageBytes(batch.afterDrops[dropId]));
  const validDeleteTransition =
    isAtomicDropDelete(auth, dropId, batch) &&
    incBytes === Math.max(0, extBytes - dropStorageBytes(batch.beforeDrops[dropId]));
  return validCreateTransition || validDeleteTransition;
}

function canDeleteStorageStats(_auth: MockAuth | null): boolean {
  return false;
}

const ownerAuth: MockAuth = { uid: 'user_alpha_1', emailVerified: true };
const attackerAuth: MockAuth = { uid: 'user_beta_2', emailVerified: true };
const unverifiedAuth: MockAuth = { uid: 'user_alpha_1', emailVerified: false };

const validDrop: Record<string, unknown> = {
  ownerId: 'user_alpha_1',
  type: 'text',
  content: 'สวัสดี Personal Drop https://example.com',
  isCode: false,
  createdAt: REQUEST_TIME,
};

const validChunk: Record<string, unknown> = {
  ownerId: 'user_alpha_1',
  index: 0,
  data: new Uint8Array([1, 2, 3, 4]),
};

test('Rules file enforces all mandatory Eight Pillars structural clauses', () => {
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /allow list:\s*if isSignedIn\(\)\s*&&\s*resource\.data\.ownerId == request\.auth\.uid;/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(\['isCode'\]\)/);
  assert.match(rulesText, /data\.data is bytes/);
});

test('Dirty Dozen #1–#3: Unauthenticated, cross-tenant get, and unscoped list are denied', () => {
  assert.equal(canGet(null, 'drop_1', validDrop), false);
  assert.equal(canList(null, validDrop), false);
  assert.equal(canGet(attackerAuth, 'drop_1', validDrop), false);
  assert.equal(canList(attackerAuth, validDrop), false);
});

test('Dirty Dozen #4–#6: Identity spoofing, unverified email, and shadow fields are denied', () => {
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, ownerId: 'user_beta_2' }), false);
  assert.equal(canCreate(unverifiedAuth, 'drop_1', validDrop), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, isAdmin: true }), false);
});

test('Dirty Dozen #7–#10: ID poisoning, 50KB overflow, unsafe/oversize previewDataUrl, fileSize/chunkCount overflow, and legacy storage fields are denied', () => {
  assert.equal(canCreate(ownerAuth, '../evil$id', validDrop), false);
  assert.equal(canCreate(ownerAuth, 'a'.repeat(129), validDrop), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, content: 'x'.repeat(50001) }), false);
  assert.equal(
    canCreate(ownerAuth, 'drop_1', { ...validDrop, previewDataUrl: 'data:text/html,<script>alert(1)</script>' }),
    false
  );
  assert.equal(
    canCreate(ownerAuth, 'drop_1', { ...validDrop, previewDataUrl: 'javascript:alert(1)' }),
    false
  );
  assert.equal(
    canCreate(ownerAuth, 'drop_1', {
      ...validDrop,
      previewDataUrl: `data:image/jpeg;base64,${'A'.repeat(160000)}`,
    }),
    false
  );
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, fileSize: MAX_FILE_SIZE + 1 }), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, chunkCount: 15 }), false);
  assert.equal(
    canCreate(ownerAuth, 'drop_1', { ...validDrop, downloadUrl: 'https://example.com/file.bin' }),
    false
  );
  assert.equal(
    canCreate(ownerAuth, 'drop_1', { ...validDrop, storagePath: 'drops/user_alpha_1/file.bin' }),
    false
  );
});

test('Dirty Dozen #11–#12: Backdated timestamp, immutable mutation, and value poisoning on update are denied', () => {
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, createdAt: REQUEST_TIME - 1000 }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, ownerId: 'user_beta_2' }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, content: 'tampered' }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, isCode: 'yes' }), false);
});

test('Legitimate owner operations succeed', () => {
  assert.equal(canCreate(ownerAuth, 'drop_valid_1', validDrop), true);
  assert.equal(
    canCreate(ownerAuth, 'drop_file_1', {
      ...validDrop,
      type: 'image',
      fileName: 'photo.jpg',
      fileSize: MAX_FILE_SIZE,
      mimeType: 'image/jpeg',
      chunkCount: 14,
      previewDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    }),
    true
  );
  assert.equal(canGet(ownerAuth, 'drop_valid_1', validDrop), true);
  assert.equal(canList(ownerAuth, validDrop), true);
  assert.equal(canUpdate(ownerAuth, 'drop_valid_1', validDrop, { ...validDrop, isCode: true }), true);
});

test('Chunk rules: cross-tenant read/list, spoofing, unverified, size/index bounds, extra fields, and updates are denied', () => {
  assert.equal(canGetChunk(null, 'drop_1', '0', validChunk), false);
  assert.equal(canListChunk(null, validChunk), false);
  assert.equal(canGetChunk(attackerAuth, 'drop_1', '0', validChunk), false);
  assert.equal(canListChunk(attackerAuth, validChunk), false);
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '0', { ...validChunk, ownerId: 'user_beta_2' }), false);
  assert.equal(canCreateChunk(unverifiedAuth, 'drop_1', '0', validChunk), false);
  assert.equal(
    canCreateChunk(ownerAuth, 'drop_1', '0', { ...validChunk, data: new Uint8Array(MAX_CHUNK_BYTES + 1) }),
    false
  );
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '0', { ...validChunk, data: new Uint8Array(0) }), false);
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '1', validChunk), false);
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '01', { ...validChunk, index: 1 }), false);
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '14', { ...validChunk, index: 14 }), false);
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '0', { ...validChunk, extra: 'bad' }), false);
  assert.equal(canUpdateChunk(ownerAuth, 'drop_1', '0', validChunk, validChunk), false);
  assert.equal(canDeleteChunk(attackerAuth, 'drop_1', '0', validChunk), false);
  assert.equal(canDeleteChunk(unverifiedAuth, 'drop_1', '0', validChunk), false);
});

test('Chunk rules: legitimate owner create, get, list, and delete succeed', () => {
  assert.equal(canCreateChunk(ownerAuth, 'drop_1', '0', validChunk), true);
  assert.equal(
    canCreateChunk(ownerAuth, 'drop_1', '13', {
      ownerId: 'user_alpha_1',
      index: 13,
      data: new Uint8Array(MAX_CHUNK_BYTES),
    }),
    true
  );
  assert.equal(canGetChunk(ownerAuth, 'drop_1', '0', validChunk), true);
  assert.equal(canListChunk(ownerAuth, validChunk), true);
  assert.equal(canDeleteChunk(ownerAuth, 'drop_1', '0', validChunk), true);
});

test('Storage stats rules file enforces singleton path and structural guards', () => {
  assert.match(rulesText, /match \/stats\/storage\s*\{/);
  assert.doesNotMatch(rulesText, /match \/stats\/\{/);
  assert.match(rulesText, /function isValidStorageStats\(data\)/);
  assert.match(rulesText, /function minInt\(a, b\)/);
  assert.match(rulesText, /function maxInt\(a, b\)/);
  assert.match(rulesText, /function dropStorageBytes\(d\)/);
  assert.match(rulesText, /d\.content\.toUtf8\(\)\.size\(\)/);
  assert.match(rulesText, /data\.keys\(\)\.hasAll\(\['totalBytes', 'lastDropId', 'updatedAt'\]\)/);
  assert.match(rulesText, /data\.keys\(\)\.hasOnly\(\['totalBytes', 'lastDropId', 'updatedAt'\]\)/);
  assert.match(rulesText, /data\.totalBytes <= 10737418240/);
  assert.match(rulesText, /isValidId\(data\.lastDropId\)/);
  assert.match(rulesText, /function isAtomicDropCreate\(dropId\)/);
  assert.match(rulesText, /function isAtomicDropDelete\(dropId\)/);
  assert.match(rulesText, /existsAfter\(\/databases\/\$\(database\)\/documents\/drops\/\$\(dropId\)\)/);
  assert.match(rulesText, /getAfter\(\/databases\/\$\(database\)\/documents\/drops\/\$\(dropId\)\)\.data\.ownerId == request\.auth\.uid/);
  assert.match(rulesText, /get\(\/databases\/\$\(database\)\/documents\/drops\/\$\(dropId\)\)\.data\.ownerId == request\.auth\.uid/);
  assert.match(
    rulesText,
    /incoming\(\)\.totalBytes == dropStorageBytes\(getAfter\(\/databases\/\$\(database\)\/documents\/drops\/\$\(incoming\(\)\.lastDropId\)\)\.data\)/
  );
  assert.match(rulesText, /incoming\(\)\.totalBytes == minInt\(/);
  assert.match(rulesText, /incoming\(\)\.totalBytes == maxInt\(/);
  assert.match(rulesText, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesText, /isAtomicDropCreate\(incoming\(\)\.lastDropId\)/);
  assert.match(rulesText, /isAtomicDropDelete\(incoming\(\)\.lastDropId\)/);
});

test('Storage stats rules: unauthenticated get, list, delete, unverified writes, invalid schema/bounds/deltas, inflated claims, missing/cross-owner drop proofs, and backdated timestamps are denied', () => {
  const existingStats: Record<string, unknown> = {
    totalBytes: 50000000,
    lastDropId: 'drop_prev_1',
    updatedAt: REQUEST_TIME - 5000,
  };
  const ownerCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: { drop_new_1: { ownerId: ownerAuth.uid, content: 'x'.repeat(1024) } },
  };
  const ownerDeleteBatch: MockDropBatchState = {
    beforeDrops: { drop_del_1: { ownerId: ownerAuth.uid, content: 'x'.repeat(1000) } },
    afterDrops: {},
  };
  const tinyCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: { drop_tiny_1: { ownerId: ownerAuth.uid, content: 'a' } },
  };
  const tinyDeleteBatch: MockDropBatchState = {
    beforeDrops: { drop_tiny_del_1: { ownerId: ownerAuth.uid, content: 'a' } },
    afterDrops: {},
  };
  const emptyBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: {},
  };
  const alreadyExistedBatch: MockDropBatchState = {
    beforeDrops: { drop_new_1: { ownerId: ownerAuth.uid, content: 'x'.repeat(1024) } },
    afterDrops: { drop_new_1: { ownerId: ownerAuth.uid, content: 'x'.repeat(1024) } },
  };
  const crossOwnerCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: { drop_other_1: { ownerId: attackerAuth.uid, content: 'x'.repeat(1024) } },
  };
  const crossOwnerDeleteBatch: MockDropBatchState = {
    beforeDrops: { drop_other_2: { ownerId: attackerAuth.uid, content: 'x'.repeat(1000) } },
    afterDrops: {},
  };

  // Read / list / delete access
  assert.equal(canGetStorageStats(null), false);
  assert.equal(canListStorageStats(null), false);
  assert.equal(canListStorageStats(ownerAuth), false);
  assert.equal(canDeleteStorageStats(null), false);
  assert.equal(canDeleteStorageStats(ownerAuth), false);

  // Unauthenticated and unverified create/update
  assert.equal(
    canCreateStorageStats(null, { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME }, ownerCreateBatch),
    false
  );
  assert.equal(
    canCreateStorageStats(
      unverifiedAuth,
      { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      null,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      unverifiedAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );

  // Missing atomic drop proof (standalone counter writes or non-transitioning drops)
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME }, emptyBatch),
    false
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      alreadyExistedBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      emptyBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 49999000, lastDropId: 'drop_del_1', updatedAt: REQUEST_TIME },
      emptyBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      alreadyExistedBatch
    ),
    false
  );
  // Mismatched direction: increment using delete proof, decrement using create proof
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_del_1', updatedAt: REQUEST_TIME },
      ownerDeleteBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 49999000, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );

  // Cross-owner drop proof is denied
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_other_1', updatedAt: REQUEST_TIME },
      crossOwnerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_other_1', updatedAt: REQUEST_TIME },
      crossOwnerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 49999000, lastDropId: 'drop_other_2', updatedAt: REQUEST_TIME },
      crossOwnerDeleteBatch
    ),
    false
  );

  // Invalid lastDropId (missing, empty, path traversal, >128 chars, wrong type)
  assert.equal(canCreateStorageStats(ownerAuth, { totalBytes: 1024, updatedAt: REQUEST_TIME }, ownerCreateBatch), false);
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: 1024, lastDropId: '', updatedAt: REQUEST_TIME }, ownerCreateBatch),
    false
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: '../evil$id', updatedAt: REQUEST_TIME },
      { beforeDrops: {}, afterDrops: { '../evil$id': { ownerId: ownerAuth.uid } } }
    ),
    false
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'a'.repeat(129), updatedAt: REQUEST_TIME },
      { beforeDrops: {}, afterDrops: { ['a'.repeat(129)]: { ownerId: ownerAuth.uid } } }
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 12345, updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );

  // Extra/shadow fields and missing required fields
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME, extra: 1 },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME, quota: 999 },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: 1024, lastDropId: 'drop_new_1' }, ownerCreateBatch),
    false
  );
  assert.equal(
    canUpdateStorageStats(ownerAuth, existingStats, { lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME }, ownerCreateBatch),
    false
  );

  // Negative, non-integer, or >10 GiB totalBytes
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: -1, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME }, ownerCreateBatch),
    false
  );
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: 1024.5, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME }, ownerCreateBatch),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      { totalBytes: 100, lastDropId: 'drop_prev_1', updatedAt: REQUEST_TIME - 1000 },
      { totalBytes: -10, lastDropId: 'drop_del_1', updatedAt: REQUEST_TIME },
      ownerDeleteBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      { totalBytes: MAX_STORAGE_BYTES, lastDropId: 'drop_prev_1', updatedAt: REQUEST_TIME - 1000 },
      { totalBytes: MAX_STORAGE_BYTES + 1, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );

  // Initial create > 11000000 and update delta > 11000000 (increment or decrement)
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: MAX_STORAGE_DELTA + 1, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) + MAX_STORAGE_DELTA + 1,
        lastDropId: 'drop_new_1',
        updatedAt: REQUEST_TIME,
      },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) - MAX_STORAGE_DELTA - 1,
        lastDropId: 'drop_del_1',
        updatedAt: REQUEST_TIME,
      },
      ownerDeleteBatch
    ),
    false
  );

  // Inflated create/increment/decrement: 1-byte drop claiming ±11,000,000 or mismatched bytes
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: MAX_STORAGE_DELTA, lastDropId: 'drop_tiny_1', updatedAt: REQUEST_TIME },
      tinyCreateBatch
    ),
    false
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 2, lastDropId: 'drop_tiny_1', updatedAt: REQUEST_TIME },
      tinyCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) + MAX_STORAGE_DELTA,
        lastDropId: 'drop_tiny_1',
        updatedAt: REQUEST_TIME,
      },
      tinyCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) - MAX_STORAGE_DELTA,
        lastDropId: 'drop_tiny_del_1',
        updatedAt: REQUEST_TIME,
      },
      tinyDeleteBatch
    ),
    false
  );
  // Multi-byte UTF-8 mismatch: 'กข' is 6 UTF-8 bytes, claiming JS .length (2) must fail
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 2, lastDropId: 'drop_thai_1', updatedAt: REQUEST_TIME },
      { beforeDrops: {}, afterDrops: { drop_thai_1: { ownerId: ownerAuth.uid, content: 'กข' } } }
    ),
    false
  );

  // Backdated or future updatedAt
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME - 1000 },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME + 1000 },
      ownerCreateBatch
    ),
    false
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      { totalBytes: 50001024, lastDropId: 'drop_new_1', updatedAt: REQUEST_TIME - 1000 },
      ownerCreateBatch
    ),
    false
  );
});

test('Storage stats rules: signed-in get, exact atomic drop create, and exact atomic drop delete (including UTF-8, 10 GiB ceiling, and 0-byte floor clamps) succeed', () => {
  const existingStats: Record<string, unknown> = {
    totalBytes: 50000000,
    lastDropId: 'drop_prev_1',
    updatedAt: REQUEST_TIME - 5000,
  };
  const emptyDropCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: { drop_empty_1: { ownerId: ownerAuth.uid, content: '' } },
  };
  const utf8FileCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: {
      drop_utf8_1: {
        ownerId: ownerAuth.uid,
        content: 'กข', // 6 UTF-8 bytes
        fileSize: 1024,
        previewDataUrl: 'data:image/jpeg;base64,AAAA', // 27 chars
      },
    },
  };
  const maxClampedCreateBatch: MockDropBatchState = {
    beforeDrops: {},
    afterDrops: {
      drop_max_1: {
        ownerId: ownerAuth.uid,
        content: 'x'.repeat(50000),
        fileSize: 10950000,
        previewDataUrl: 'data:image/jpeg;base64,AAAA',
      },
    },
  };
  const ownerDeleteBatch: MockDropBatchState = {
    beforeDrops: { drop_del_1: { ownerId: ownerAuth.uid, content: 'x'.repeat(4096) } },
    afterDrops: {},
  };
  const attackerDeleteBatch: MockDropBatchState = {
    beforeDrops: {
      drop_beta_del_1: {
        ownerId: attackerAuth.uid,
        content: 'กข', // 6 UTF-8 bytes
        fileSize: 2048,
      },
    },
    afterDrops: {},
  };

  assert.equal(canGetStorageStats(ownerAuth), true);
  assert.equal(canGetStorageStats(unverifiedAuth), true);
  assert.equal(canGetStorageStats(attackerAuth), true);

  // Exact matching create: empty drop (0 bytes), UTF-8 + fileSize + previewDataUrl, and 11 MB clamp
  assert.equal(
    canCreateStorageStats(ownerAuth, { totalBytes: 0, lastDropId: 'drop_empty_1', updatedAt: REQUEST_TIME }, emptyDropCreateBatch),
    true
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: 6 + 1024 + 27, lastDropId: 'drop_utf8_1', updatedAt: REQUEST_TIME },
      utf8FileCreateBatch
    ),
    true
  );
  assert.equal(
    canCreateStorageStats(
      ownerAuth,
      { totalBytes: MAX_STORAGE_DELTA, lastDropId: 'drop_max_1', updatedAt: REQUEST_TIME },
      maxClampedCreateBatch
    ),
    true
  );

  // Exact matching atomic create increment and atomic delete decrement
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) + 6 + 1024 + 27,
        lastDropId: 'drop_utf8_1',
        updatedAt: REQUEST_TIME,
      },
      utf8FileCreateBatch
    ),
    true
  );
  assert.equal(
    canUpdateStorageStats(
      attackerAuth,
      existingStats,
      {
        totalBytes: (existingStats.totalBytes as number) - (6 + 2048),
        lastDropId: 'drop_beta_del_1',
        updatedAt: REQUEST_TIME,
      },
      attackerDeleteBatch
    ),
    true
  );

  // 0-byte floor clamp on delete (existing < deletedDropBytes -> 0, and 0 -> 0)
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      { totalBytes: 1024, lastDropId: 'drop_prev_1', updatedAt: REQUEST_TIME - 1000 },
      { totalBytes: 0, lastDropId: 'drop_del_1', updatedAt: REQUEST_TIME },
      ownerDeleteBatch
    ),
    true
  );
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      { totalBytes: 0, lastDropId: 'drop_prev_1', updatedAt: REQUEST_TIME - 1000 },
      { totalBytes: 0, lastDropId: 'drop_del_1', updatedAt: REQUEST_TIME },
      ownerDeleteBatch
    ),
    true
  );

  // 10 GiB ceiling clamp on create increment (existing + dropBytes > 10 GiB -> 10 GiB)
  assert.equal(
    canUpdateStorageStats(
      ownerAuth,
      { totalBytes: MAX_STORAGE_BYTES - 500, lastDropId: 'drop_prev_1', updatedAt: REQUEST_TIME - 1000 },
      { totalBytes: MAX_STORAGE_BYTES, lastDropId: 'drop_utf8_1', updatedAt: REQUEST_TIME },
      utf8FileCreateBatch
    ),
    true
  );
});
