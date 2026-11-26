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
const ALLOWED_KEYS = new Set([
  'ownerId',
  'type',
  'content',
  'fileName',
  'fileSize',
  'mimeType',
  'downloadUrl',
  'storagePath',
  'isCode',
  'createdAt',
]);
const REQUIRED_KEYS = ['ownerId', 'type', 'content', 'createdAt'];

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
  if ('fileSize' in data && (typeof data.fileSize !== 'number' || data.fileSize < 0 || data.fileSize > 524288000)) return false;
  if ('mimeType' in data && (typeof data.mimeType !== 'string' || data.mimeType.length > 128)) return false;
  if ('downloadUrl' in data && (typeof data.downloadUrl !== 'string' || data.downloadUrl.length > 2048 || !/^https:\/\/.*$/.test(data.downloadUrl))) return false;
  if ('storagePath' in data && (typeof data.storagePath !== 'string' || data.storagePath.length > 512 || !new RegExp(`^drops/${auth.uid}/.*$`).test(data.storagePath))) return false;
  if ('isCode' in data && typeof data.isCode !== 'boolean') return false;
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

test('Rules file enforces all mandatory Eight Pillars structural clauses', () => {
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /allow list:\s*if isSignedIn\(\)\s*&&\s*resource\.data\.ownerId == request\.auth\.uid;/);
  assert.match(rulesText, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(\['isCode'\]\)/);
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

test('Dirty Dozen #7–#10: ID poisoning, 50KB overflow, XSS downloadUrl, and storage path escape are denied', () => {
  assert.equal(canCreate(ownerAuth, '../evil$id', validDrop), false);
  assert.equal(canCreate(ownerAuth, 'a'.repeat(129), validDrop), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, content: 'x'.repeat(50001) }), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, downloadUrl: 'javascript:alert(1)' }), false);
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, storagePath: 'drops/user_beta_2/secret.pdf' }), false);
});

test('Dirty Dozen #11–#12: Backdated timestamp, immutable mutation, and value poisoning on update are denied', () => {
  assert.equal(canCreate(ownerAuth, 'drop_1', { ...validDrop, createdAt: REQUEST_TIME - 1000 }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, ownerId: 'user_beta_2' }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, content: 'tampered' }), false);
  assert.equal(canUpdate(ownerAuth, 'drop_1', validDrop, { ...validDrop, isCode: 'yes' }), false);
});

test('Legitimate owner operations succeed', () => {
  assert.equal(canCreate(ownerAuth, 'drop_valid_1', validDrop), true);
  assert.equal(canGet(ownerAuth, 'drop_valid_1', validDrop), true);
  assert.equal(canList(ownerAuth, validDrop), true);
  assert.equal(canUpdate(ownerAuth, 'drop_valid_1', validDrop, { ...validDrop, isCode: true }), true);
});
