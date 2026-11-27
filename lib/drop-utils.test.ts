import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppShareUrl,
  CHUNK_SIZE_BYTES,
  computeStorageUsage,
  estimateDropStorageBytes,
  hasFileData,
  MAX_CHUNK_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_STORAGE_COUNTER_DELTA_BYTES,
  SPARK_STORAGE_QUOTA_BYTES,
  splitIntoChunkRanges,
  filterDrops,
  formatBytes,
  formatFileTypeLabel,
  formatRelativeTime,
  generateDropId,
  getOldDropIds,
  getQrPayload,
  isImeComposing,
  isSafeHttpUrl,
  looksLikeCode,
  parseTextSegments,
  QR_MAX_TEXT_BYTES,
  sanitizeFileName,
  truncateToUtf8Bytes,
  validateDropContent,
} from './drop-utils';
import { mapFirebaseAuthError, validateEmailAuthInput } from './auth-errors';
import { resolveAuthGuardDecision } from './auth-guard';
import { resolveNextAllowedUserRole } from './allowlist-service';
import {
  submitAllowlistStatusChange,
  submitPreapprovedEmail,
} from './admin-allowlist-actions';
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
  assert.equal(looksLikeCode('{"projectId": "relay", "sync": true}'), true);
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
  assert.equal(
    resolveAuthGuardDecision({
      isFirebaseConfigured: true,
      authReady: true,
      hasUser: true,
      allowlistState: 'loading',
    }),
    'loading'
  );
  assert.equal(
    resolveAuthGuardDecision({
      isFirebaseConfigured: true,
      authReady: true,
      hasUser: true,
      allowlistState: 'pending',
    }),
    'pending_approval'
  );
  assert.equal(
    resolveAuthGuardDecision({
      isFirebaseConfigured: true,
      authReady: true,
      hasUser: true,
      allowlistState: 'rejected',
    }),
    'pending_approval'
  );
  assert.equal(
    resolveAuthGuardDecision({
      isFirebaseConfigured: true,
      authReady: true,
      hasUser: true,
      allowlistState: 'unverified',
    }),
    'pending_approval'
  );
  assert.equal(
    resolveAuthGuardDecision({
      isFirebaseConfigured: true,
      authReady: true,
      hasUser: true,
      allowlistState: 'approved',
    }),
    'allow_cloud'
  );
});

test('resolveNextAllowedUserRole preserves existing admin role when requestedRole is omitted', () => {
  assert.equal(
    resolveNextAllowedUserRole({ exists: true, existingRole: 'admin' }),
    'admin'
  );
  assert.equal(
    resolveNextAllowedUserRole({ exists: true, existingRole: 'user' }),
    'user'
  );
  assert.equal(
    resolveNextAllowedUserRole({ exists: false }),
    'user'
  );
  assert.equal(
    resolveNextAllowedUserRole({ exists: true, existingRole: 'admin', requestedRole: 'user' }),
    'user'
  );
});

test('admin allowlist handlers omit role so Firestore transaction preserves authoritative role', async () => {
  const calls: Record<string, unknown>[] = [];
  const fakeUpdate = async (params: Record<string, unknown>) => {
    calls.push(params);
  };

  await submitPreapprovedEmail({
    email: 'Promoted@Example.com',
    adminEmail: 'admin@example.com',
    updateStatus: fakeUpdate as never,
  });
  await submitAllowlistStatusChange({
    email: 'promoted@example.com',
    status: 'rejected',
    adminEmail: 'admin@example.com',
    updateStatus: fakeUpdate as never,
  });

  assert.equal(calls.length, 2);
  assert.equal('role' in calls[0], false);
  assert.equal('role' in calls[1], false);
  assert.equal(calls[0].email, 'promoted@example.com');
  assert.equal(calls[0].status, 'approved');
  assert.equal(calls[1].status, 'rejected');
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
  assert.equal(buildAppShareUrl('http://localhost:3000', '   '), 'http://localhost:3000');
  assert.equal(buildAppShareUrl('http://localhost:3000', ' / '), 'http://localhost:3000');
  assert.equal(
    buildAppShareUrl('https://ntwkkm.github.io', '/relay'),
    'https://ntwkkm.github.io/relay/'
  );
  assert.equal(
    buildAppShareUrl('https://ntwkkm.github.io/', ' relay/ '),
    'https://ntwkkm.github.io/relay/'
  );
});

test('splitIntoChunkRanges covers every byte exactly once within the Firestore chunk cap', () => {
  assert.deepEqual(splitIntoChunkRanges(0), []);
  assert.deepEqual(splitIntoChunkRanges(-5), []);
  assert.deepEqual(splitIntoChunkRanges(10, 4), [
    { index: 0, start: 0, end: 4 },
    { index: 1, start: 4, end: 8 },
    { index: 2, start: 8, end: 10 },
  ]);
  assert.deepEqual(splitIntoChunkRanges(CHUNK_SIZE_BYTES), [
    { index: 0, start: 0, end: CHUNK_SIZE_BYTES },
  ]);
  const maxRanges = splitIntoChunkRanges(MAX_FILE_SIZE_BYTES);
  assert.equal(maxRanges.length, MAX_CHUNK_COUNT);
  assert.equal(MAX_CHUNK_COUNT, 14);
  assert.equal(maxRanges[maxRanges.length - 1].end, MAX_FILE_SIZE_BYTES);
  assert.ok(maxRanges.every((r) => r.end - r.start <= CHUNK_SIZE_BYTES && r.end > r.start));
  assert.throws(() => splitIntoChunkRanges(10, 0));
});

