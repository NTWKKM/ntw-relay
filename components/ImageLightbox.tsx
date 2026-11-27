'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, Download, QrCode, X } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import {
  copyImageToClipboard,
  downloadDropFile,
  resolveDropBlob,
} from '@/lib/clipboard-actions';
import { formatBytes, formatRelativeTime, hasFileData } from '@/lib/drop-utils';
import type { DropItem } from '@/lib/types';

interface ImageLightboxProps {
  item: DropItem | null;
  onClose: () => void;
  onOpenQr: (item: DropItem) => void;
}

export function ImageLightbox({ item, onClose, onOpenQr }: ImageLightboxProps) {
  const [copyFeedback, setCopyFeedback] = useState<{
    itemId: string;
    text: string;
    ok: boolean;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<{ itemId: string; text: string } | null>(null);
  const [fullImage, setFullImage] = useState<{ itemId: string; url: string } | null>(null);

  const itemId = item?.id ?? null;
  const itemOwnerId = item?.ownerId ?? '';
  const itemType = item?.type ?? 'image';
  const itemContent = item?.content ?? '';
  const itemMimeType = item?.mimeType;
  const itemFileSize = item?.fileSize;
  const itemIsLocalOnly = item?.isLocalOnly;
  const itemCreatedAtMs = item?.createdAtMs ?? 0;
  const itemDownloadUrl = item?.downloadUrl;
  const itemChunkCount = item?.chunkCount;

  // Cloud images: display inline preview immediately, then swap in full chunked image
  useEffect(() => {
    if (!itemId || itemDownloadUrl || typeof itemChunkCount !== 'number') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const blobTarget: DropItem = {
      id: itemId,
      ownerId: itemOwnerId,
      type: itemType,
      content: itemContent,
      mimeType: itemMimeType,
      fileSize: itemFileSize,
      chunkCount: itemChunkCount,
      isLocalOnly: itemIsLocalOnly,
      createdAtMs: itemCreatedAtMs,
    };
    resolveDropBlob(blobTarget)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFullImage({ itemId, url: objectUrl });
      })
      .catch(() => {
        // Keep preview if chunks fail to load
      });
    return () => {
      cancelled = true;
      if (objectUrl) {
        const revoked = objectUrl;
        URL.revokeObjectURL(revoked);
        setFullImage((prev) => (prev?.url === revoked ? null : prev));
      }
    };
  }, [
    itemId,
    itemOwnerId,
    itemType,
    itemContent,
    itemMimeType,
    itemFileSize,
    itemChunkCount,
    itemIsLocalOnly,
    itemCreatedAtMs,
    itemDownloadUrl,
  ]);

  const isOpen = Boolean(item && hasFileData(item));
  const imageSrc = item
    ? item.downloadUrl ??
      (fullImage && fullImage.itemId === item.id ? fullImage.url : item.previewDataUrl)
    : undefined;
  const activeCopyFeedback =
    item && copyFeedback && copyFeedback.itemId === item.id ? copyFeedback : null;
  const activeDownloadError =
    item && downloadError && downloadError.itemId === item.id ? downloadError.text : null;

  async function handleCopyImage() {
    if (!item) return;
    const result = await copyImageToClipboard(item);
    setCopyFeedback({
      itemId: item.id,
      text: result.message,
      ok: result.mode === 'image',
    });
    setTimeout(() => {
      setCopyFeedback((prev) => (prev?.itemId === item.id ? null : prev));
    }, 2000);
  }

  async function handleDownload() {
    if (!item) return;
    setDownloadError(null);
    try {
      await downloadDropFile(item);
    } catch {
      setDownloadError({ itemId: item.id, text: 'Failed' });
      setTimeout(() => {
        setDownloadError((prev) => (prev?.itemId === item.id ? null : prev));
      }, 2400);
    }
  }

  return (
    <ModalDialog
      open={isOpen}
      onClose={onClose}
      ariaLabelledBy="lightbox-title"
      variant="fullscreen"
    >
      {item && (
        <div
          className="h-dvh w-full flex flex-col bg-board/95 p-4 sm:p-6 text-board-type"
          onClick={onClose}
        >
          <div
            className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4 pb-4 border-b border-rule/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <h2
                id="lightbox-title"
                className="font-display text-base font-semibold text-board-type truncate"
              >
                {item.fileName || 'Image'}
              </h2>
              <p className="text-xs text-board-type/70 tabular-nums mt-0.5 flex items-center gap-3">
                <span>{formatBytes(item.fileSize)}</span>
                <span>{formatRelativeTime(item.createdAtMs)}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyImage}
                className="h-9 px-3 rounded-input bg-paper-2/15 border border-board-type/20 text-xs sm:text-sm font-medium text-board-type hover:bg-paper-2/25 active:translate-y-px transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {activeCopyFeedback ? (
                  activeCopyFeedback.ok ? (
                    <Check className="w-4 h-4 text-success" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-error" aria-hidden="true" />
                  )
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
                <span>{activeCopyFeedback ? activeCopyFeedback.text : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="h-9 px-3 rounded-input bg-board-type text-board text-xs sm:text-sm font-medium hover:opacity-90 active:translate-y-px transition-opacity flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {activeDownloadError ? (
                  <AlertCircle className="w-4 h-4 text-error" aria-hidden="true" />
                ) : (
                  <Download className="w-4 h-4" aria-hidden="true" />
                )}
                <span className={activeDownloadError ? 'text-error' : 'hidden sm:inline'}>
                  {activeDownloadError || 'Download'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenQr(item)}
                aria-label="Show QR code for image"
                className="h-9 w-9 rounded-input bg-paper-2/15 border border-board-type/20 text-board-type/80 hover:text-board-type hover:bg-paper-2/25 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer"
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close image preview"
                className="h-9 w-9 rounded-input bg-paper-2/15 border border-board-type/20 text-board-type/80 hover:text-board-type hover:bg-paper-2/25 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center py-6 overflow-hidden">
            <img
              src={imageSrc}
              alt={item.fileName || 'Full size preview'}
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain rounded-card border border-board-type/15"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
