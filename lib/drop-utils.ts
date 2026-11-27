import type { CleanupRange, DropItem, FilterTab } from './types';

export const MAX_TEXT_LENGTH = 50000;
export const MAX_FILENAME_LENGTH = 255;
/** Firestore-only (Spark plan) file cap. Keep in sync with firestore.rules (fileSize / chunkCount). */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Firebase Spark plan Firestore storage quota (1 GiB across the project). */
export const SPARK_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GiB
/** Maximum single-operation delta accepted by /stats/storage in firestore.rules. */
export const MAX_STORAGE_COUNTER_DELTA_BYTES = 11_000_000;
/** Raw bytes per Firestore chunk document (Firestore hard limit is 1 MiB per document). */
export const CHUNK_SIZE_BYTES = 768 * 1024; // 768 KiB
export const MAX_CHUNK_COUNT = Math.ceil(MAX_FILE_SIZE_BYTES / CHUNK_SIZE_BYTES); // 14

const utf8Encoder = new TextEncoder();

interface DropBytesInput {
  content?: string;
  fileSize?: number;
  previewDataUrl?: string | null;
}

/**
 * Estimates the raw (uncapped) storage footprint of a single drop in bytes.
 * Used for Local sandbox usage, where files are not bound by the cloud counter delta.
 */
export function estimateDropRawBytes(input: DropBytesInput): number {
  const fileBytes =
    typeof input.fileSize === 'number' && Number.isFinite(input.fileSize) && input.fileSize > 0
      ? Math.trunc(input.fileSize) // matches firestore.rules int(d.fileSize) (truncation)
      : 0;
  const textBytes = input.content ? utf8Encoder.encode(input.content).byteLength : 0;
  const previewBytes = input.previewDataUrl ? input.previewDataUrl.length : 0;
  return fileBytes + textBytes + previewBytes;
}

/**
 * Estimates the Firestore storage footprint of a single drop in bytes,
 * clamped to the /stats/storage single-operation delta bound.
 */
export function estimateDropStorageBytes(input: DropBytesInput): number {
  return Math.min(MAX_STORAGE_COUNTER_DELTA_BYTES, estimateDropRawBytes(input));
}

export interface StorageUsageSummary {
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  level: 'normal' | 'warning' | 'critical';
}

/**
 * Computes clamped percentage and severity level for the shared 1 GB storage meter.
 */
export function computeStorageUsage(
  usedBytes: number,
  quotaBytes: number = SPARK_STORAGE_QUOTA_BYTES
): StorageUsageSummary {
  const safeQuota = Number.isFinite(quotaBytes) && quotaBytes > 0 ? quotaBytes : SPARK_STORAGE_QUOTA_BYTES;
  const safeUsed =
    Number.isFinite(usedBytes) && usedBytes > 0 ? Math.round(usedBytes) : 0;
  const percent = Math.min(100, (safeUsed / safeQuota) * 100);
  const level: StorageUsageSummary['level'] =
    percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'normal';
  return { usedBytes: safeUsed, quotaBytes: safeQuota, percent, level };
}

export interface ChunkRange {
  index: number;
  start: number;
  end: number;
}

/**
 * Splits a byte length into contiguous [start, end) ranges of at most `chunkSize` bytes.
 * A zero-byte file yields no chunks.
 */
export function splitIntoChunkRanges(
  totalBytes: number,
  chunkSize: number = CHUNK_SIZE_BYTES
): ChunkRange[] {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return [];
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive number.');
  }
  const ranges: ChunkRange[] = [];
  for (let start = 0, index = 0; start < totalBytes; start += chunkSize, index += 1) {
    ranges.push({ index, start, end: Math.min(start + chunkSize, totalBytes) });
  }
  return ranges;
}

/** True when a drop carries downloadable file bytes (local data URL or Firestore chunks). */
export function hasFileData(item: DropItem): boolean {
  return Boolean(item.downloadUrl) || typeof item.chunkCount === 'number';
}

export interface TextSegment {
  type: 'text' | 'url';
  value: string;
}

