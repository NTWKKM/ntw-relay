'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lightbox-title"
      className="fixed inset-0 z-50 flex flex-col bg-[#121110]/92 backdrop-blur-md p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 pb-4 border-b border-[#2C2925]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <h2
            id="lightbox-title"
            className="font-[family-name:var(--font-display)] text-base font-medium text-[#F3EFE8] truncate"
          >
            {item.fileName || 'Dropped Image'}
          </h2>
          <p className="font-mono text-xs text-[#A8A196] tabular-nums mt-0.5">
            {formatBytes(item.fileSize)} · {formatRelativeTime(item.createdAtMs)}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyImage}
            className="h-9 px-3.5 rounded-lg bg-[#1E1C1A] border border-[#322E28] text-xs sm:text-sm font-medium text-[#F3EFE8] hover:bg-[#2A2723] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {copyFeedback ? (
              <Check className="w-4 h-4 text-[#4ADE80]" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span>{copyFeedback || 'Copy Image'}</span>
          </button>

          <button
            type="button"
            onClick={() => downloadDropFile(item)}
            className="h-9 px-3.5 rounded-lg bg-[#F3EFE8] text-[#121110] text-xs sm:text-sm font-medium hover:bg-[#E2DBD0] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenQr(item)}
            aria-label="Show QR code for image"
            className="h-9 w-9 rounded-lg bg-[#1E1C1A] border border-[#322E28] text-[#CFC8BC] hover:text-[#F3EFE8] hover:bg-[#2A2723] transition-colors flex items-center justify-center cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="h-9 w-9 rounded-lg bg-[#1E1C1A] border border-[#322E28] text-[#CFC8BC] hover:text-[#F3EFE8] hover:bg-[#2A2723] transition-colors flex items-center justify-center cursor-pointer"
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
          className="max-h-full max-w-full object-contain rounded-lg border border-[#2C2925] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </motion.div>
  );
}
