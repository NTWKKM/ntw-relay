'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { RELAY_BURST } from '@/lib/relay-motion';
import {
  Cloud,
  CloudOff,
  LogOut,
  Moon,
  QrCode,
  Search,
  Shield,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useAuthUser } from './AuthGuard';
import { useMaterialTheme } from './ThemeProvider';
import { DropComposer } from './DropComposer';
import { DropCard } from './DropCard';
import { ImageLightbox } from './ImageLightbox';
import { QrModal, type QrModalData } from './QrModal';
import {
  isFirebaseConfigured,
  reloadCurrentUser,
  sendVerificationToCurrentUser,
  signOutUser,
} from '@/lib/firebase';
import {
  createCloudTextDrop,
  deleteCloudDrop,
  subscribeToGlobalStorageBytes,
  subscribeToUserDrops,
  toggleCloudDropCodeMode,
  uploadCloudFileDrop,
} from '@/lib/drops-service';
import {
  getLocalDemoSnapshot,
  getServerDemoSnapshot,
  MAX_LOCAL_IMAGE_BYTES,
  saveLocalDemoItems,
  subscribeLocalDemo,
} from '@/lib/demo-store';
import {
  buildAppShareUrl,
  computeStorageUsage,
  estimateDropRawBytes,
  filterDrops,
  formatBytes,
  generateDropId,
  getOldDropIds,
  getQrPayload,
  looksLikeCode,
  sanitizeFileName,
  SPARK_STORAGE_QUOTA_BYTES,
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

function revokeBlobUrl(url?: string) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

interface WorkspaceProps {
  forceLocalDemo?: boolean;
}

export function Workspace({ forceLocalDemo = false }: WorkspaceProps) {
  const { user: firebaseUser, authReady, isAdmin, refreshUser } = useAuthUser();
  const { theme, toggleTheme } = useMaterialTheme();
  const isCloudSynced = Boolean(!forceLocalDemo && isFirebaseConfigured && firebaseUser);

  const localItems = useSyncExternalStore(
    subscribeLocalDemo,
    getLocalDemoSnapshot,
    getServerDemoSnapshot
  );
  const [cloudItems, setCloudItems] = useState<DropItem[]>([]);
  const [sessionLargeLocalItems, setSessionLargeLocalItems] = useState<DropItem[]>([]);
  const [relayBurstKey, setRelayBurstKey] = useState(0);
  const [clearedRelayFeedKey, setClearedRelayFeedKey] = useState(0);
  // IDs created by the most recent successful send, so the feed highlights
  // exactly those cards regardless of the active filter or search.
  const [justRelayedIds, setJustRelayedIds] = useState<ReadonlySet<string>>(() => new Set());
  // performance.now() at burst start, so cards mounted mid-burst can catch on time.
  const [relayStartedAt, setRelayStartedAt] = useState(0);
  const isRelayFeedCatching = relayBurstKey > 0 && clearedRelayFeedKey !== relayBurstKey;
  const sessionLargeLocalItemsRef = useRef<DropItem[]>(sessionLargeLocalItems);

  useEffect(() => {
    sessionLargeLocalItemsRef.current = sessionLargeLocalItems;
  }, [sessionLargeLocalItems]);

  useEffect(() => {
    return () => {
      sessionLargeLocalItemsRef.current.forEach((it) => revokeBlobUrl(it.downloadUrl));
    };
  }, []);

  useEffect(() => {
    if (relayBurstKey <= 0) return;
    const timer = window.setTimeout(() => {
      setClearedRelayFeedKey(relayBurstKey);
    }, RELAY_BURST.total * 1000 + 1500);
    return () => window.clearTimeout(timer);
  }, [relayBurstKey]);
  const [loadingCloudFeed, setLoadingCloudFeed] = useState(isCloudSynced);
  const [globalStorageBytes, setGlobalStorageBytes] = useState<number | null>(null);
  const [globalStorageStatus, setGlobalStorageStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    isCloudSynced ? 'loading' : 'ready'
  );
  const [uploads, setUploads] = useState<UploadTaskState[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  const items = useMemo(
    () => (isCloudSynced ? cloudItems : [...sessionLargeLocalItems, ...localItems]),
    [isCloudSynced, cloudItems, sessionLargeLocalItems, localItems]
  );
  const loadingFeed = isCloudSynced && loadingCloudFeed;

  // Native <dialog> modals & native [popover] cleanup menu
  const [qrModal, setQrModal] = useState<QrModalData | null>(null);
  const [lightboxItem, setLightboxItem] = useState<DropItem | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const cleanupPopoverRef = useRef<HTMLDivElement | null>(null);

  const firebaseUserUid = firebaseUser?.uid ?? null;

  // Subscribe to Firestore onSnapshot strictly when auth is ready and user is authenticated
  useEffect(() => {
    if (!authReady || !isCloudSynced || !firebaseUserUid) return;

    const unsubDrops = subscribeToUserDrops(
      firebaseUserUid,
      (nextCloudItems) => {
        setCloudItems(nextCloudItems);
        setLoadingCloudFeed(false);
      },
      (err) => {
        setSyncError(err.message);
        setLoadingCloudFeed(false);
      }
    );
    const unsubStorage = subscribeToGlobalStorageBytes(
      (totalBytes) => {
        setGlobalStorageBytes(totalBytes);
        setGlobalStorageStatus('ready');
      },
      () => {
        setGlobalStorageBytes(null);
        setGlobalStorageStatus('unavailable');
      }
    );
    return () => {
      unsubDrops();
      unsubStorage();
    };
  }, [authReady, isCloudSynced, firebaseUserUid]);

  const markRelayed = useCallback((ids: string[]) => {
    setJustRelayedIds(new Set(ids));
    setRelayStartedAt(performance.now());
    setRelayBurstKey((k) => k + 1);
  }, []);

  const handleSendText = useCallback(
    async (text: string) => {
      setSyncNotice(null);
      if (isCloudSynced && firebaseUser) {
        const dropId = await createCloudTextDrop(firebaseUser.uid, text);
        markRelayed([dropId]);
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

      const next = [newItem, ...getLocalDemoSnapshot()];
      const saved = saveLocalDemoItems(next);
      if (!saved.ok && saved.error) setSyncNotice(saved.error);
      markRelayed([newItem.id]);
    },
    [isCloudSynced, firebaseUser, markRelayed]
  );

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setSyncNotice(null);
      const relayedIds: string[] = [];

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
              const dropId = await uploadCloudFileDrop(firebaseUser.uid, file, {
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
              relayedIds.push(dropId);
            } else {
              const isImage = file.type.startsWith('image/');
              let dataUrl: string | undefined;

              if (file.size <= MAX_LOCAL_IMAGE_BYTES) {
                dataUrl = await fileToDataUrl(file);
              } else {
                dataUrl = URL.createObjectURL(file);
                setSyncNotice(`${safeName} is session-only in Local mode.`);
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

              if (file.size <= MAX_LOCAL_IMAGE_BYTES) {
                const next = [newItem, ...getLocalDemoSnapshot()];
                const saved = saveLocalDemoItems(next);
                if (!saved.ok && saved.error) setSyncNotice(saved.error);
              } else {
                setSessionLargeLocalItems((prev) => [newItem, ...prev]);
              }
              relayedIds.push(newItem.id);
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
            }, 2000);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed.';
            setUploads((prev) =>
              prev.map((t) =>
                t.id === taskId ? { ...t, status: 'error', errorMessage: message } : t
              )
            );
          }
        })
      );

      if (relayedIds.length > 0) {
        markRelayed(relayedIds);
      }
    },
    [isCloudSynced, firebaseUser, markRelayed]
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

      const next = getLocalDemoSnapshot().map((it) =>
        it.id === item.id ? { ...it, isCode: nextIsCode } : it
      );
      saveLocalDemoItems(next);
      setSessionLargeLocalItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isCode: nextIsCode } : it))
      );
    },
    [isCloudSynced]
  );

  const handleDeleteItem = useCallback(
    async (item: DropItem) => {
      if (isCloudSynced) {
        await deleteCloudDrop(item);
        return;
      }

      const next = getLocalDemoSnapshot().filter((it) => it.id !== item.id);
      saveLocalDemoItems(next);
      setSessionLargeLocalItems((prev) => {
        for (const it of prev) {
          if (it.id === item.id) revokeBlobUrl(it.downloadUrl);
        }
        return prev.filter((it) => it.id !== item.id);
      });
    },
    [isCloudSynced]
  );

  async function handleCleanup(range: CleanupRange) {
    cleanupPopoverRef.current?.hidePopover?.();
    const targetIds = new Set(getOldDropIds(items, range));
    if (targetIds.size === 0) {
      setSyncNotice(
        range === '24h'
          ? 'Nothing older than 24h.'
          : range === '7d'
            ? 'Nothing older than 7d.'
            : 'Already empty.'
      );
      return;
    }

    setCleaningUp(true);
    try {
      if (isCloudSynced) {
        const toDelete = items.filter((it) => targetIds.has(it.id));
        // Sequential: every delete transaction touches the shared /stats/storage doc
        for (const it of toDelete) {
          await deleteCloudDrop(it);
        }
      } else {
        const next = getLocalDemoSnapshot().filter((it) => !targetIds.has(it.id));
        saveLocalDemoItems(next);
        setSessionLargeLocalItems((prev) => {
          for (const it of prev) {
            if (targetIds.has(it.id)) revokeBlobUrl(it.downloadUrl);
          }
          return prev.filter((it) => !targetIds.has(it.id));
        });
      }
      setSyncNotice(`Cleared ${targetIds.size} ${targetIds.size === 1 ? 'item' : 'items'}.`);
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Cleanup failed.');
    } finally {
      setCleaningUp(false);
    }
  }

  function handleOpenAppQr() {
    const appUrl =
      typeof window !== 'undefined'
        ? buildAppShareUrl(window.location.origin, process.env.NEXT_PUBLIC_BASE_PATH || '')
        : '';
    setQrModal({
      title: 'Mobile QR',
      subtitle: 'Scan to open on phone',
      value: appUrl,
    });
  }

  function handleOpenItemQr(item: DropItem) {
    const appUrl =
      typeof window !== 'undefined'
        ? buildAppShareUrl(window.location.origin, process.env.NEXT_PUBLIC_BASE_PATH || '')
        : '';
    const payload = getQrPayload(item, appUrl);
    setQrModal({
      title: 'Share QR',
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
      setSyncNotice('Verification link sent.');
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Failed to send link.');
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
        refreshUser(updated);
        setSyncNotice(updated.emailVerified ? 'Email verified.' : 'Still unverified.');
      }
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Refresh failed.');
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

  const olderThan24hCount = useMemo(() => getOldDropIds(items, '24h').length, [items]);
  const olderThan7dCount = useMemo(() => getOldDropIds(items, '7d').length, [items]);
  const storageReady = !isCloudSynced || (globalStorageStatus === 'ready' && globalStorageBytes !== null);
  const storageUsage = useMemo(() => {
    const usedBytes = isCloudSynced
      ? (globalStorageBytes ?? 0)
      : items.reduce((sum, it) => sum + estimateDropRawBytes(it), 0);
    return computeStorageUsage(usedBytes, SPARK_STORAGE_QUOTA_BYTES);
  }, [isCloudSynced, globalStorageBytes, items]);

  const storageBarFillClass =
    storageUsage.level === 'critical'
      ? 'bg-error'
      : storageUsage.level === 'warning'
        ? 'bg-warning'
        : 'bg-ink';

  const storageScale =
    storageReady && storageUsage.usedBytes > 0
      ? Math.max(0.02, Math.min(1, storageUsage.percent / 100))
      : 0;

  return (
    <div className="h-dvh bg-desk text-ink flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <h1 className="sr-only">Relay</h1>
        {/* Email verification prompt (only shown when actually unverified) */}
        {isCloudSynced && firebaseUser && !firebaseUser.emailVerified && (
          <div className="rounded-card coral-stock border border-warning/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-warning">
            <span className="font-medium">Verify your email to sync writes.</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleSendVerification()}
                disabled={verifyingEmail}
                className="coral-btn-ink h-8 px-3 rounded-input font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Send link
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshVerification()}
                disabled={verifyingEmail}
                className="coral-btn-secondary h-8 px-3 rounded-input font-medium cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Unified Composer + Full-Surface Drop Zone */}
        <DropComposer
          onSendText={handleSendText}
          onUploadFiles={handleUploadFiles}
          uploads={uploads}
          relayBurstKey={relayBurstKey}
        />

        {/* Transient Notice / Error */}
        {(syncNotice || syncError) && (
          <div
            role="status"
            className={`rounded-input px-3.5 py-2 text-xs flex items-center justify-between gap-3 border ${
              syncError
                ? 'bg-paper-2 border-error/30 text-error'
                : 'bg-cotton border-rule text-ink-2'
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
              className="h-7 w-7 rounded-input flex items-center justify-center text-muted hover:text-ink shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Feed Section */}
        <section aria-label="Drops stream" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Segmented Filter Tabs with Sliding Cotton Pill */}
            <div
              role="tablist"
              aria-label="Filter items"
              className="coral-groove flex items-center gap-0.5 p-1 rounded-card overflow-x-auto"
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
                    className={`relative h-8 px-3 rounded-input text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      active ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="relay-filter-pill"
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.85 }}
                        className="absolute inset-0 rounded-input bg-cotton shadow-card"
                      />
                    )}
                    <span className="relative z-10">{t.label}</span>
                    <span className="relative z-10 text-xs text-muted tabular-nums">
                      {counts[t.key]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search & Native Popover Cleanup */}
            <div className="flex items-center gap-2 flex-1 sm:flex-initial sm:justify-end">
              <div className="relative flex-1 sm:w-52">
                <Search
                  className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  placeholder="Search..."
                  className="mwg-input w-full h-9 rounded-input bg-cotton border border-muted pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-focus transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-input flex items-center justify-center text-muted hover:text-ink cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Native Popover API trigger & top-layer menu (zero click-outside JS listeners) */}
              <button
                type="button"
                popoverTarget="cleanup-popover"
                disabled={items.length === 0 || cleaningUp}
                className="mwg-popover-trigger coral-btn-secondary h-9 px-3 rounded-card text-xs font-medium text-ink-2 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{cleaningUp ? 'Clearing...' : 'Clear'}</span>
              </button>

              <div
                id="cleanup-popover"
                ref={cleanupPopoverRef}
                popover="auto"
                role="menu"
                aria-label="Clear items"
                className="mwg-popover"
              >
                <div className="w-52 rounded-card coral-stock p-1.5 space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('24h')}
                    className="w-full px-3 py-2 rounded-input text-left text-xs text-ink hover:bg-paper-2 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Older than 24h</span>
                    <span className="text-xs text-muted tabular-nums">
                      {olderThan24hCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('7d')}
                    className="w-full px-3 py-2 rounded-input text-left text-xs text-ink hover:bg-paper-2 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Older than 7d</span>
                    <span className="text-xs text-muted tabular-nums">
                      {olderThan7dCount}
                    </span>
                  </button>
                  <div className="my-1 border-t border-rule" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('all')}
                    className="w-full px-3 py-2 rounded-input text-left text-xs text-error hover:bg-paper-2 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Clear all</span>
                    <span className="text-xs opacity-80 tabular-nums">
                      {items.length}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed Stream */}
          {loadingFeed ? (
            <div className="space-y-3" aria-label="Loading drops">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 180}ms` }}
                  className="h-28 rounded-card coral-stock relay-tide"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-card coral-stock py-14 px-6 text-center space-y-2">
              <p className="font-display text-base font-semibold text-ink">
                {items.length === 0 ? 'No drops yet' : 'No matches'}
              </p>
              <p className="text-xs text-muted">
                {items.length === 0
                  ? 'Paste, type, or drop a file above.'
                  : 'Clear search or switch tabs.'}
              </p>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('all');
                    setSearchQuery('');
                  }}
                  className="coral-btn-ink mt-2 h-8 px-3.5 rounded-input text-xs font-medium cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3" data-testid="drop-feed">
              <MotionConfig reducedMotion="user">
                <AnimatePresence mode="popLayout">
                  {filteredItems.map((item) => (
                    <DropCard
                      key={item.id}
                      item={item}
                      isJustRelayed={isRelayFeedCatching && justRelayedIds.has(item.id)}
                      relayStartedAt={relayStartedAt}
                      onDelete={handleDeleteItem}
                      onToggleCode={handleToggleCode}
                      onOpenQr={handleOpenItemQr}
                      onOpenImage={setLightboxItem}
                    />
                  ))}
                </AnimatePresence>
              </MotionConfig>
            </div>
          )}
        </section>
        </main>
      </div>

      {/* Unified Bottom Dock */}
      <footer className="shrink-0 border-t border-rule bg-paper coral-bottom-dock pt-3">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <span className="font-display text-sm font-semibold tracking-tight text-ink whitespace-nowrap shrink-0">
              Relay
            </span>

            <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
              {isCloudSynced ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-success shrink-0" aria-hidden="true" />
                  <span className="truncate max-w-[96px] sm:max-w-[160px] md:max-w-[200px]">
                    {firebaseUser?.email}
                  </span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">Local sandbox</span>
                </>
              )}
            </div>

            <span className="hidden lg:inline text-xs text-muted whitespace-nowrap shrink-0">
              Max 10 MB/file
            </span>

            <div
              className="flex items-center gap-2 text-xs text-muted tabular-nums shrink-0"
              title={
                !isCloudSynced
                  ? `Local sandbox usage: ${formatBytes(storageUsage.usedBytes)} / 1 GB`
                  : storageReady
                    ? `Shared project storage across all accounts: ${formatBytes(storageUsage.usedBytes)} / 1 GB`
                    : globalStorageStatus === 'unavailable'
                      ? 'Shared project storage usage unavailable'
                      : 'Loading shared project storage usage'
              }
            >
              <div
                role="meter"
                aria-label={isCloudSynced ? 'Shared storage usage across all accounts' : 'Local storage usage'}
                aria-valuemin={0}
                aria-valuemax={storageUsage.quotaBytes}
                aria-valuenow={storageReady ? storageUsage.usedBytes : undefined}
                aria-valuetext={
                  storageReady
                    ? `${formatBytes(storageUsage.usedBytes)} of 1 GB`
                    : globalStorageStatus === 'unavailable'
                      ? 'Storage usage unavailable'
                      : 'Loading storage usage'
                }
                className="hidden sm:block w-16 h-1.5 rounded-pill bg-paper-3 overflow-hidden"
              >
                <div
                  className={`h-full w-full origin-left rounded-pill transition-transform duration-300 ${storageBarFillClass}`}
                  style={{ transform: `scaleX(${storageScale})` }}
                />
              </div>
              <span className="whitespace-nowrap">
                {storageReady ? `${formatBytes(storageUsage.usedBytes)} / 1 GB` : '— / 1 GB'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenAppQr}
              aria-label="Mobile QR"
              className="coral-btn-ink h-9 sm:h-8 px-2.5 sm:px-3 rounded-input text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                <span className="hidden sm:inline">Mobile </span>QR
              </span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              className="h-9 w-9 sm:h-8 sm:w-8 rounded-input text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center justify-center cursor-pointer shrink-0"
            >
              {theme === 'light' ? (
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>

            {isCloudSynced && isAdmin && (
              <Link
                href="/admin"
                aria-label="Allowlist Admin"
                title="Allowlist Admin"
                className="h-9 sm:h-8 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}

            {isCloudSynced ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Sign out"
                title="Sign out"
                className="h-9 sm:h-8 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              isFirebaseConfigured && (
                <Link
                  href="/login"
                  className="h-9 sm:h-8 px-2.5 rounded-input text-xs font-medium text-muted hover:text-ink hover:bg-paper-2 active:translate-y-px transition-colors flex items-center whitespace-nowrap shrink-0"
                >
                  Sign in
                </Link>
              )
            )}
          </div>
        </div>
      </footer>

      <QrModal data={qrModal} onClose={() => setQrModal(null)} />
      <ImageLightbox
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onOpenQr={(it) => {
          setLightboxItem(null);
          handleOpenItemQr(it);
        }}
      />
    </div>
  );
}
