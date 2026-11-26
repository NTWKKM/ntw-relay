'use client';

import React, { useState } from 'react';
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
  const [deleting, setDeleting] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const isCode = item.isCode ?? looksLikeCode(item.content);
  const itemDescriptor = item.fileName || item.content.slice(0, 32) || item.id;

  async function handleCopyText() {
    const ok = await copyTextToClipboard(item.content);
    if (ok) {
      setCopiedLabel('Copied!');
      setTimeout(() => setCopiedLabel(null), 1800);
    }
  }

  async function handleCopyImage() {
    if (!item.downloadUrl) return;
    const result = await copyImageToClipboard(item.downloadUrl);
    setCopiedLabel(result.message);
    setTimeout(() => setCopiedLabel(null), 2000);
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
    <article
      data-testid="drop-card"
      data-drop-type={item.type}
      className="rounded-xl bg-[#13161C] border border-zinc-800/85 hover:border-zinc-700/90 transition-colors p-4 sm:p-5 space-y-3.5"
    >
      {/* Top Unboxed Metadata + Actions Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums min-w-0">
          <span className="font-medium text-zinc-300 capitalize">{item.type}</span>
          {item.fileSize !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatBytes(item.fileSize)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(item.createdAtMs)}</span>
          {item.isLocalOnly && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-zinc-500">Local</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {item.type === 'text' && (
            <>
              <button
                type="button"
                onClick={() => onToggleCode(item, !isCode)}
                aria-pressed={isCode}
                aria-label={isCode ? `Switch "${itemDescriptor}" to plain text` : `Switch "${itemDescriptor}" to monospace code`}
                className={`h-10 sm:h-9 px-3 sm:px-2.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isCode
                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                    : 'bg-[#0B0D11] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Code</span>
              </button>

              <button
                type="button"
                onClick={handleCopyText}
                aria-label={`Copy text "${itemDescriptor}"`}
                className="h-10 sm:h-9 px-3 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedLabel ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span className={copiedLabel ? 'text-emerald-400' : ''}>
                  {copiedLabel || 'Copy'}
                </span>
              </button>
            </>
          )}

          {item.type === 'image' && item.downloadUrl && (
            <>
              <button
                type="button"
                onClick={handleCopyImage}
                aria-label={`Copy image "${itemDescriptor}"`}
                className="h-10 sm:h-9 px-3 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedLabel ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span className={copiedLabel ? 'text-emerald-400' : ''}>
                  {copiedLabel || 'Copy Image'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => downloadDropFile(item)}
                aria-label={`Download image "${itemDescriptor}"`}
                className="h-10 sm:h-9 px-3 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Download</span>
              </button>
            </>
          )}

          {item.type === 'file' && item.downloadUrl && (
            <button
              type="button"
              onClick={() => downloadDropFile(item)}
              aria-label={`Download file "${itemDescriptor}"`}
              className="h-10 sm:h-9 px-3 rounded-lg bg-[#0B0D11] border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenQr(item)}
            aria-label={`Show QR code for "${itemDescriptor}"`}
            className="h-10 w-10 sm:h-9 sm:w-9 rounded-lg bg-[#0B0D11] border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors flex items-center justify-center cursor-pointer"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete "${itemDescriptor}"`}
            className="h-10 w-10 sm:h-9 sm:w-9 rounded-lg bg-[#0B0D11] border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/40 disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer"
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
              ? 'rounded-lg bg-[#0B0D11] border border-zinc-800/80 p-3.5 overflow-x-auto'
              : ''
          }
        >
          {isCode ? (
            <pre className="text-xs sm:text-[13px] font-mono text-zinc-200 whitespace-pre overflow-x-auto leading-relaxed">
              <code>{item.content}</code>
            </pre>
          ) : (
            <p className="text-sm sm:text-[15px] text-[#F4F5F7] whitespace-pre-wrap [overflow-wrap:anywhere] leading-relaxed">
              {parseTextSegments(item.content).map((seg, idx) =>
                seg.type === 'url' ? (
                  <a
                    key={idx}
                    href={seg.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 decoration-indigo-500/50 inline-flex items-baseline gap-1 [overflow-wrap:anywhere]"
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
          {item.downloadUrl && !imgBroken ? (
            <button
              type="button"
              onClick={() => onOpenImage(item)}
              aria-label={`View full size image "${item.fileName || 'Dropped image'}"`}
              className="group relative inline-block max-w-full rounded-lg overflow-hidden border border-zinc-800/90 bg-[#0B0D11] text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <img
                src={item.downloadUrl}
                alt={item.fileName || 'Dropped image preview'}
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                className="block max-h-80 w-auto max-w-full object-contain transition-opacity duration-150 group-hover:opacity-95"
              />
              <span className="absolute bottom-2.5 right-2.5 h-8 px-2.5 rounded-md bg-black/80 backdrop-blur-sm text-xs font-medium text-zinc-100 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Full size</span>
              </span>
            </button>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-[#0B0D11] px-4 py-8 flex flex-col items-center justify-center gap-2 text-zinc-500">
              <FileImage className="w-6 h-6" aria-hidden="true" />
              <span className="text-xs">Preview unavailable</span>
            </div>
          )}

          {item.fileName && (
            <p className="text-xs text-zinc-400 break-all">{item.fileName}</p>
          )}
        </div>
      )}

      {item.type === 'file' && (
        <div className="flex items-center gap-3.5 rounded-lg bg-[#0B0D11] border border-zinc-800/80 px-4 py-3.5">
          <div className="w-10 h-10 rounded-lg bg-[#13161C] border border-zinc-800 flex items-center justify-center text-indigo-400 shrink-0">
            <FileTypeIcon fileName={item.fileName} mimeType={item.mimeType} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#F4F5F7] break-words">
              {item.fileName || 'Untitled file'}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5 tabular-nums truncate">
              {item.mimeType || 'application/octet-stream'} · {formatBytes(item.fileSize)}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
