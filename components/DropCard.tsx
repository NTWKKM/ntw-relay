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
  Maximize2,
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
    return <FileArchive className="w-5 h-5" aria-hidden="true" />;
  }
  if (mime.includes('spreadsheet') || /\.(csv|xlsx|xls)$/.test(lower)) {
    return <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />;
  }
  if (
    mime.includes('json') ||
    mime.includes('javascript') ||
    /\.(ts|tsx|js|jsx|py|json|yml|yaml|sql|sh|html|css|md)$/.test(lower)
  ) {
    return <FileCode className="w-5 h-5" aria-hidden="true" />;
  }
  return <FileText className="w-5 h-5" aria-hidden="true" />;
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
  const lineCount = item.type === 'text' ? item.content.split('\n').length : 0;
  const canDownload = hasFileData(item);
  const imageSrc = item.downloadUrl ?? item.previewDataUrl;

  async function handleCopyText() {
    const ok = await copyTextToClipboard(item.content);
    if (ok) {
      setCopiedLabel('Copied');
      setTimeout(() => setCopiedLabel(null), 1800);
    }
  }

  async function handleCopyImage() {
    if (!canDownload) return;
    const result = await copyImageToClipboard(item);
    setCopiedLabel(result.message);
    setTimeout(() => setCopiedLabel(null), 2000);
  }

  async function handleDownload() {
    if (!canDownload || downloadLabel) return;
    setDownloadLabel('Loading…');
    try {
      await downloadDropFile(item);
      setDownloadLabel(null);
    } catch {
      setDownloadLabel('Failed');
      setTimeout(() => setDownloadLabel(null), 2400);
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      data-testid="drop-card"
      data-drop-type={item.type}
      className="group rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] hover:border-[#CBC3B4] dark:hover:border-[#3F3A34] transition-colors p-5 sm:p-6 space-y-4"
    >
      {/* Top Unboxed Metadata + Calm Action Cluster */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#6B655C] dark:text-[#968F84] tabular-nums min-w-0">
          <span className="font-semibold text-[#181715] dark:text-[#F3EFE8] capitalize">
            {item.type === 'text' && isCode ? 'Code' : item.type}
          </span>
          {item.type === 'text' && isCode && lineCount > 1 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{lineCount} lines</span>
            </>
          )}
          {item.fileSize !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{formatBytes(item.fileSize)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(item.createdAtMs)}</span>
          {item.isLocalOnly && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#8E877B] dark:text-[#777066]">Local</span>
            </>
          )}
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
                    : `Switch "${itemDescriptor}" to monospace code`
                }
                className={`h-10 sm:h-8 px-2.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isCode
                    ? 'bg-[#1D4ED8]/10 dark:bg-[#60A5FA]/15 text-[#1D4ED8] dark:text-[#60A5FA]'
                    : 'text-[#6B655C] dark:text-[#968F84] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E]'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Code</span>
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                aria-label={`Copy text "${itemDescriptor}"`}
                className="h-10 sm:h-8 px-3 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
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
                className="h-10 sm:h-8 px-3 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedLabel ? (
                  <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span className={copiedLabel ? 'text-[#15803D] dark:text-[#4ADE80]' : ''}>
                  {copiedLabel || 'Copy Image'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                aria-label={`Download image "${itemDescriptor}"`}
                className="h-10 sm:h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{downloadLabel || 'Download'}</span>
              </button>
            </>
          )}

          {item.type === 'file' && canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              aria-label={`Download file "${itemDescriptor}"`}
              className="h-10 sm:h-8 px-3 rounded-lg bg-[#F5F2EB] dark:bg-[#22201C] border border-[#E2DCD0] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{downloadLabel || 'Download'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenQr(item)}
            aria-label={`Show QR code for "${itemDescriptor}"`}
            className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg text-[#6B655C] dark:text-[#968F84] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F1EDE4] dark:hover:bg-[#25221E] transition-colors flex items-center justify-center cursor-pointer"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete "${itemDescriptor}"`}
            className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg text-[#787268] dark:text-[#8A8378] hover:text-[#B91C1C] dark:hover:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1717]/60 disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Card Content Body */}
      {item.type === 'text' && (
        <div
          className={
            isCode
              ? 'rounded-lg bg-[#F2EFE7] dark:bg-[#131210] border border-[#E5DFD3] dark:border-[#272420] p-4 overflow-x-auto'
              : ''
          }
        >
          {isCode ? (
            <pre className="text-xs sm:text-[13px] font-mono text-[#1F1D1A] dark:text-[#E5DFD5] whitespace-pre overflow-x-auto leading-relaxed">
              <code>{item.content}</code>
            </pre>
          ) : (
            <p className="text-[15px] text-[#181715] dark:text-[#F3EFE8] whitespace-pre-wrap [overflow-wrap:anywhere] leading-[1.7] max-w-[72ch]">
              {parseTextSegments(item.content).map((seg, idx) =>
                seg.type === 'url' ? (
                  <a
                    key={idx}
                    href={seg.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1D4ED8] dark:text-[#60A5FA] hover:opacity-80 underline underline-offset-4 decoration-[#1D4ED8]/40 dark:decoration-[#60A5FA]/45 inline-flex items-baseline gap-1 [overflow-wrap:anywhere]"
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
        <div className="space-y-2.5">
          {imageSrc && !imgBroken ? (
            <button
              type="button"
              onClick={() => onOpenImage(item)}
              aria-label={`View full size image "${item.fileName || 'Dropped image'}"`}
              className="group/img relative inline-block max-w-full rounded-lg overflow-hidden border border-[#E2DCD0] dark:border-[#2C2925] bg-[#F2EFE7] dark:bg-[#131210] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
            >
              <img
                src={imageSrc}
                alt={item.fileName || 'Dropped image preview'}
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                className="block max-h-80 w-auto max-w-full object-contain transition-opacity duration-150 group-hover/img:opacity-95"
              />
              <span className="absolute bottom-2.5 right-2.5 h-8 px-2.5 rounded-md bg-[#181715]/85 backdrop-blur-sm text-xs font-medium text-[#FCFBF8] flex items-center gap-1.5 opacity-90 group-hover/img:opacity-100 transition-opacity">
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Full size</span>
              </span>
            </button>
          ) : (
            <div className="rounded-lg border border-[#E2DCD0] dark:border-[#2C2925] bg-[#F2EFE7] dark:bg-[#131210] px-4 py-8 flex flex-col items-center justify-center gap-2 text-[#787268] dark:text-[#8A8378]">
              <FileImage className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs">Preview unavailable</span>
            </div>
          )}

          {item.fileName && (
            <p className="font-mono text-xs text-[#6B655C] dark:text-[#968F84] break-all">
              {item.fileName}
            </p>
          )}
        </div>
      )}

      {item.type === 'file' && (
        <div className="flex items-center gap-4 pt-1">
          <div className="w-11 h-11 rounded-lg bg-[#F2EFE7] dark:bg-[#141311] border border-[#E2DCD0] dark:border-[#2C2925] flex items-center justify-center text-[#1D4ED8] dark:text-[#60A5FA] shrink-0">
            <FileTypeIcon fileName={item.fileName} mimeType={item.mimeType} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#181715] dark:text-[#F3EFE8] break-words">
              {item.fileName || 'Untitled file'}
            </p>
            <p className="font-mono text-xs text-[#6B655C] dark:text-[#968F84] mt-0.5 tabular-nums truncate">
              {item.mimeType || 'application/octet-stream'} · {formatBytes(item.fileSize)}
            </p>
          </div>
        </div>
      )}
    </motion.article>
  );
}
