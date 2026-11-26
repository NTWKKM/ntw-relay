'use client';

/** Keep below the firestore.rules previewDataUrl cap (160,000 chars). */
export const PREVIEW_MAX_CHARS = 150_000;

const PREVIEW_ATTEMPTS: ReadonlyArray<{ edge: number; quality: number }> = [
  { edge: 640, quality: 0.72 },
  { edge: 480, quality: 0.6 },
  { edge: 320, quality: 0.5 },
];

/**
 * Creates a small JPEG data URL preview for an image Blob so the Firestore feed can render
 * thumbnails without downloading the full chunked file. Returns null when the browser cannot
 * decode the image (e.g. HEIC) or the preview cannot fit under PREVIEW_MAX_CHARS.
 */
export async function createImagePreviewDataUrl(file: Blob): Promise<string | null> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const { width, height } = bitmap;
    if (!width || !height) return null;

    for (const { edge, quality } of PREVIEW_ATTEMPTS) {
      const scale = Math.min(1, edge / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG has no alpha channel: paint a neutral background under transparent PNGs
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.startsWith('data:image/jpeg;base64,') && dataUrl.length <= PREVIEW_MAX_CHARS) {
        return dataUrl;
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