const URL_REGEX = /(https?:\/\/[^\s<>"'`)\]]+)/gi;

/**
 * Validates that a URL strictly uses http: or https: to prevent javascript:/data: XSS.
 */
export function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Splits a text string into safe plain-text and clickable http(s) URL segments.
 */
export function parseTextSegments(text: string): TextSegment[] {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') {
      prev.value += value;
    } else {
      segments.push({ type: 'text', value });
    }
  };

  for (const match of text.matchAll(URL_REGEX)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;

    // Strip common trailing punctuation from detected URLs
    const cleanUrl = rawUrl.replace(/[.,;:!?]+$/, '');
    const trailingLen = rawUrl.length - cleanUrl.length;

    if (index > lastIndex) {
      pushText(text.slice(lastIndex, index));
    }

    if (isSafeHttpUrl(cleanUrl)) {
      segments.push({ type: 'url', value: cleanUrl });
      if (trailingLen > 0) {
        pushText(rawUrl.slice(cleanUrl.length));
      }
    } else {
      pushText(rawUrl);
    }

    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }

  return segments;
}

/**
 * Heuristic check for whether dropped text resembles source code, JSON, SQL, or shell commands.
 */
export function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 6) return false;

  // Single pure URL is a link, not code
  if (/^https?:\/\/\S+$/i.test(trimmed)) return false;

  // Explicit fenced code block or JSON object/array
  if (/^```[\s\S]*```$/m.test(trimmed)) return true;
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Continue heuristic scoring
    }
  }

  // Direct CLI command invocation at start of line
  if (
    /^\s*(curl|git|npm|npx|pnpm|yarn|docker|gcloud|gsutil|firebase|ssh|chmod|export|sudo|kubectl)\s+\S+/m.test(
      trimmed
    )
  ) {
    return true;
  }

  const signals = [
    /\b(const|let|var|function|async|await|import|export|return|interface|type)\b/,
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|FROM|WHERE)\b/,
    /\b(def |class |elif |lambda |print\(|from .+ import )/,
    /=>\s*\{|\{\s*\n[\s\S]*\n\s*\}/,
    /<\/?[a-z][a-z0-9-]*(\s+[^>]*)?>/i,
    /;\s*$/m,
  ];

  let score = 0;
  for (const pattern of signals) {
    if (pattern.test(trimmed)) score += 1;
  }

  const hasIndentedLines = /^\s{2,}\S/m.test(trimmed) && trimmed.includes('\n');
  if (hasIndentedLines) score += 1;

  return score >= 2 || (score === 1 && trimmed.includes('\n') && /[{}();=<>]/.test(trimmed));
}

