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
  const sessionLargeLocalItemsRef = useRef<DropItem[]>(sessionLargeLocalItems);

  useEffect(() => {
    sessionLargeLocalItemsRef.current = sessionLargeLocalItems;
  }, [sessionLargeLocalItems]);

  useEffect(() => {
    return () => {
      sessionLargeLocalItemsRef.current.forEach((it) => revokeBlobUrl(it.downloadUrl));
    };
  }, []);
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

      const next = [newItem, ...getLocalDemoSnapshot()];
      const saved = saveLocalDemoItems(next);
      if (!saved.ok && saved.error) setSyncNotice(saved.error);
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
      ? 'bg-[#DC2626] dark:bg-[#F87171]'
      : storageUsage.level === 'warning'
        ? 'bg-[#D97706] dark:bg-[#FBBF24]'
        : 'bg-[#181715] dark:bg-[#F3EFE8]';

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex flex-col">
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <h1 className="sr-only">NTW Relay</h1>
        {/* Email verification prompt (only shown when actually unverified) */}
        {isCloudSynced && firebaseUser && !firebaseUser.emailVerified && (
          <div className="rounded-xl bg-[#FEF9EC] dark:bg-[#2A2010] border border-[#F3D9A4] dark:border-[#5C4318] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#78350F] dark:text-[#FDE68A]">
            <span className="font-medium">Verify your email to sync writes.</span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleSendVerification()}
                disabled={verifyingEmail}
                className="h-8 px-3 rounded-lg bg-[#92400E] hover:bg-[#78350F] text-[#FFFBEB] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                Send link
              </button>
              <button
                type="button"
                onClick={() => void handleRefreshVerification()}
                disabled={verifyingEmail}
                className="h-8 px-3 rounded-lg bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E5C88B] dark:border-[#5C4318] text-[#78350F] dark:text-[#FDE68A] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
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
        />

        {/* Transient Notice / Error */}
        {(syncNotice || syncError) && (
          <div
            role="status"
            className={`rounded-lg px-3.5 py-2 text-xs flex items-center justify-between gap-3 border ${
              syncError
                ? 'bg-[#FEF2F2] dark:bg-[#3A1717]/60 border-[#FECACA] dark:border-[#7F1D1D]/70 text-[#991B1B] dark:text-[#FCA5A5]'
                : 'bg-[#FCFBF8] dark:bg-[#1A1917] border-[#E2DCD0] dark:border-[#2C2925] text-[#3D3A35] dark:text-[#D6CFC2]'
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
              className="h-7 w-7 rounded-md flex items-center justify-center text-[#787268] dark:text-[#8A8378] hover:text-[#181715] dark:hover:text-[#F3EFE8] shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Feed Section */}
        <section aria-label="Drops stream" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Segmented Filter Tabs */}
            <div
              role="tablist"
              aria-label="Filter items"
              className="flex items-center gap-0.5 p-1 rounded-xl bg-[#EBE6DC] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] overflow-x-auto"
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
                    className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[#FCFBF8] dark:bg-[#2A2723] text-[#181715] dark:text-[#F3EFE8] shadow-xs'
                        : 'text-[#6B655C] dark:text-[#968F84] hover:text-[#181715] dark:hover:text-[#F3EFE8]'
                    }`}
                  >
                    <span>{t.label}</span>
                    <span className="font-mono text-[11px] text-[#787268] dark:text-[#8A8378] tabular-nums">
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
                  className="w-3.5 h-3.5 text-[#787268] dark:text-[#8A8378] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  className="w-full h-9 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] pl-8 pr-7 text-xs sm:text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-[#787268] hover:text-[#181715] dark:hover:text-[#F3EFE8] cursor-pointer"
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
                className="mwg-popover-trigger h-9 px-3 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#443F38] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
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
                <div className="w-52 rounded-xl bg-[#FCFBF8] dark:bg-[#1E1C1A] border border-[#DDD6C8] dark:border-[#322E28] shadow-xl p-1.5 space-y-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('24h')}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs text-[#181715] dark:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#2A2723] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Older than 24h</span>
                    <span className="font-mono text-[11px] text-[#787268] dark:text-[#8A8378] tabular-nums">
                      {olderThan24hCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('7d')}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs text-[#181715] dark:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#2A2723] flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Older than 7d</span>
                    <span className="font-mono text-[11px] text-[#787268] dark:text-[#8A8378] tabular-nums">
                      {olderThan7dCount}
                    </span>
                  </button>
                  <div className="my-1 border-t border-[#E2DCD0] dark:border-[#2C2925]" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleCleanup('all')}
                    className="w-full px-3 py-2 rounded-lg text-left text-xs text-[#B91C1C] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1717]/60 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span>Clear all</span>
                    <span className="font-mono text-[11px] opacity-75 tabular-nums">
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
                  className="h-28 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] py-14 px-6 text-center space-y-2">
              <p className="font-[family-name:var(--font-display)] text-base font-medium text-[#181715] dark:text-[#F3EFE8]">
                {items.length === 0 ? 'No drops yet' : 'No matches'}
              </p>
              <p className="text-xs text-[#787268] dark:text-[#8A8378]">
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
                  className="mt-2 h-8 px-3.5 rounded-lg bg-[#181715] dark:bg-[#F3EFE8] text-xs font-medium text-[#FCFBF8] dark:text-[#121110] hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Reset
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

      {/* Unified quiet footer: Brand, sync identity, limit, and workspace controls */}
      <footer className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 border-t border-[#E2DCD0]/70 dark:border-[#272420]/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#787268] dark:text-[#8A8378]">
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 min-w-0">
          <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight text-[#181715] dark:text-[#F3EFE8] whitespace-nowrap shrink-0">
            NTW Relay
          </span>
          <span className="text-[#D4CEC2] dark:text-[#3A3630] select-none" aria-hidden="true">
            ·
          </span>
          <div className="flex items-center gap-1.5 min-w-0">
            {isCloudSynced && isAdmin && (
            <Link
              href="/admin"
              aria-label="Allowlist Admin"
              title="Allowlist Admin"
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}

          {isCloudSynced ? (
              <>
                <Cloud
                  className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80] shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">{firebaseUser?.email}</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Local sandbox</span>
              </>
            )}
          </div>
          <span className="text-[#D4CEC2] dark:text-[#3A3630] select-none" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-[11px] shrink-0">Max 10 MB/file</span>
          <span className="text-[#D4CEC2] dark:text-[#3A3630] select-none" aria-hidden="true">
            ·
          </span>
          <div
            className="flex items-center gap-2 shrink-0"
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
              className="w-20 sm:w-24 h-1.5 rounded-full bg-[#E2DCD0] dark:bg-[#2C2925] overflow-hidden"
            >
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${storageBarFillClass}`}
                style={{
                  width: `${storageReady && storageUsage.usedBytes > 0 ? Math.max(2, storageUsage.percent) : 0}%`,
                }}
              />
            </div>
            <span className="font-mono text-[11px] tabular-nums whitespace-nowrap">
              {storageReady ? `${formatBytes(storageUsage.usedBytes)} / 1 GB` : '— / 1 GB'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenAppQr}
            aria-label="Mobile QR"
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
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
            className="h-8 w-8 rounded-lg text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center justify-center cursor-pointer shrink-0"
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
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
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
              className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            isFirebaseConfigured && (
              <Link
                href="/login"
                className="h-8 px-2.5 rounded-lg text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:bg-[#EAE5DB] dark:hover:bg-[#22201C] transition-colors flex items-center whitespace-nowrap shrink-0"
              >
                Sign in
              </Link>
            )
          )}
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
