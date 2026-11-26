'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, QrCode, X } from 'lucide-react';
import { copyImageToClipboard, downloadDropFile } from '@/lib/clipboard-actions';
import { formatBytes, formatRelativeTime } from '@/lib/drop-utils';
import type { DropItem } from '@/lib/types';

interface ImageLightboxProps {
  item: DropItem | null;
  onClose: () => void;
  onOpenQr: (item: DropItem) => void;
}

export function ImageLightbox({ item, onClose, onOpenQr }: ImageLightboxProps) {
  const [feedback, setFeedback] = useState<{ itemId: string; text: string } | null>(null);

  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item || !item.downloadUrl) return null;

  const copyFeedback = feedback && feedback.itemId === item.id ? feedback.text : null;

  async function handleCopyImage() {
    if (!item?.downloadUrl) return;
    const result = await copyImageToClipboard(item.downloadUrl);
    setFeedback({ itemId: item.id, text: result.message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.itemId === item.id ? null : prev));
    }, 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      className="fixed inset-0 z-50 flex flex-col bg-black/88 backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 pb-4 border-b border-zinc-800/80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h2 id="lightbox-title" className="text-sm sm:text-base font-medium text-[#F4F5F7] truncate">
            {item.fileName || 'Dropped Image'}
          </h2>
          <p className="text-xs text-zinc-400 tabular-nums mt-0.5">
            {formatBytes(item.fileSize)} · {formatRelativeTime(item.createdAtMs)}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyImage}
            className="h-10 px-3.5 rounded-lg bg-[#13161C] border border-zinc-800 text-xs sm:text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {copyFeedback ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copyFeedback || 'Copy Image'}</span>
          </button>

          <button
            type="button"
            onClick={() => downloadDropFile(item)}
            className="h-10 px-3.5 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQr(item)}
            aria-label="Show QR code for image"
            className="h-10 w-10 rounded-lg bg-[#13161C] border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="h-10 w-10 rounded-lg bg-[#13161C] border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center py-6 overflow-hidden"
        onClick={onClose}
      >
        <img
          src={item.downloadUrl}
          alt={item.fileName || 'Full size preview'}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain rounded-lg border border-zinc-800/80 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
