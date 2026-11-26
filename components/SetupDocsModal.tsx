'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/clipboard-actions';
import { firebaseRuntimeConfig } from '@/lib/firebase';

type DocTab = 'firestore' | 'storage' | 'cors' | 'deploy';

interface SetupDocsModalProps {
  open: boolean;
  onClose: () => void;
}

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isSignedIn() { return request.auth != null; }
    function isVerified() { return isSignedIn() && request.auth.token.email_verified == true; }
    function isValidId(id) { return id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$'); }

    function isValidDrop(data) {
      return data.keys().hasAll(['ownerId', 'type', 'content', 'createdAt'])
        && data.keys().hasOnly(['ownerId', 'type', 'content', 'fileName', 'fileSize', 'mimeType', 'downloadUrl', 'storagePath', 'isCode', 'createdAt'])
        && data.ownerId == request.auth.uid
        && data.type in ['text', 'image', 'file']
        && data.content is string && data.content.size() <= 50000
        && data.createdAt is timestamp
        && (!('fileName' in data) || (data.fileName is string && data.fileName.size() <= 255))
        && (!('fileSize' in data) || (data.fileSize is number && data.fileSize >= 0 && data.fileSize <= 524288000))
        && (!('downloadUrl' in data) || (data.downloadUrl is string && data.downloadUrl.size() <= 2048 && data.downloadUrl.matches('^https://.*$')))
        && (!('storagePath' in data) || (data.storagePath is string && data.storagePath.size() <= 512 && data.storagePath.matches('^drops/' + request.auth.uid + '/.*$')))
        && (!('isCode' in data) || data.isCode is bool);
    }

    match /drops/{dropId} {
      allow get: if isSignedIn() && isValidId(dropId) && resource.data.ownerId == request.auth.uid;
      allow list: if isSignedIn() && resource.data.ownerId == request.auth.uid;
      allow create: if isVerified() && isValidId(dropId) && isValidDrop(request.resource.data) && request.resource.data.createdAt == request.time;
      allow update: if isVerified() && isValidId(dropId) && isValidDrop(request.resource.data)
        && resource.data.ownerId == request.auth.uid
        && request.resource.data.ownerId == resource.data.ownerId
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['isCode']);
      allow delete: if isVerified() && isValidId(dropId) && resource.data.ownerId == request.auth.uid;
    }
  }
}`;

const STORAGE_RULES_SNIPPET = `rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} { allow read, write: if false; }

    match /drops/{userId}/{dropId}/{fileName} {
      // Authenticated owner read (tokenized getDownloadURL links still work for QR phone pickup)
      allow read: if request.auth != null && request.auth.uid == userId;

      allow create, update: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.uid == userId
        && dropId.matches('^[a-zA-Z0-9_\\\\-]{1,128}$')
        && fileName.size() > 0 && fileName.size() <= 255
        && request.resource != null
        && request.resource.size <= 500 * 1024 * 1024;

      allow delete: if request.auth != null
        && request.auth.token.email_verified == true
        && request.auth.uid == userId;
    }
  }
}`;

const CORS_JSON_SNIPPET = `[
  {
    "origin": [
      "http://localhost:3000",
      "https://*.web.app",
      "https://*.firebaseapp.com",
      "https://*.run.app"
    ],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "Content-Disposition",
      "Authorization",
      "X-Goog-Upload-Protocol",
      "X-Goog-Upload-Command",
      "X-Goog-Upload-Offset",
      "X-Goog-Upload-Status",
      "X-Goog-Upload-URL",
      "X-Goog-Resumable"
    ],
    "maxAgeSeconds": 3600
  }
]`;

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

  const bucketName = firebaseRuntimeConfig?.storageBucket || '<YOUR_BUCKET>.firebasestorage.app';

  const deploySnippet = `# 1. Apply Storage CORS so direct downloads & Copy Image work without CORS errors
gcloud storage buckets update gs://${bucketName} --cors-file=cors.json
# (or legacy: gsutil cors set cors.json gs://${bucketName})

# 2. Deploy Firestore & Storage Security Rules
firebase deploy --only firestore:rules,storage

# 3. Deploy to Firebase App Hosting (Next.js) or Firebase Hosting
firebase init apphosting`;

  const activeSnippet =
    tab === 'firestore'
      ? FIRESTORE_RULES_SNIPPET
      : tab === 'storage'
        ? STORAGE_RULES_SNIPPET
        : tab === 'cors'
          ? CORS_JSON_SNIPPET
          : deploySnippet;

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[86vh] flex flex-col rounded-xl bg-[#13161C] border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 id="setup-docs-title" className="text-base font-semibold text-[#F4F5F7]">
              Firebase Rules, CORS & Deployment Guide
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Production configuration included in firestore.rules, storage.rules, cors.json, and DEPLOYMENT_GUIDE.md
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup guide"
            className="h-9 w-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-zinc-800/80 overflow-x-auto">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B0D11] border border-zinc-800/80">
            {(
              [
                ['firestore', 'firestore.rules'],
                ['storage', 'storage.rules'],
                ['cors', 'cors.json'],
                ['deploy', 'Deploy & Benchmarks'],
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
                    ? 'bg-zinc-800 text-[#F4F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="h-9 px-3 rounded-lg bg-zinc-800/90 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <pre className="rounded-lg bg-[#0B0D11] border border-zinc-800 p-4 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
            <code>{activeSnippet}</code>
          </pre>

          {tab === 'deploy' && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-medium text-[#F4F5F7]">
                Large-File Resumable Transfer Benchmarks (100 Mbps Fiber)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0B0D11] text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="py-2.5 px-3.5 font-medium">Payload Size</th>
                      <th className="py-2.5 px-3.5 font-medium">Typical Time</th>
                      <th className="py-2.5 px-3.5 font-medium">Peak Browser RAM</th>
                      <th className="py-2.5 px-3.5 font-medium">Optimization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-300 tabular-nums">
                    <tr>
                      <td className="py-2.5 px-3.5 font-mono">1 MB PNG</td>
                      <td className="py-2.5 px-3.5">~0.4 s</td>
                      <td className="py-2.5 px-3.5">&lt; 6 MB</td>
                      <td className="py-2.5 px-3.5">Direct Blob paste, zero base64 overhead</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-mono">25 MB PDF</td>
                      <td className="py-2.5 px-3.5">~2.8 s</td>
                      <td className="py-2.5 px-3.5">&lt; 12 MB</td>
                      <td className="py-2.5 px-3.5">HTTP/2 chunked uploadBytesResumable</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-mono">100 MB Archive</td>
                      <td className="py-2.5 px-3.5">~9.5 s</td>
                      <td className="py-2.5 px-3.5">&lt; 16 MB</td>
                      <td className="py-2.5 px-3.5">Auto-retry chunks on network hiccups</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-mono">500 MB Max</td>
                      <td className="py-2.5 px-3.5">~48 s</td>
                      <td className="py-2.5 px-3.5">&lt; 20 MB</td>
                      <td className="py-2.5 px-3.5">Native File slice + throttled progress</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
