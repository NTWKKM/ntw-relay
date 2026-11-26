'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  QrCode,
  Trash2,
} from 'lucide-react';
import {
  copyImageToClipboard,
  copyTextToClipboard,
  downloadDropFile,
} from '@/lib/clipboard-actions';
import {
  formatBytes,
  formatFileTypeLabel,
  formatRelativeTime,
  hasFileData,
  looksLikeCode,
  parseTextSegments,
} from '@/lib/drop-utils';
import type { DropItem } from '@/lib/types';

interface DropCardProps {
  item: DropItem;
  onDelete: (item: DropItem) => Promise<void>;
  onToggleCode: (item: DropItem, nextIsCode: boolean) => Promise<void>;
  onOpenQr: (item: DropItem) => void;
  onOpenImage: (item: DropItem) => void;
}

function FileTypeIcon({ fileName, mimeType }: { fileName?: string; mimeType?: string }) {
  const lower = (fileName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('zip') || mime.includes('tar') || /\.(zip|rar|7z|tar|gz)$/.test(lower)) {
    return <FileArchive className="w-4 h-4" aria-hidden="true" />;
  }
  if (mime.includes('spreadsheet') || /\.(csv|xlsx|xls)$/.test(lower)) {
    return <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />;
  }
  if (
    mime.includes('json') ||
    mime.includes('javascript') ||
    /\.(ts|tsx|js|jsx|py|json|yml|yaml|sql|sh|html|css|md)$/.test(lower)
  ) {
    return <FileCode className="w-4 h-4" aria-hidden="true" />;
  }
  return <FileText className="w-4 h-4" aria-hidden="true" />;
}

