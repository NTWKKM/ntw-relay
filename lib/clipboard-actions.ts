'use client';

import { fetchCloudDropBlob } from './drops-service';
import type { DropItem } from './types';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

async function convertBlobToPng(blob: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 1200;
          canvas.height = img.naturalHeight || 750;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((png) => {
            if (png) resolve(png);
            else reject(new Error('PNG conversion failed'));
          }, 'image/png');
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Resolves the full file bytes for a drop: Firestore chunks for cloud items,
 * or the local data:/blob: URL for Demo Mode items.
 */
export async function resolveDropBlob(item: DropItem): Promise<Blob> {
  if (typeof item.chunkCount === 'number' && !item.isLocalOnly) {
    return fetchCloudDropBlob(item);
  }
  if (item.downloadUrl) {
    const res = await fetch(item.downloadUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }
  throw new Error('No file data available for this item.');
}

/**
 * Copies a drop's full-resolution image to the system clipboard as PNG.
 * The Blob promise is handed to ClipboardItem synchronously so Safari keeps the user gesture.
 */
export async function copyImageToClipboard(
  item: DropItem
): Promise<{ mode: 'image' | 'error'; message: string }> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return { mode: 'error', message: 'Copy blocked by browser' };
  }
  try {
    const pngPromise = resolveDropBlob(item).then((blob) =>
      blob.type === 'image/png' ? blob : convertBlobToPng(blob)
    );
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
    return { mode: 'image', message: 'Image copied!' };
  } catch {
    return { mode: 'error', message: 'Copy failed' };
  }
}

function triggerAnchorDownload(href: string, fileName: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Triggers a clean file download preserving UTF-8 / Thai filenames.
 * Throws when cloud chunks cannot be loaded so callers can surface the failure.
 */
export async function downloadDropFile(item: DropItem): Promise<void> {
  const fileName = item.fileName || `relay-${item.id}`;

  if (
    item.downloadUrl &&
    (item.downloadUrl.startsWith('data:') || item.downloadUrl.startsWith('blob:'))
  ) {
    triggerAnchorDownload(item.downloadUrl, fileName);
    return;
  }

  const blob = await resolveDropBlob(item);
  const objectUrl = URL.createObjectURL(blob);
  triggerAnchorDownload(objectUrl, fileName);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
