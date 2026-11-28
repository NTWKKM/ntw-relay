'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Copy, X } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { copyTextToClipboard } from '@/lib/clipboard-actions';

type DocTab = 'firestore' | 'deploy';

interface SetupDocsModalProps {
  open: boolean;
  onClose: () => void;
}

// Mirrors firestore.rules (keep in sync when rules change)
const FIRESTORE_RULES_SNIPPET = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isVerified() {
      return isSignedIn() && request.auth.token.email_verified == true;
    }

    function isValidId(id) {
      return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidDrop(data) {
      return data.keys().hasAll(['ownerId', 'type', 'content', 'createdAt'])
        && data.keys().hasOnly([
          'ownerId', 'type', 'content', 'fileName', 'fileSize',
          'mimeType', 'chunkCount', 'previewDataUrl', 'isCode', 'createdAt'
        ])
        && data.ownerId is string && data.ownerId.size() >= 1 && data.ownerId.size() <= 128
        && data.ownerId.matches('^[a-zA-Z0-9_\\\\-]+$')
        && data.ownerId == request.auth.uid
        && data.type in ['text', 'image', 'file']
        && data.content is string && data.content.size() <= 50000
        && data.createdAt is timestamp
        && (!('fileName' in data) || (data.fileName is string && data.fileName.size() <= 255))
        && (!('fileSize' in data) || (data.fileSize is number && data.fileSize >= 0 && data.fileSize <= 10485760))
        && (!('mimeType' in data) || (data.mimeType is string && data.mimeType.size() <= 128))
        && (!('chunkCount' in data) || (data.chunkCount is int && data.chunkCount >= 0 && data.chunkCount <= 14))
        && (!('previewDataUrl' in data) || (data.previewDataUrl is string && data.previewDataUrl.size() <= 160000 && data.previewDataUrl.matches('^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')))
        && (!('isCode' in data) || (data.isCode is bool));
    }

    function isValidChunk(data, chunkId) {
      return data.keys().hasAll(['ownerId', 'index', 'data'])
        && data.keys().hasOnly(['ownerId', 'index', 'data'])
        && data.ownerId is string && data.ownerId.size() >= 1 && data.ownerId.size() <= 128
        && data.ownerId == request.auth.uid
        && data.index is int && data.index >= 0 && data.index <= 13
        && chunkId.matches('^[0-9]{1,2}$') && chunkId == string(data.index)
        && data.data is bytes && data.data.size() >= 1 && data.data.size() <= 786432;
    }

    match /drops/{dropId} {
      allow get: if isSignedIn() && isValidId(dropId) && existing().ownerId == request.auth.uid;
      allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;
      allow create: if isVerified() && isValidId(dropId) && isValidDrop(incoming()) && incoming().createdAt == request.time;
      allow update: if isVerified() && isValidId(dropId) && isValidDrop(incoming())
        && existing().ownerId == request.auth.uid
        && incoming().ownerId == existing().ownerId
        && incoming().createdAt == existing().createdAt
        && incoming().diff(existing()).affectedKeys().hasOnly(['isCode']);
      allow delete: if isVerified() && isValidId(dropId) && existing().ownerId == request.auth.uid;

      match /chunks/{chunkId} {
        allow get: if isSignedIn() && isValidId(dropId) && chunkId.matches('^[0-9]{1,2}$') && existing().ownerId == request.auth.uid;
        allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;
        allow create: if isVerified() && isValidId(dropId) && isValidChunk(incoming(), chunkId);
        allow update: if false;
        allow delete: if isVerified() && isValidId(dropId) && chunkId.matches('^[0-9]{1,2}$') && existing().ownerId == request.auth.uid;
      }
    }
  }
}`;

const DEPLOY_SNIPPET = `firebase deploy --only firestore:rules
GITHUB_PAGES=true npm run build`;

export function SetupDocsModal({ open, onClose }: SetupDocsModalProps) {
  const [tab, setTab] = useState<DocTab>('firestore');
  const [copied, setCopied] = useState(false);

  const activeSnippet = tab === 'firestore' ? FIRESTORE_RULES_SNIPPET : DEPLOY_SNIPPET;

  async function handleCopy() {
    const ok = await copyTextToClipboard(activeSnippet);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy="setup-docs-title"
      size="lg"
    >
      <div className="w-full max-h-[82dvh] flex flex-col rounded-card coral-stock overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-rule">
          <h2
            id="setup-docs-title"
            className="font-display text-lg font-semibold text-ink"
          >
            Setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup dialog"
            className="h-9 w-9 -mr-1 rounded-input flex items-center justify-center text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-rule">
          <div className="flex items-center gap-1 p-1 rounded-input coral-groove">
            {(
              [
                ['firestore', 'firestore.rules'],
                ['deploy', 'Deploy'],
              ] as [DocTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setCopied(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-input transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === key
                    ? 'bg-paper text-ink'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="coral-btn-secondary h-9 px-3 rounded-input text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-success" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <pre className="rounded-input bg-paper-2 border border-rule p-4 text-xs font-outlier text-ink-2 overflow-x-auto leading-relaxed">
            <code>{activeSnippet}</code>
          </pre>

          {/* Secondary specs collapsed behind native <details> per content-first-noise-reduction */}
          <details className="mwg-details group rounded-input border border-rule overflow-hidden">
            <summary className="px-4 py-3 text-xs font-semibold text-ink bg-paper-2 flex items-center justify-between cursor-pointer select-none">
              <span>Spark Limits</span>
              <ChevronDown
                className="w-4 h-4 text-muted transition-transform duration-150 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="divide-y divide-rule text-xs text-ink-2 tabular-nums">
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-muted">Max file</span>
                <span className="tabular-nums">10 MB (14 × 768 KiB)</span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-muted">Thumbnail</span>
                <span className="tabular-nums">JPEG up to 640 px, 150 KB</span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-muted">Daily quota</span>
                <span className="tabular-nums">20k writes, 50k reads, 1 GiB</span>
              </div>
            </div>
          </details>
        </div>
      </div>
    </ModalDialog>
  );
}
