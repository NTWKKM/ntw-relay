import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppShareUrl,
  filterDrops,
  formatBytes,
  formatRelativeTime,
  generateDropId,
  getOldDropIds,
  getQrPayload,
  isSafeHttpUrl,
  looksLikeCode,
  parseTextSegments,
  sanitizeFileName,
  validateDropContent,
} from './drop-utils';
import { mapFirebaseAuthError, validateEmailAuthInput } from './auth-errors';
import { resolveAuthGuardDecision } from './auth-guard';
import { getNextTheme, resolveStoredTheme } from './theme';
import type { DropItem } from './types';

test('isSafeHttpUrl allows http/https and rejects javascript/data schemes', () => {
  assert.equal(isSafeHttpUrl('https://firebase.google.com/docs'), true);
  assert.equal(isSafeHttpUrl('http://localhost:3000'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);
});

test('parseTextSegments extracts URLs cleanly without trailing punctuation', () => {
  const segments = parseTextSegments('Check https://example.com/path?a=1, and https://foo.bar.');
  assert.deepEqual(segments, [
    { type: 'text', value: 'Check ' },
    { type: 'url', value: 'https://example.com/path?a=1' },
    { type: 'text', value: ', and ' },
    { type: 'url', value: 'https://foo.bar' },
    { type: 'text', value: '.' },
  ]);
});

test('looksLikeCode detects code snippets and leaves prose/Thai/URLs as normal text', () => {
  assert.equal(looksLikeCode('https://console.firebase.google.com'), false);
  assert.equal(looksLikeCode('อย่าลืมส่งไฟล์รายงานสรุปให้ทีมตอนเย็นนะครับ'), false);
  assert.equal(looksLikeCode('{"projectId": "ntw-relay", "sync": true}'), true);
  assert.equal(
    looksLikeCode('const upload = async (file: File) => {\n  return await getDownloadURL(ref);\n};'),
    true
  );
  assert.equal(looksLikeCode('gsutil cors set cors.json gs://my-bucket\nfirebase deploy'), true);
});

test('formatBytes formats sizes cleanly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2621440), '2.5 MB');
  assert.equal(formatBytes(1073741824), '1 GB');
});

test('sanitizeFileName preserves Thai UTF-8 names and removes traversal chars', () => {
  assert.equal(sanitizeFileName('สรุปงบประมาณ_2569.pdf'), 'สรุปงบประมาณ_2569.pdf');
  assert.equal(sanitizeFileName('../../etc/passwd'), '.etc_passwd'.replace('.etc', '._._etc'));
  assert.equal(sanitizeFileName('folder/รายงาน/แผนงาน.docx'), 'folder_รายงาน_แผนงาน.docx');
  const longName = `${'ก'.repeat(280)}.png`;
  const sanitized = sanitizeFileName(longName);
  assert.equal(sanitized.length <= 255, true);
  assert.equal(sanitized.endsWith('.png'), true);
});

test('generateDropId matches Firestore isValidId regex', () => {
  const id = generateDropId();
  assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  assert.equal(id.length <= 128, true);
});

test('validateDropContent enforces non-empty and 50KB ceiling', () => {
  assert.equal(validateDropContent('   ').valid, false);
  assert.equal(validateDropContent('hello').valid, true);
  assert.equal(validateDropContent('a'.repeat(50001)).valid, false);
});

test('filterDrops filters by tab and search query sorted newest-first', () => {
  const items: DropItem[] = [
    { id: '1', ownerId: 'u', type: 'text', content: 'Older note', createdAtMs: 1000 },
    { id: '2', ownerId: 'u', type: 'file', content: '', fileName: 'รายงานประจำเดือน.pdf', createdAtMs: 3000 },
    { id: '3', ownerId: 'u', type: 'image', content: '', fileName: 'screenshot.png', createdAtMs: 2000 },
  ];

  const all = filterDrops(items, 'all', '');
  assert.deepEqual(all.map((i) => i.id), ['2', '3', '1']);

  const files = filterDrops(items, 'file', 'รายงาน');
  assert.deepEqual(files.map((i) => i.id), ['2']);

  const images = filterDrops(items, 'image', '');
  assert.deepEqual(images.map((i) => i.id), ['3']);
});