export function DropCard({
  item,
  onDelete,
  onToggleCode,
  onOpenQr,
  onOpenImage,
}: DropCardProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [downloadLabel, setDownloadLabel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const isCode = item.isCode ?? looksLikeCode(item.content);
  const itemDescriptor = item.fileName || item.content.slice(0, 32) || item.id;
  const canDownload = hasFileData(item);
  const imageSrc = item.downloadUrl ?? item.previewDataUrl;
  const fileExt = item.type === 'file' ? formatFileTypeLabel(item.fileName, item.mimeType) : null;

  async function handleCopyText() {
    const ok = await copyTextToClipboard(item.content);
    if (ok) {
      setCopiedLabel('Copied');
      setTimeout(() => setCopiedLabel(null), 1600);
    }
  }

  async function handleCopyImage() {
    if (!canDownload) return;
    const result = await copyImageToClipboard(item);
    setCopiedLabel(result.message);
    setTimeout(() => setCopiedLabel(null), 1800);
  }

  async function handleDownload() {
    if (!canDownload || downloadLabel) return;
    setDownloadLabel('…');
    try {
      await downloadDropFile(item);
      setDownloadLabel(null);
    } catch {
      setDownloadLabel('Failed');
      setTimeout(() => setDownloadLabel(null), 2200);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(item);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      data-testid="drop-card"
      data-drop-type={item.type}
      className="group rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] hover:border-[#CBC3B4] dark:hover:border-[#3F3A34] transition-colors px-4 sm:px-5 py-4 space-y-3"
    >
      {/* Whisper-quiet metadata + minimal action cluster */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-[#787268] dark:text-[#8A8378] tabular-nums min-w-0 whitespace-nowrap">
          <span className="font-medium text-[#3D3A35] dark:text-[#CFC8BC] capitalize">
            {item.type === 'text' && isCode ? 'Code' : fileExt || item.type}
          </span>
          {item.fileSize !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{formatBytes(item.fileSize)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(item.createdAtMs)}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {item.type === 'text' && (
            <>
              <button
                type="button"
                onClick={() => onToggleCode(item, !isCode)}
                aria-pressed={isCode}
                aria-label={
                  isCode
                    ? `Switch "${itemDescriptor}" to plain text`
                    : `Switch "${itemDescriptor}" to code`
                }
                title={isCode ? 'Plain text' : 'Code format'}
                className={`h-9 w-9 sm:h-8 sm:w-8 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                  isCode
                    ? 'bg-[#1D4ED8]/10 dark:bg-[#60A5FA]/15 text-[#1D4ED8] dark:text-[#60A5FA]'
                    : 'text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E] sm:opacity-65 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
                }`}
              >
                <Code2 className="w-4 h-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                aria-label={`Copy text "${itemDescriptor}"`}
                className="h-9 sm:h-8 px-2.5 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedLabel ? (
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span className={copiedLabel ? 'text-[#15803D] dark:text-[#4ADE80]' : ''}>
                  {copiedLabel || 'Copy'}
                </span>
              </button>
            </>
          )}

          {item.type === 'image' && canDownload && (
            <>
              <button
                type="button"
                onClick={handleCopyImage}
                aria-label={`Copy image "${itemDescriptor}"`}
                className="h-9 sm:h-8 px-2.5 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedLabel ? (
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span className={copiedLabel ? 'text-[#15803D] dark:text-[#4ADE80]' : ''}>
                  {copiedLabel || 'Copy'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                aria-label={`Download image "${itemDescriptor}"`}
                title="Download"
                className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg text-[#6B655C] dark:text-[#968F84] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E] transition-colors flex items-center justify-center cursor-pointer sm:opacity-65 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
              </button>
            </>
          )}

          {item.type === 'file' && canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              aria-label={`Download file "${itemDescriptor}"`}
              className="h-9 sm:h-8 px-2.5 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{downloadLabel || 'Download'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenQr(item)}
            aria-label={`Show QR code for "${itemDescriptor}"`}
            title="QR"
            className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E] transition-colors flex items-center justify-center cursor-pointer sm:opacity-65 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete "${itemDescriptor}"`}
            title="Delete"
            className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg text-[#787268] dark:text-[#8A8378] hover:text-[#B91C1C] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1717]/60 disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer sm:opacity-65 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content Body */}
      {item.type === 'text' && (
        <div
          className={
            isCode
              ? 'rounded-lg bg-[#F2EFE7] dark:bg-[#131210] border border-[#E5DFD3] dark:border-[#272420] px-3.5 py-3 overflow-x-auto'
              : ''
          }
        >
          {isCode ? (
            <pre className="text-xs sm:text-[13px] font-mono text-[#1F1D1A] dark:text-[#E5DFD5] whitespace-pre overflow-x-auto leading-relaxed">
              <code>{item.content}</code>
            </pre>
          ) : (
            <p className="text-[15px] text-[#181715] dark:text-[#F3EFE8] whitespace-pre-wrap [overflow-wrap:anywhere] leading-[1.65] max-w-[70ch]">
              {parseTextSegments(item.content).map((seg, idx) =>
                seg.type === 'url' ? (
                  <a
                    key={idx}
                    href={seg.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1D4ED8] dark:text-[#60A5FA] hover:opacity-80 underline underline-offset-4 decoration-[#1D4ED8]/35 dark:decoration-[#60A5FA]/40 inline-flex items-baseline gap-1 [overflow-wrap:anywhere]"
                  >
                    <span>{seg.value}</span>
                    <ExternalLink className="w-3 h-3 inline shrink-0 self-center" aria-hidden="true" />
                  </a>
                ) : (
                  <React.Fragment key={idx}>{seg.value}</React.Fragment>
                )
              )}
            </p>
          )}
        </div>
      )}

      {item.type === 'image' && (
        <div className="space-y-2">
          {imageSrc && !imgBroken ? (
            <button
              type="button"
              onClick={() => onOpenImage(item)}
              aria-label={`View full size image "${item.fileName || 'Image'}"`}
              className="group/img block max-w-full rounded-lg overflow-hidden border border-[#E2DCD0] dark:border-[#2C2925] bg-[#F2EFE7] dark:bg-[#131210] cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              <img
                src={imageSrc}
                alt={item.fileName || 'Dropped image'}
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                className="block max-h-72 w-auto max-w-full object-contain transition-transform duration-200 ease-out group-hover/img:scale-[1.01]"
              />
            </button>
          ) : (
            <div className="rounded-lg border border-[#E2DCD0] dark:border-[#2C2925] bg-[#F2EFE7] dark:bg-[#131210] px-4 py-8 flex flex-col items-center justify-center gap-2 text-[#787268] dark:text-[#8A8378]">
              <FileImage className="w-5 h-5" aria-hidden="true" />
              <span className="text-xs">Preview unavailable</span>
            </div>
          )}

          {item.fileName && (
            <p className="font-mono text-xs text-[#787268] dark:text-[#8A8378] truncate">
              {item.fileName}
            </p>
          )}
        </div>
      )}

      {item.type === 'file' && (
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#F2EFE7] dark:bg-[#141311] border border-[#E2DCD0] dark:border-[#2C2925] flex items-center justify-center text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
            <FileTypeIcon fileName={item.fileName} mimeType={item.mimeType} />
          </div>
          <p className="text-sm font-medium text-[#181715] dark:text-[#F3EFE8] break-words min-w-0">
            {item.fileName || 'Untitled file'}
          </p>
        </div>
      )}
    </motion.article>
  );
}
