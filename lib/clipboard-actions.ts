'use client';

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

async function convertImageUrlToPngBlob(url: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
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
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('PNG conversion failed'));
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Image load failed (check Storage CORS policy)'));
    img.src = url;
  });
}

/**
 * Copies an image to the system clipboard as PNG (supported across Safari, Chrome, Edge).
 * Falls back to copying the direct download URL if ClipboardItem is unavailable or CORS blocks pixel reads.
 */
export async function copyImageToClipboard(
  url: string
): Promise<{ mode: 'image' | 'url' | 'error'; message: string }> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      let pngBlob: Blob | null = null;

      if (url.startsWith('data:image/png')) {
        const res = await fetch(url);
        pngBlob = await res.blob();
      } else {
        try {
          const res = await fetch(url, { mode: 'cors' });
          const rawBlob = await res.blob();
          if (rawBlob.type === 'image/png') {
            pngBlob = rawBlob;
          } else {
            const objUrl = URL.createObjectURL(rawBlob);
            try {
              pngBlob = await convertImageUrlToPngBlob(objUrl);
            } finally {
              URL.revokeObjectURL(objUrl);
            }
          }
        } catch {
          pngBlob = await convertImageUrlToPngBlob(url);
        }
      }

      if (pngBlob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
        return { mode: 'image', message: 'Image copied!' };
      }
    }
  } catch {
    // Fall back to copying URL if direct image clipboard write is blocked
  }

  if (url.startsWith('https://') || url.startsWith('http://')) {
    const copied = await copyTextToClipboard(url);
    if (copied) {
      return { mode: 'url', message: 'Link copied!' };
    }
  }

  return { mode: 'error', message: 'Copy blocked by browser' };
}

/**
 * Triggers a clean file download preserving UTF-8 / Thai filenames.
 */
export async function downloadDropFile(item: DropItem): Promise<void> {
  if (!item.downloadUrl) return;
  const fileName = item.fileName || `personal-drop-${item.id}`;

  try {
    if (item.downloadUrl.startsWith('data:') || item.downloadUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = item.downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const res = await fetch(item.downloadUrl, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    // Direct anchor download fallback if remote CORS header isn't configured yet
    const a = document.createElement('a');
    a.href = item.downloadUrl;
    a.download = fileName;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