test('Firestore-chunked files are downloadable and QR points to the app instead of a public URL', () => {
  const now = Date.now();
  const chunked: DropItem = {
    id: 'f3',
    ownerId: 'u',
    type: 'file',
    content: 'report.pdf',
    fileName: 'report.pdf',
    chunkCount: 3,
    createdAtMs: now,
  };
  assert.equal(hasFileData(chunked), true);
  assert.equal(hasFileData({ ...chunked, chunkCount: 0 }), true);
  assert.equal(hasFileData({ ...chunked, chunkCount: undefined }), false);

  const withApp = getQrPayload(chunked, 'https://ntwkkm.github.io/relay/');
  assert.equal(withApp.value, 'https://ntwkkm.github.io/relay/');
  assert.match(withApp.label, /sign in to download report\.pdf/);

  const noApp = getQrPayload(chunked);
  assert.equal(noApp.value, null);
  assert.ok(noApp.unavailableReason);
  assert.equal(getQrPayload(chunked, 'javascript:alert(1)').value, null);
});

test('formatFileTypeLabel produces concise extension labels without noisy MIME strings', () => {
  assert.equal(formatFileTypeLabel('สรุปแผนงาน_2569.txt', 'text/plain;charset=utf-8'), 'TXT');
  assert.equal(formatFileTypeLabel('diagram.svg', 'image/svg+xml'), 'SVG');
  assert.equal(formatFileTypeLabel('archive.tar.gz', 'application/gzip'), 'GZ');
  assert.equal(formatFileTypeLabel('noext', 'text/plain;charset=utf-8'), 'TXT');
  assert.equal(formatFileTypeLabel('noext', 'application/octet-stream'), 'FILE');
  assert.equal(formatFileTypeLabel(undefined, undefined), 'FILE');
});

test('isImeComposing guards against premature IME submission', () => {
  assert.equal(isImeComposing({ isComposing: true, keyCode: 13 }), true);
  assert.equal(isImeComposing({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeComposing({ isComposing: false, keyCode: 13 }), false);
});

test('getQrPayload caps text by UTF-8 byte length on code-point boundaries (Thai & emoji)', () => {
  const encoder = new TextEncoder();
  // Each Thai char is 3 UTF-8 bytes: 500 chars = 1,500 bytes (> 1,000 bytes, < 1,200 chars)
  const thaiLong = 'ก'.repeat(500);
  const thaiQr = getQrPayload({
    id: 't1',
    ownerId: 'u',
    type: 'text',
    content: thaiLong,
    createdAtMs: Date.now(),
  });
  assert.ok(thaiQr.value);
  assert.ok(encoder.encode(thaiQr.value).length <= QR_MAX_TEXT_BYTES);
  assert.equal(thaiQr.value.length, Math.floor(QR_MAX_TEXT_BYTES / 3));
  assert.match(thaiQr.label, /bytes/);

  // 4-byte emoji should never be split across surrogate pairs
  const emojiTruncated = truncateToUtf8Bytes('😀'.repeat(10), 10);
  assert.equal(emojiTruncated.truncated, true);
  assert.equal(emojiTruncated.value, '😀😀');
  assert.equal(encoder.encode(emojiTruncated.value).length, 8);
});

test('estimateDropStorageBytes and computeStorageUsage bound deltas and compute meter thresholds', () => {
  assert.equal(estimateDropStorageBytes({ content: 'hello' }), 5);
  // Fractional legacy fileSize truncates like firestore.rules int(): 1 + 1 = 2, never rounded to 3
  assert.equal(estimateDropStorageBytes({ content: 'a', fileSize: 1.8 }), 2);
  assert.equal(estimateDropStorageBytes({ content: 'กข', fileSize: 1024, previewDataUrl: 'abc' }), 6 + 1024 + 3);
  assert.equal(
    estimateDropStorageBytes({ fileSize: MAX_FILE_SIZE_BYTES + 5_000_000 }),
    MAX_STORAGE_COUNTER_DELTA_BYTES
  );

  const empty = computeStorageUsage(-100);
  assert.equal(empty.usedBytes, 0);
  assert.equal(empty.percent, 0);
  assert.equal(empty.level, 'normal');

  const warn = computeStorageUsage(Math.round(SPARK_STORAGE_QUOTA_BYTES * 0.8));
  assert.equal(warn.level, 'warning');
  assert.ok(warn.percent >= 79 && warn.percent <= 81);

  const crit = computeStorageUsage(SPARK_STORAGE_QUOTA_BYTES * 1.2);
  assert.equal(crit.percent, 100);
  assert.equal(crit.level, 'critical');
});

