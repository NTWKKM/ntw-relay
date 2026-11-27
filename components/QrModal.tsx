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
        <div className="w-full rounded-card coral-stock p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="qr-modal-title"
                className="font-display text-lg font-semibold text-ink truncate"
              >
                {data.title}
              </h2>
              {data.subtitle && (
                <p className="mt-0.5 text-xs text-muted truncate">
                  {data.subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close QR dialog"
              className="h-9 w-9 -mr-1.5 -mt-1.5 rounded-input flex items-center justify-center text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {data.value ? (
            <>
              <div className="flex items-center justify-center">
                <div className="bg-cotton p-5 rounded-input border border-rule">
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

              <p className="rounded-input bg-paper-2 border border-rule px-3 py-2 text-xs font-outlier text-ink-2 [overflow-wrap:anywhere] line-clamp-2">
                {data.value}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="coral-btn-ink flex-1 h-10 rounded-stock text-sm font-medium flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-paid" aria-hidden="true" />
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
                    className="coral-btn-secondary h-10 px-3.5 rounded-stock text-sm font-medium flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    <span>Open</span>
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-input bg-paper-2 border border-rule p-4 flex items-start gap-3">
              <Info
                className="w-4 h-4 text-accent-2 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm text-ink-2 leading-relaxed">
                {data.unavailableReason || 'QR unavailable.'}
              </p>
            </div>
          )}
        </div>
      )}
    </ModalDialog>
  );
}
