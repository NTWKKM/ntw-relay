'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Info, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { copyTextToClipboard } from '@/lib/clipboard-actions';
import { isSafeHttpUrl } from '@/lib/drop-utils';

export interface QrModalData {
  title: string;
  subtitle: string;
  value: string | null;
  unavailableReason?: string;
}

interface QrModalProps {
  data: QrModalData | null;
  onClose: () => void;
}

export function QrModal({ data, onClose }: QrModalProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  const copied = Boolean(data.value && copiedValue === data.value);
  const isUrl = Boolean(data.value && isSafeHttpUrl(data.value));

  async function handleCopy() {
    if (!data?.value) return;
    const val = data.value;
    const ok = await copyTextToClipboard(val);
    if (ok) {
      setCopiedValue(val);
      setTimeout(() => {
        setCopiedValue((prev) => (prev === val ? null : prev));
      }, 1800);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-[#13161C] border border-zinc-800 p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="qr-modal-title" className="text-base font-semibold text-[#F4F5F7] truncate">
              {data.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-400 truncate">{data.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR modal"
            className="h-9 w-9 -mr-1.5 -mt-1.5 rounded-lg flex items-center justify-center text-zinc-400 hover:text-[#F4F5F7] hover:bg-zinc-800/80 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {data.value ? (
          <>
            {/* High-contrast white quiet-zone frame for reliable Dark Mode scanning */}
            <div className="flex items-center justify-center">
              <div className="bg-white p-5 rounded-xl shadow-sm">
                <QRCodeSVG
                  value={data.value}
                  size={216}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#0B0D11"
                  includeMargin={false}
                />
              </div>
            </div>

            <div className="rounded-lg bg-[#0B0D11] border border-zinc-800/80 px-3.5 py-2.5">
              <p className="text-xs font-mono text-zinc-300 [overflow-wrap:anywhere] line-clamp-3">
                {data.value}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 h-10 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-sm font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : isUrl ? 'Copy Link' : 'Copy Text'}</span>
              </button>

              {isUrl && (
                <a
                  href={data.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-10 px-3.5 rounded-lg bg-zinc-800/90 text-zinc-200 text-sm font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open</span>
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-[#0B0D11] border border-zinc-800 p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm text-zinc-300 leading-relaxed">
              {data.unavailableReason || 'QR code is unavailable for this item.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
