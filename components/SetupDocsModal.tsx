'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, X } from 'lucide-react';
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
    // Pillar 1: Global Default-Deny Safety Net
    match /{document=**} {
      allow read, write: if false;
    }

    // Phase 3: Reusable Hardened Primitives
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

    // ===============================================================
    // Assumed Data Model
    // ===============================================================
    //
    // Collection: /drops/{dropId}
    // Document ID: 1..128 chars [a-zA-Z0-9_-]
    // Fields:
    //   - ownerId: string (required, immutable, == request.auth.uid)
    //   - type: string (required, 'text' | 'image' | 'file')
    //   - content: string (required, <= 50000)
    //   - fileName: string (optional, <= 255)
    //   - fileSize: number (optional, 0..10485760 [10 MiB])
    //   - mimeType: string (optional, <= 128)
    //   - chunkCount: int (optional, 0..14)
    //   - previewDataUrl: string (optional, <= 160000, JPEG base64 data URL)
    //   - isCode: bool (optional, mutable by owner)
    //   - createdAt: timestamp (required, immutable, == request.time on create)
    //
    // Subcollection: /drops/{dropId}/chunks/{chunkId}
    // Document ID: ^[0-9]{1,2}$ matching string(index) ('0'..'13')
    // Note: Chunks are written before the parent /drops/{dropId} document exists,
    // so create rules do not require get() of the parent document.
    // Fields:
    //   - ownerId: string (required, == request.auth.uid)
    //   - index: int (required, 0..13)
    //   - data: bytes (required, size 1..786432 [768 KiB])
    //
    // ===============================================================

    // Pillar 2: Validation Blueprint (Firestore-only chunked storage)
    function isValidDrop(data) {
      return data.keys().hasAll(['ownerId', 'type', 'content', 'createdAt'])
        && data.keys().hasOnly([
          'ownerId',
          'type',
          'content',
          'fileName',
          'fileSize',
          'mimeType',
          'chunkCount',
          'previewDataUrl',
          'isCode',
          'createdAt'
        ])
        && data.ownerId is string
        && data.ownerId.size() >= 1
        && data.ownerId.size() <= 128
        && data.ownerId.matches('^[a-zA-Z0-9_\\\\-]+$')
        && data.ownerId == request.auth.uid
        && data.type in ['text', 'image', 'file']
        && data.content is string
        && data.content.size() <= 50000
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
        && data.ownerId is string
        && data.ownerId.size() >= 1
        && data.ownerId.size() <= 128
        && data.ownerId == request.auth.uid
        && data.index is int
        && data.index >= 0
        && data.index <= 13
        && chunkId.matches('^[0-9]{1,2}$')
        && chunkId == string(data.index)
        && data.data is bytes
        && data.data.size() >= 1
        && data.data.size() <= 786432;
    }

    // Personal Drop Collection: Private Single-Owner Drops
    match /drops/{dropId} {
      // Single-document read: strict owner isolation + Path ID hardening
      allow get: if isSignedIn()
        && isValidId(dropId)
        && existing().ownerId == request.auth.uid;

      // Pillar 8: Secure List Query (no isValidId, no get(), strict rule-side owner filter)
      allow list: if isSignedIn()
        && resource.data.ownerId == request.auth.uid;

      // Create: Auth -> Static Validation -> Temporal Integrity
      allow create: if isVerified()
        && isValidId(dropId)
        && isValidDrop(incoming())
        && incoming().createdAt == request.time;

      // Pillar 4 & 5: Action-Based Update (only toggling isCode; ownerId & createdAt immutable)
      allow update: if isVerified()
        && isValidId(dropId)
        && isValidDrop(incoming())
        && existing().ownerId == request.auth.uid
        && incoming().ownerId == existing().ownerId
        && incoming().createdAt == existing().createdAt
        && incoming().diff(existing()).affectedKeys().hasOnly(['isCode']);

      // Delete: Verified owner only + Path ID hardening
      allow delete: if isVerified()
        && isValidId(dropId)
        && existing().ownerId == request.auth.uid;

      // Chunked Binary Storage Subcollection (written before parent drop doc)
      match /chunks/{chunkId} {
        allow get: if isSignedIn()
          && isValidId(dropId)
          && chunkId.matches('^[0-9]{1,2}$')
          && existing().ownerId == request.auth.uid;

        allow list: if isSignedIn()
          && resource.data.ownerId == request.auth.uid;

        allow create: if isVerified()
          && isValidId(dropId)
          && isValidChunk(incoming(), chunkId);

        allow update: if false;

        allow delete: if isVerified()
          && isValidId(dropId)
          && chunkId.matches('^[0-9]{1,2}$')
          && existing().ownerId == request.auth.uid;
      }
    }
  }
}`;

export function SetupDocsModal({ open, onClose }: SetupDocsModalProps) {
  const [tab, setTab] = useState<DocTab>('firestore');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const deploySnippet = `# 1. Deploy Firestore Security Rules (no Cloud Storage bucket or CORS needed)
