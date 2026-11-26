'use client';

import React, { useState } from 'react';
import { Check, Copy, ExternalLink, Info, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ModalDialog } from './ModalDialog';
import { copyTextToClipboard } from '@/lib/clipboard-actions';
import { isSafeHttpUrl } from '@/lib/drop-utils';

export interface QrModalData {
  title: string;
  subtitle?: string;
  value: string | null;
  unavailableReason?: string;
}

interface QrModalProps {
  data: QrModalData | null;
  onClose: () => void;
}

export function QrModal({ data, onClose }: QrModalProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copied = Boolean(data?.value && copiedValue === data.value);
  const isUrl = Boolean(data?.value && isSafeHttpUrl(data.value));

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
    <ModalDialog
      open={Boolean(data)}
      onClose={onClose}
      ariaLabelledBy="qr-modal-title"
      size="sm"
    >
      {data && (
        <div className="w-full rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#DDD6C8] dark:border-[#2E2A25] p-5 sm:p-6 space-y-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="qr-modal-title"
                className="font-[family-name:var(--font-display)] text-lg font-medium text-[#181715] dark:text-[#F3EFE8] truncate"
              >
                {data.title}
              </h2>
              {data.subtitle && (
                <p className="mt-0.5 text-xs text-[#6B655C] dark:text-[#968F84] truncate">
                  {data.subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close QR dialog"
              className="h-9 w-9 -mr-1.5 -mt-1.5 rounded-lg flex items-center justify-center text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#272420] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {data.value ? (
            <>
              <div className="flex items-center justify-center">
                <div className="bg-white p-5 rounded-xl border border-[#E2DCD0] dark:border-transparent">
                  <QRCodeSVG
                    value={data.value}
                    size={212}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#181715"
                    includeMargin={false}
                  />
                </div>
              </div>

              <p className="rounded-lg bg-[#F2EFE7] dark:bg-[#131210] border border-[#E2DCD0] dark:border-[#272420] px-3 py-2 text-xs font-mono text-[#3D3A35] dark:text-[#CFC8BC] [overflow-wrap:anywhere] line-clamp-2">
                {data.value}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-1 h-10 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-[#4ADE80] dark:text-[#15803D]" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                {isUrl && (
                  <a
                    href={data.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-10 px-3.5 rounded-lg bg-[#F2EFE7] dark:bg-[#25221E] border border-[#DDD6C8] dark:border-[#322E28] text-[#181715] dark:text-[#F3EFE8] text-sm font-medium hover:border-[#BFB7A8] dark:hover:border-[#4A453E] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    <span>Open</span>
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-[#F2EFE7] dark:bg-[#131210] border border-[#E2DCD0] dark:border-[#272420] p-4 flex items-start gap-3">
              <Info
                className="w-4 h-4 text-[#1D4ED8] dark:text-[#60A5FA] mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm text-[#3D3A35] dark:text-[#CFC8BC] leading-relaxed">
                {data.unavailableReason || 'QR unavailable.'}
              </p>
            </div>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