/**
 * Formats byte count into a concise human-readable label.
 */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${Number(value.toFixed(precision))} ${units[unitIdx]}`;
}

/**
 * Formats an epoch timestamp into a crisp relative or short date label.
 */
export function formatRelativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  const date = new Date(timestampMs);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Sanitizes filenames while preserving UTF-8 characters (including Thai script).
 */
export function sanitizeFileName(rawName: string): string {
  const cleaned = rawName
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[/\\]+/g, '_')
    .replace(/\.\.+/g, '.')
    .trim();

  const fallback = cleaned || 'untitled-file';
  if (fallback.length <= MAX_FILENAME_LENGTH) return fallback;

  const dotIdx = fallback.lastIndexOf('.');
  if (dotIdx > 0 && fallback.length - dotIdx <= 16) {
    const ext = fallback.slice(dotIdx);
    return fallback.slice(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  return fallback.slice(0, MAX_FILENAME_LENGTH);
}

/**
 * Generates a Firestore-safe document ID matching ^[a-zA-Z0-9_\-]+$.
 */
export function generateDropId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `drop_${ts}_${rand}`;
}

/**
 * Validates and trims text content against the blueprint's 50,000-character limit.
 */
export function validateDropContent(raw: string): { valid: boolean; value: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, value: '', error: 'Enter some text or a link before sending.' };
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      value: trimmed.slice(0, MAX_TEXT_LENGTH),
      error: `Text exceeds the ${MAX_TEXT_LENGTH.toLocaleString()} character limit.`,
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Filters drops by category tab and search query, sorted newest-first.
 */
export function filterDrops(items: DropItem[], tab: FilterTab, query: string): DropItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return [...items]
    .filter((item) => {
      if (tab !== 'all' && item.type !== tab) return false;
      if (!normalizedQuery) return true;
      const haystack = [item.content, item.fileName ?? '', item.mimeType ?? '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

/**
 * Returns IDs of drops eligible for cleanup based on the selected time range.
 */
export function getOldDropIds(
  items: DropItem[],
  range: CleanupRange,
  nowMs: number = Date.now()
): string[] {
  if (range === 'all') return items.map((item) => item.id);
  const cutoffMs =
    range === '24h' ? nowMs - 24 * 60 * 60 * 1000 : nowMs - 7 * 24 * 60 * 60 * 1000;
  return items.filter((item) => item.createdAtMs < cutoffMs).map((item) => item.id);
}

/** Maximum UTF-8 byte length for QR text payloads (safe for QR Level M & multi-byte scripts like Thai). */
export const QR_MAX_TEXT_BYTES = 1000;

/**
 * Truncates a string to at most `maxBytes` UTF-8 bytes on a Unicode code-point boundary.
 */
export function truncateToUtf8Bytes(
  input: string,
  maxBytes: number
): { value: string; truncated: boolean } {
  if (utf8Encoder.encode(input).length <= maxBytes) {
    return { value: input, truncated: false };
  }
  let result = '';
  let usedBytes = 0;
  for (const ch of input) {
    const chBytes = utf8Encoder.encode(ch).length;
    if (usedBytes + chBytes > maxBytes) {
      return { value: result, truncated: true };
    }
    result += ch;
    usedBytes += chBytes;
  }
  return { value: result, truncated: false };
}

/**
 * Determines the primary QR payload for any drop card.
 */
export function getQrPayload(
  item: DropItem,
  appUrl: string = ''
): {
  value: string | null;
  label: string;
  unavailableReason?: string;
} {
  if (item.type === 'text') {
    const trimmed = item.content.trim();
    const { value, truncated } = truncateToUtf8Bytes(trimmed, QR_MAX_TEXT_BYTES);
    if (truncated) {
      return {
        value,
        label: `Text excerpt (first ${QR_MAX_TEXT_BYTES.toLocaleString()} bytes for reliable scanning)`,
      };
    }
    return {
      value,
      label: isSafeHttpUrl(trimmed) ? 'Direct link' : 'Text snippet',
    };
  }

  if (item.downloadUrl && isSafeHttpUrl(item.downloadUrl)) {
    return {
      value: item.downloadUrl,
      label: item.fileName ? `Direct download · ${item.fileName}` : 'Direct download link',
    };
  }

  // Firestore-chunked files have no public URL: send the phone to the app (sign-in required)
  if (typeof item.chunkCount === 'number' && !item.isLocalOnly) {
    if (appUrl && isSafeHttpUrl(appUrl)) {
      return {
        value: appUrl,
        label: item.fileName
          ? `Open NTW Relay · sign in to download ${item.fileName}`
          : 'Open NTW Relay · sign in to download',
      };
    }
    return {
      value: null,
      label: item.fileName ?? 'Cloud file',
      unavailableReason: 'Open NTW Relay on your phone and sign in to download this file.',
    };
  }

  return {
    value: null,
    label: item.fileName ?? 'Local item',
    unavailableReason:
      'This file is stored locally in Demo Mode. Sign in with Firebase Sync to generate a direct cross-device QR download link.',
  };
}

/**
 * Builds the canonical shareable workspace URL, preserving any subpath deployment basePath
 * (e.g. https://ntwkkm.github.io + /relay -> https://ntwkkm.github.io/relay/).
 */
export function buildAppShareUrl(origin: string, basePath: string = ''): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const cleanBase = basePath.trim().replace(/^\/+|\/+$/g, '');
  if (!cleanOrigin) return '';
  return cleanBase ? `${cleanOrigin}/${cleanBase}/` : cleanOrigin;
}

/**
 * Returns a short, noise-free file type label (e.g. "PDF", "TXT", "ZIP") instead of raw MIME strings.
 */
export function formatFileTypeLabel(fileName?: string, mimeType?: string): string {
  const name = (fileName || '').trim();
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < name.length - 1) {
    const ext = name.slice(dotIdx + 1).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (ext.length >= 1 && ext.length <= 6) {
      return ext;
    }
  }

  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (mime.includes('/')) {
    const sub = mime.split('/')[1];
    if (sub === 'plain') return 'TXT';
    if (sub === 'svg+xml') return 'SVG';
    if (sub === 'octet-stream') return 'FILE';
    const cleanSub = sub.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (cleanSub.length >= 1 && cleanSub.length <= 6) return cleanSub;
  }

  return 'FILE';
}

/**
 * IME-safe check (Modern Web Guidance `ime-safe-enter-submit` Strategy 1):
 * blocks premature submit while an IME is composing or during Safari's keyCode 229 window.
 */
export function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}

