'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  LogOut,
  QrCode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthUser } from './AuthGuard';
import { DropComposer } from './DropComposer';
import { DropCard } from './DropCard';
import { ImageLightbox } from './ImageLightbox';
import { QrModal, type QrModalData } from './QrModal';
import { SetupDocsModal } from './SetupDocsModal';
import {
  isFirebaseConfigured,
  reloadCurrentUser,
  sendVerificationToCurrentUser,
  signOutUser,
} from '@/lib/firebase';
import {
  createCloudTextDrop,
  deleteCloudDrop,
  subscribeToUserDrops,
  toggleCloudDropCodeMode,
  uploadCloudFileDrop,
} from '@/lib/drops-service';
import {
  loadLocalDemoItems,
  MAX_LOCAL_IMAGE_BYTES,
  saveLocalDemoItems,
} from '@/lib/demo-store';
import {
  filterDrops,
  generateDropId,
  getOldDropIds,
  getQrPayload,
  looksLikeCode,
  sanitizeFileName,
} from '@/lib/drop-utils';
import type { CleanupRange, DropItem, FilterTab, UploadTaskState } from '@/lib/types';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'text', label: 'Text' },
  { key: 'image', label: 'Images' },
  { key: 'file', label: 'Files' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

export function Workspace() {
  const { user: firebaseUser, authReady, refreshUser } = useAuthUser();
  const isCloudSynced = Boolean(isFirebaseConfigured && firebaseUser);

  const [items, setItems] = useState<DropItem[]>(() =>
    isCloudSynced ? [] : loadLocalDemoItems()
  );
  const [loadingFeed, setLoadingFeed] = useState(isCloudSynced);
  const [uploads, setUploads] = useState<UploadTaskState[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // Modals & Popovers
  const [qrModal, setQrModal] = useState<QrModalData | null>(null);
  const [lightboxItem, setLightboxItem] = useState<DropItem | null>(null);
  const [setupDocsOpen, setSetupDocsOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const cleanupPanelRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to Firestore onSnapshot strictly when auth is ready and user is authenticated
  useEffect(() => {
    if (!authReady || !isCloudSynced || !firebaseUser) return;

    const unsub = subscribeToUserDrops(
      firebaseUser.uid,
      (cloudItems) => {
        setItems(cloudItems);
        setLoadingFeed(false);
      },
      (err) => {
        setSyncError(err.message);
        setLoadingFeed(false);
      }
    );
    return () => unsub();
  }, [authReady, isCloudSynced, firebaseUser]);

  // Close cleanup menu on outside click
  useEffect(() => {
    if (!cleanupOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (cleanupPanelRef.current && !cleanupPanelRef.current.contains(e.target as Node)) {
        setCleanupOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [cleanupOpen]);

  const handleSendText = useCallback(
    async (text: string) => {
      setSyncNotice(null);
      if (isCloudSynced && firebaseUser) {
        await createCloudTextDrop(firebaseUser.uid, text);
        return;
      }

      const newItem: DropItem = {
        id: generateDropId(),
        ownerId: 'local_demo',
        type: 'text',
        content: text,
        isCode: looksLikeCode(text),
        createdAtMs: Date.now(),
        isLocalOnly: true,
      };

      setItems((prev) => {
        const next = [newItem, ...prev];
        const saved = saveLocalDemoItems(next);
        if (!saved.ok && saved.error) setSyncNotice(saved.error);
        return next;
      });
    },
    [isCloudSynced, firebaseUser]
  );

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setSyncNotice(null);

      await Promise.all(
        files.map(async (file) => {
          const taskId = generateDropId();
          const safeName = sanitizeFileName(file.name || 'dropped-file');
          const startedAt = Date.now();

          setUploads((prev) => [
            ...prev,
            {
              id: taskId,
              fileName: safeName,
              fileSize: file.size,
              bytesTransferred: 0,
              progress: 0,
              speedBps: 0,
              status: 'uploading',
            },
          ]);

          try {
            if (isCloudSynced && firebaseUser) {
              await uploadCloudFileDrop(firebaseUser.uid, file, {
                onProgress: ({ bytesTransferred, progress, speedBps }) => {
                  setUploads((prev) =>
                    prev.map((t) =>
                      t.id === taskId
                        ? { ...t, bytesTransferred, progress, speedBps }
                        : t
                    )
                  );
                },
              });
            } else {
              // Local Demo Mode with realistic progress feedback
              const isImage = file.type.startsWith('image/');
              let dataUrl: string | undefined;

              if (file.size <= MAX_LOCAL_IMAGE_BYTES) {
                dataUrl = await fileToDataUrl(file);
              } else {
                dataUrl = URL.createObjectURL(file);
                setSyncNotice(
                  `${safeName} is kept for this browser session. Enable Firebase Sync for persistent large file transfers.`
                );
              }

              const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
              setUploads((prev) =>
                prev.map((t) =>
                  t.id === taskId
                    ? {
                        ...t,
                        bytesTransferred: file.size,
                        progress: 100,
                        speedBps: file.size / elapsedSec,
                      }
                    : t
                )
              );

              const newItem: DropItem = {
                id: taskId,
                ownerId: 'local_demo',
                type: isImage ? 'image' : 'file',
                content: safeName,
                fileName: safeName,
                fileSize: file.size,
                mimeType: file.type || 'application/octet-stream',
                downloadUrl: dataUrl,
                createdAtMs: Date.now(),
                isLocalOnly: true,
              };

              setItems((prev) => {
                const next = [newItem, ...prev];
                if (file.size <= MAX_LOCAL_IMAGE_BYTES) {
                  const saved = saveLocalDemoItems(next);
                  if (!saved.ok && saved.error) setSyncNotice(saved.error);
                }
                return next;
              });
            }

            setUploads((prev) =>
              prev.map((t) =>
                t.id === taskId
                  ? { ...t, bytesTransferred: file.size, progress: 100, status: 'done' }
                  : t
              )
            );
            setTimeout(() => {
              setUploads((prev) => prev.filter((t) => t.id !== taskId));
            }, 2200);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : 'Upload failed. Check Storage Rules and CORS configuration.';
            setUploads((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, status: 'error', errorMessage: message } : t
              )
            );
          }
        })
      );
    },
    [isCloudSynced, firebaseUser]
  );

  // Global Cmd/Ctrl + V direct screenshot/image upload anywhere on page
  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = item.type.split('/')[1] || 'png';
            const fileName =
              blob.name && blob.name !== 'image.png'
                ? blob.name
                : `screenshot-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`;
            imageFiles.push(new File([blob], fileName, { type: item.type }));
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        void handleUploadFiles(imageFiles);
      }
    }

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [handleUploadFiles]);

  const handleToggleCode = useCallback(
    async (item: DropItem, nextIsCode: boolean) => {
      if (isCloudSynced) {
        await toggleCloudDropCodeMode(item.id, nextIsCode);
        return;
      }

      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === item.id ? { ...it, isCode: nextIsCode } : it
        );
        saveLocalDemoItems(next);
        return next;
      });
    },
    [isCloudSynced]
  );

  const handleDeleteItem = useCallback(
    async (item: DropItem) => {
      if (isCloudSynced) {
        await deleteCloudDrop(item);
        return;
      }

      setItems((prev) => {
        const next = prev.filter((it) => it.id !== item.id);
        saveLocalDemoItems(next);
        return next;
      });
    },
    [isCloudSynced]
  );

  async function handleCleanup(range: CleanupRange) {
    const targetIds = new Set(getOldDropIds(items, range));
    setCleanupOpen(false);
    if (targetIds.size === 0) {
      setSyncNotice(
        range === '24h'
          ? 'No items older than 24 hours.'
          : range === '7d'
            ? 'No items older than 7 days.'
            : 'Workspace is already empty.'
      );
      return;
    }

    setCleaningUp(true);
    try {
      if (isCloudSynced) {
        const toDelete = items.filter((it) => targetIds.has(it.id));
        await Promise.all(toDelete.map((it) => deleteCloudDrop(it)));
      } else {
        setItems((prev) => {
          const next = prev.filter((it) => !targetIds.has(it.id));
          saveLocalDemoItems(next);
          return next;
        });
      }
      setSyncNotice(`Removed ${targetIds.size} ${targetIds.size === 1 ? 'item' : 'items'}.`);
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Cleanup failed.');
    } finally {
      setCleaningUp(false);
    }
  }

  function handleOpenAppQr() {
    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
    setQrModal({
      title: 'Connect Mobile',
      subtitle: 'Scan with your phone camera to open Personal Drop',
      value: appUrl,
    });
  }

  function handleOpenItemQr(item: DropItem) {
    const payload = getQrPayload(item);
    setQrModal({
      title: 'Quick Share QR',
      subtitle: payload.label,
      value: payload.value,
      unavailableReason: payload.unavailableReason,
    });
  }

  async function handleSendVerification() {
    setVerifyingEmail(true);
    setSyncNotice(null);
    try {
      await sendVerificationToCurrentUser();
      setSyncNotice('Verification email sent. Open the link in your inbox, then click Refresh Status.');
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Could not send verification email.');
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function handleRefreshVerification() {
    setVerifyingEmail(true);
    setSyncNotice(null);
    try {
      const updated = await reloadCurrentUser();
      if (updated) {
        refreshUser({ ...updated } as User);
        if (updated.emailVerified) {
          setSyncNotice('Email verified. Live cross-device writes are now active.');
        } else {
          setSyncNotice('Email is still unverified. Click the verification link in your inbox first.');
        }
      }
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Could not refresh status.');
    } finally {
      setVerifyingEmail(false);
    }
  }

  const filteredItems = useMemo(
    () => filterDrops(items, filterTab, searchQuery),
    [items, filterTab, searchQuery]
  );

  const counts = useMemo(() => {
    const tally = { all: items.length, text: 0, image: 0, file: 0 };
    for (const item of items) {
      tally[item.type] += 1;
    }
    return tally;
  }, [items]);

  const olderThan24hCount = useMemo(
    () => getOldDropIds(items, '24h').length,
    [items]
  );
  const olderThan7dCount = useMemo(
    () => getOldDropIds(items, '7d').length,
    [items]
  );

  return (
    <div className="min-h-screen bg-[#0B0D11] text-[#F4F5F7] flex flex-col">
      {/* Top Bar Contract: Single row, 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-30 h-14 bg-[#0B0D11]/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 sm:gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <span className="text-base font-semibold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0">
            Personal Drop
          </span>

          {/* Zone 2: Clean single-line utility text links */}
          <nav
            aria-label="Workspace actions"
            className="hidden sm:flex items-center gap-6 text-sm font-medium text-zinc-400"
          >
            <button
              type="button"
              onClick={() => setSetupDocsOpen(true)}
              className="hover:text-[#F4F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rules &amp; Guide
            </button>
            {isCloudSynced && (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="hover:text-[#F4F5F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out
              </button>
            )}
          </nav>

          {/* Zone 3: Primary Action + Mobile Sign Out */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenAppQr}
              className="h-9 px-3.5 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" aria-hidden="true" />
              <span>Connect Mobile</span>
            </button>

            {isCloudSynced && (
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Sign out"
                className="sm:hidden h-9 w-9 rounded-lg bg-[#13161C] border border-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Sync Status Banner */}
        {!isCloudSynced ? (
          <div className="rounded-xl bg-[#13161C] border border-zinc-800/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2.5 text-zinc-300 min-w-0">
              <CloudOff className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
              <p className="leading-snug">
                <span className="font-medium text-[#F4F5F7]">Local Demo Mode</span>
                {' — Add Firebase config to enable cross-device sync.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSetupDocsOpen(true)}
              className="sm:hidden text-xs font-medium text-zinc-400 hover:text-zinc-200 underline underline-offset-4 cursor-pointer whitespace-nowrap self-start"
            >
              Setup Guide
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400 px-1">
              <div className="flex items-center gap-2">
                <Cloud className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span>
                  Firebase Live Sync · Signed in as{' '}
                  <span className="text-zinc-200 font-medium">{firebaseUser?.email}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSetupDocsOpen(true)}
                className="sm:hidden text-zinc-400 hover:text-zinc-200 underline underline-offset-4 cursor-pointer"
              >
                Rules &amp; Guide
              </button>
            </div>

            {firebaseUser && !firebaseUser.emailVerified && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
                <p className="leading-relaxed">
                  <span className="font-medium text-amber-100">Verify email to write drops</span>
                  {' — '}
                  Firestore rules require a verified email before saving or deleting items.
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleSendVerification()}
                    disabled={verifyingEmail}
                    className="h-8 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-100 font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    Send Verification Email
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRefreshVerification()}
                    disabled={verifyingEmail}
                    className="h-8 px-3 rounded-lg bg-[#0B0D11] border border-zinc-700 text-zinc-200 hover:text-white font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    Refresh Status
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Input / Drop Zone */}
        <DropComposer
          onSendText={handleSendText}
          onUploadFiles={handleUploadFiles}
          uploads={uploads}
        />

        {/* Optional Transient Notice */}
        {(syncNotice || syncError) && (
          <div
            role="status"
            className={`rounded-lg px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between gap-3 border ${
              syncError
                ? 'bg-red-500/10 border-red-500/25 text-red-300'
                : 'bg-[#13161C] border-zinc-800 text-zinc-300'
            }`}
          >
            <span className="break-words">{syncError || syncNotice}</span>
            <button
              type="button"
              onClick={() => {
                setSyncNotice(null);
                setSyncError(null);
              }}
              aria-label="Dismiss notice"
              className="h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Feed Toolbar: Filter Tabs + Search + Clear Old */}
        <section aria-label="Dropped items feed" className="space-y-4 pt-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Segmented Filter Tabs */}
            <div
              role="tablist"
              aria-label="Filter items by type"
              className="flex items-center gap-1 p-1 rounded-xl bg-[#13161C] border border-zinc-800/85 overflow-x-auto"
            >
              {FILTER_TABS.map((t) => {
                const active = filterTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilterTab(t.key)}
                    className={`h-9 px-3.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-zinc-800 text-[#F4F5F7]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search & Cleanup Controls */}
            <div className="flex items-center gap-2.5 flex-1 md:flex-initial md:justify-end">
              <div className="relative flex-1 md:w-64">
                <Search
                  className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="feed-search" className="sr-only">
                  Search drops
                </label>
                <input
                  id="feed-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search text or filenames..."
                  className="w-full h-10 rounded-xl bg-[#13161C] border border-zinc-800/85 pl-9 pr-8 text-sm text-[#F4F5F7] placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/70 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Cleanup Menu */}
              <div className="relative shrink-0" ref={cleanupPanelRef}>
                <button
                  type="button"
                  onClick={() => setCleanupOpen((prev) => !prev)}
                  disabled={items.length === 0 || cleaningUp}
                  aria-expanded={cleanupOpen}
                  className="h-10 px-3.5 rounded-xl bg-[#13161C] border border-zinc-800/85 text-xs sm:text-sm font-medium text-zinc-300 hover:text-[#F4F5F7] hover:border-zinc-700 disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{cleaningUp ? 'Clearing...' : 'Clear Old'}</span>
                </button>

                {cleanupOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-[#13161C] border border-zinc-800 shadow-2xl p-1.5 z-20 space-y-0.5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('24h')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-zinc-200 hover:bg-zinc-800/80 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Older than 24 hours</span>
                      <span className="text-xs text-zinc-500 tabular-nums">
                        {olderThan24hCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('7d')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-zinc-200 hover:bg-zinc-800/80 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Older than 7 days</span>
                      <span className="text-xs text-zinc-500 tabular-nums">
                        {olderThan7dCount}
                      </span>
                    </button>
                    <div className="my-1 border-t border-zinc-800" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('all')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-red-400 hover:bg-red-500/10 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Clear all items</span>
                      <span className="text-xs text-red-400/70 tabular-nums">
                        {items.length}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Feed Stream */}
          {loadingFeed ? (
            <div className="space-y-3" aria-label="Loading drops">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-xl bg-[#13161C] border border-zinc-800/70 animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl bg-[#13161C] border border-zinc-800/80 py-14 px-6 text-center space-y-3">
              <p className="text-sm font-medium text-zinc-200">
                {items.length === 0
                  ? 'Your drop stream is empty'
                  : 'No items match your current filter'}
              </p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                {items.length === 0
                  ? 'Type text above, drop any file, or press Cmd/Ctrl+V anywhere to send a screenshot across devices.'
                  : 'Try clearing your search query or switching back to the All tab.'}
              </p>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('all');
                    setSearchQuery('');
                  }}
                  className="mt-1 h-9 px-4 rounded-lg bg-zinc-800 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3" data-testid="drop-feed">
              {filteredItems.map((item) => (
                <DropCard
                  key={item.id}
                  item={item}
                  onDelete={handleDeleteItem}
                  onToggleCode={handleToggleCode}
                  onOpenQr={handleOpenItemQr}
                  onOpenImage={setLightboxItem}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <QrModal data={qrModal} onClose={() => setQrModal(null)} />
      <ImageLightbox
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onOpenQr={(it) => {
          setLightboxItem(null);
          handleOpenItemQr(it);
        }}
      />
      <SetupDocsModal open={setupDocsOpen} onClose={() => setSetupDocsOpen(false)} />
    </div>
  );
}