firebase deploy --only firestore:rules

# 2. Static export to GitHub Pages happens automatically on push to main
#    (.github/workflows/deploy.yml). Local check:
GITHUB_PAGES=true npm run build`;

  const activeSnippet = tab === 'firestore' ? FIRESTORE_RULES_SNIPPET : deploySnippet;

  async function handleCopy() {
    const ok = await copyTextToClipboard(activeSnippet);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-docs-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#181715]/60 dark:bg-black/75 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.985, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#DDD6C8] dark:border-[#2E2A25] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#E2DCD0] dark:border-[#272420]">
          <div>
            <h2
              id="setup-docs-title"
              className="font-[family-name:var(--font-display)] text-lg font-medium text-[#181715] dark:text-[#F3EFE8]"
            >
              Firestore Rules &amp; Deployment Guide
            </h2>
            <p className="text-xs text-[#6B655C] dark:text-[#968F84] mt-0.5">
              Firestore-only (Spark plan) configuration in firestore.rules and DEPLOYMENT_GUIDE.md
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup guide"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#272420] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-[#E2DCD0] dark:border-[#272420] overflow-x-auto">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#EBE6DC] dark:bg-[#141311] border border-[#E2DCD0] dark:border-[#272420]">
            {(
              [
                ['firestore', 'firestore.rules'],
                ['deploy', 'Deploy & Limits'],
              ] as [DocTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setCopied(false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === key
                    ? 'bg-[#FCFBF8] dark:bg-[#2A2723] text-[#181715] dark:text-[#F3EFE8] shadow-xs'
                    : 'text-[#6B655C] dark:text-[#968F84] hover:text-[#181715] dark:hover:text-[#F3EFE8]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="h-9 px-3 rounded-lg bg-[#F2EFE7] dark:bg-[#25221E] border border-[#DDD6C8] dark:border-[#322E28] text-xs font-medium text-[#181715] dark:text-[#F3EFE8] hover:border-[#BFB7A8] dark:hover:border-[#4A453E] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <pre className="rounded-lg bg-[#F2EFE7] dark:bg-[#131210] border border-[#E2DCD0] dark:border-[#272420] p-4 text-xs font-mono text-[#1F1D1A] dark:text-[#E5DFD5] overflow-x-auto leading-relaxed">
            <code>{activeSnippet}</code>
          </pre>

          {tab === 'deploy' && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-[#181715] dark:text-[#F3EFE8]">
                Firestore-Only File Transfer Limits (Spark plan)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[#E2DCD0] dark:border-[#272420]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F2EFE7] dark:bg-[#141311] text-[#5D5850] dark:text-[#A8A196] border-b border-[#E2DCD0] dark:border-[#272420]">
                    <tr>
                      <th className="py-2.5 px-3.5 font-semibold">Item</th>
                      <th className="py-2.5 px-3.5 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECE7DD] dark:divide-[#272420] text-[#3D3A35] dark:text-[#CFC8BC] tabular-nums">
                    <tr>
                      <td className="py-2.5 px-3.5">Max file size</td>
                      <td className="py-2.5 px-3.5 font-mono">10 MB (14 chunks × 768 KiB)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5">Storage format</td>
                      <td className="py-2.5 px-3.5 font-mono">drops/{'{id}'}/chunks/{'{n}'} · Bytes</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5">Image thumbnail</td>
                      <td className="py-2.5 px-3.5 font-mono">Inline JPEG ≤ 640 px, ≤ 150 KB</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5">Free quota (per day)</td>
                      <td className="py-2.5 px-3.5 font-mono">20k writes · 50k reads · 1 GiB stored</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