test('getOldDropIds computes 24h, 7d, and all cutoffs accurately', () => {
  const now = 1_764_100_000_000;
  const hour = 3_600_000;
  const items: DropItem[] = [
    { id: 'fresh', ownerId: 'u', type: 'text', content: 'a', createdAtMs: now - 2 * hour },
    { id: 'twoDays', ownerId: 'u', type: 'text', content: 'b', createdAtMs: now - 48 * hour },
    { id: 'tenDays', ownerId: 'u', type: 'text', content: 'c', createdAtMs: now - 240 * hour },
  ];

  assert.deepEqual(getOldDropIds(items, '24h', now), ['twoDays', 'tenDays']);
  assert.deepEqual(getOldDropIds(items, '7d', now), ['tenDays']);
  assert.deepEqual(getOldDropIds(items, 'all', now), ['fresh', 'twoDays', 'tenDays']);
});

test('formatRelativeTime and getQrPayload behave predictably', () => {
  const now = 1_764_100_000_000;
  assert.equal(formatRelativeTime(now - 10_000, now), 'Just now');
  assert.equal(formatRelativeTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(formatRelativeTime(now - 3 * 3600_000, now), '3h ago');

  const cloudFile: DropItem = {
    id: 'f1',
    ownerId: 'u',
    type: 'file',
    content: '',
    fileName: 'deck.pdf',
    downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/x/o/deck.pdf?alt=media',
    createdAtMs: now,
  };
  assert.equal(getQrPayload(cloudFile).value, cloudFile.downloadUrl);

  const localFile: DropItem = {
    id: 'f2',
    ownerId: 'local',
    type: 'file',
    content: '',
    fileName: 'local.pdf',
    isLocalOnly: true,
    createdAtMs: now,
  };
  assert.equal(getQrPayload(localFile).value, null);
});

test('validateEmailAuthInput and mapFirebaseAuthError handle edge cases', () => {
  assert.equal(validateEmailAuthInput('', 'secret').valid, false);
  assert.equal(validateEmailAuthInput('not-an-email', 'secret').valid, false);
  assert.equal(validateEmailAuthInput('me@example.com', '').valid, false);
  assert.equal(validateEmailAuthInput('me@example.com', 'password123').valid, true);

  assert.match(
    mapFirebaseAuthError({ code: 'auth/operation-not-allowed' }),
    /Firebase Console/
  );
  assert.match(
    mapFirebaseAuthError({ code: 'auth/invalid-credential' }),
    /Invalid email or password/
  );
  assert.equal(mapFirebaseAuthError({ code: 'auth/popup-closed-by-user' }), '');
});

test('resolveAuthGuardDecision protects Workspace and Firestore when Firebase is configured', () => {
  assert.equal(
    resolveAuthGuardDecision({ isFirebaseConfigured: true, authReady: false, hasUser: false }),
    'loading'
  );
  assert.equal(
    resolveAuthGuardDecision({ isFirebaseConfigured: true, authReady: true, hasUser: false }),
    'redirect_login'
  );
  assert.equal(
    resolveAuthGuardDecision({ isFirebaseConfigured: true, authReady: true, hasUser: true }),
    'allow_cloud'
  );
  assert.equal(
    resolveAuthGuardDecision({ isFirebaseConfigured: false, authReady: true, hasUser: false }),
    'allow_local_demo'
  );
});

test('material theme resolution defaults to Atelier Paper light and toggles cleanly', () => {
  assert.equal(resolveStoredTheme(null), 'light');
  assert.equal(resolveStoredTheme(undefined), 'light');
  assert.equal(resolveStoredTheme('unexpected'), 'light');
  assert.equal(resolveStoredTheme('dark'), 'dark');
  assert.equal(getNextTheme('light'), 'dark');
  assert.equal(getNextTheme('dark'), 'light');
});

test('buildAppShareUrl appends subpath basePath cleanly for GitHub Pages QR', () => {
  assert.equal(buildAppShareUrl('http://localhost:3000', ''), 'http://localhost:3000');
  assert.equal(
    buildAppShareUrl('https://ntwkkm.github.io', '/ntw-relay'),
    'https://ntwkkm.github.io/ntw-relay/'
  );
  assert.equal(
    buildAppShareUrl('https://ntwkkm.github.io/', 'ntw-relay/'),
    'https://ntwkkm.github.io/ntw-relay/'
  );
});
