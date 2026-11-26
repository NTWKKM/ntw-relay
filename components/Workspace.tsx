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
import type { User } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  LogOut,
  Moon,
  QrCode,
  Search,
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
  getLocalDemoSnapshot,
  getServerDemoSnapshot,
  MAX_LOCAL_IMAGE_BYTES,
  saveLocalDemoItems,
  subscribeLocalDemo,
} from '@/lib/demo-store';
import {
  buildAppShareUrl,
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

interface WorkspaceProps {
  forceLocalDemo?: boolean;
}

export function Workspace({ forceLocalDemo = false }: WorkspaceProps) {
  const { user: firebaseUser, authReady, refreshUser } = useAuthUser();
  const { theme, toggleTheme } = useMaterialTheme();
  const isCloudSynced = Boolean(!forceLocalDemo && isFirebaseConfigured && firebaseUser);

  const localItems = useSyncExternalStore(
    subscribeLocalDemo,
    getLocalDemoSnapshot,
    getServerDemoSnapshot
  );
  const [cloudItems, setCloudItems] = useState<DropItem[]>([]);
  const [sessionLargeLocalItems, setSessionLargeLocalItems] = useState<DropItem[]>([]);
  const [loadingCloudFeed, setLoadingCloudFeed] = useState(isCloudSynced);
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
      (nextCloudItems) => {
        setCloudItems(nextCloudItems);
        setLoadingCloudFeed(false);
      },
      (err) => {
        setSyncError(err.message);
        setLoadingCloudFeed(false);
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
                setSyncNotice(
                  `${safeName} is kept for this browser session. Sign in with Firebase Sync for persistent large file transfers.`
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
      setSessionLargeLocalItems((prev) => prev.filter((it) => it.id !== item.id));
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
        const next = getLocalDemoSnapshot().filter((it) => !targetIds.has(it.id));
        saveLocalDemoItems(next);
        setSessionLargeLocalItems((prev) => prev.filter((it) => !targetIds.has(it.id)));
      }
      setSyncNotice(`Removed ${targetIds.size} ${targetIds.size === 1 ? 'item' : 'items'}.`);
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
      title: 'Connect Mobile',
      subtitle: 'Scan with your phone camera to open NTW Relay',
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
    <div className="min-h-screen bg-[#F5F2EB] text-[#181715] dark:bg-[#121110] dark:text-[#F3EFE8] flex flex-col">
      {/* Top Bar Contract: Single row, 3 strict zones separated by gap-8 */}
      <header className="sticky top-0 z-30 h-15 bg-[#F5F2EB]/92 dark:bg-[#121110]/92 backdrop-blur-md border-b border-[#E2DCD0] dark:border-[#272420]">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 sm:gap-8">
          {/* Zone 1: Single-element Editorial Wordmark */}
          <span className="font-[family-name:var(--font-display)] text-lg sm:text-xl font-semibold tracking-tight text-[#181715] dark:text-[#F3EFE8] whitespace-nowrap shrink-0">
            NTW Relay
          </span>

          {/* Zone 2: Clean single-line utility text links */}
          <nav
            aria-label="Workspace navigation"
            className="hidden sm:flex items-center gap-6 text-sm font-medium text-[#5D5850] dark:text-[#A8A196]"
          >
            <button
              type="button"
              onClick={() => setSetupDocsOpen(true)}
              className="hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rules &amp; Guide
            </button>
            {isCloudSynced ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out
              </button>
            ) : (
              isFirebaseConfigured && (
                <Link
                  href="/login"
                  className="hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
                >
                  Sign In
                </Link>
              )
            )}
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenAppQr}
              className="h-9 px-3.5 rounded-lg bg-[#181715] hover:bg-[#2E2C28] dark:bg-[#F3EFE8] dark:hover:bg-[#E2DBD0] text-[#FCFBF8] dark:text-[#121110] text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" aria-hidden="true" />
              <span>Connect Mobile</span>
            </button>

            {isCloudSynced && (
              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Sign out"
                className="sm:hidden h-9 w-9 rounded-lg bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#DDD6C8] dark:border-[#2E2A25] text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] flex items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-9 space-y-6 sm:space-y-8">
        {/* Quiet Sync Whisper & Optional Verification Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[#5D5850] dark:text-[#A8A196] min-w-0">
              {isCloudSynced ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-[#15803D] dark:text-[#4ADE80] shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    Firebase Live Sync ·{' '}
                    <span className="font-medium text-[#181715] dark:text-[#F3EFE8]">
                      {firebaseUser?.email}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-[#787268] dark:text-[#8A8378] shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    <span className="font-medium text-[#181715] dark:text-[#F3EFE8]">
                      {forceLocalDemo ? 'Local Sandbox' : 'Local Demo'}
                    </span>
                    <span className="hidden sm:inline"> · Stored in this browser</span>
                    {isFirebaseConfigured ? (
                      <>
                        {' · '}
                        <Link
                          href="/login"
                          className="text-[#1D4ED8] dark:text-[#60A5FA] hover:underline underline-offset-4 font-medium whitespace-nowrap"
                        >
                          Sign in
                        </Link>
                      </>
                    ) : null}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setSetupDocsOpen(true)}
                className="sm:hidden text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] transition-colors cursor-pointer whitespace-nowrap"
              >
                Guide
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'light' ? 'Switch to Inkstone dark theme' : 'Switch to Paper light theme'}
                className="h-8 px-2.5 rounded-lg border border-[#DDD6C8] dark:border-[#2E2A25] bg-[#FCFBF8] dark:bg-[#1A1917] text-xs font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                {theme === 'light' ? (
                  <>
                    <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Inkstone</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Paper</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {isCloudSynced && firebaseUser && !firebaseUser.emailVerified && (
            <div className="rounded-xl bg-[#FEF9EC] dark:bg-[#2A2010] border border-[#F3D9A4] dark:border-[#5C4318] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#78350F] dark:text-[#FDE68A]">
              <p className="leading-relaxed">
                <span className="font-semibold">Verify email to write drops</span>
                {' — '}
                Firestore rules require a verified email before saving or deleting items.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleSendVerification()}
                  disabled={verifyingEmail}
                  className="h-8 px-3 rounded-lg bg-[#92400E] hover:bg-[#78350F] text-[#FFFBEB] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  Send Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => void handleRefreshVerification()}
                  disabled={verifyingEmail}
                  className="h-8 px-3 rounded-lg bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E5C88B] dark:border-[#5C4318] text-[#78350F] dark:text-[#FDE68A] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  Refresh Status
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Architectural Dispatch Surface (Composer + File Drop Tray) */}
        <DropComposer
          onSendText={handleSendText}
          onUploadFiles={handleUploadFiles}
          uploads={uploads}
        />

        {/* Transient Notice / Error */}
        {(syncNotice || syncError) && (
          <div
            role="status"
            className={`rounded-lg px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between gap-3 border ${
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
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Editorial Stream Section */}
        <section aria-label="Dropped items feed" className="space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E2DCD0] dark:border-[#272420]">
            {/* Segmented Filter Tabs */}
            <div
              role="tablist"
              aria-label="Filter items by type"
              className="flex items-center gap-1 p-1 rounded-xl bg-[#EBE6DC] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] overflow-x-auto"
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
                    className={`h-8.5 px-3.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
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

            {/* Search & Cleanup Controls */}
            <div className="flex items-center gap-2.5 flex-1 md:flex-initial md:justify-end">
              <div className="relative flex-1 md:w-64">
                <Search
                  className="w-4 h-4 text-[#787268] dark:text-[#8A8378] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
                  className="w-full h-10 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] pl-9 pr-8 text-sm text-[#181715] dark:text-[#F3EFE8] placeholder:text-[#8E877B] dark:placeholder:text-[#6E685F] focus:outline-none focus:border-[#1D4ED8] dark:focus:border-[#60A5FA] transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-[#787268] hover:text-[#181715] dark:hover:text-[#F3EFE8] cursor-pointer"
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
                  className="h-10 px-3.5 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] text-xs sm:text-sm font-medium text-[#5D5850] dark:text-[#A8A196] hover:text-[#181715] dark:hover:text-[#F3EFE8] hover:border-[#C5BDB0] dark:hover:border-[#443F38] disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{cleaningUp ? 'Clearing...' : 'Clear Old'}</span>
                </button>

                {cleanupOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-xl bg-[#FCFBF8] dark:bg-[#1E1C1A] border border-[#DDD6C8] dark:border-[#322E28] shadow-xl p-1.5 z-20 space-y-0.5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('24h')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-[#181715] dark:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#2A2723] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Older than 24 hours</span>
                      <span className="font-mono text-xs text-[#787268] dark:text-[#8A8378] tabular-nums">
                        {olderThan24hCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('7d')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-[#181715] dark:text-[#F3EFE8] hover:bg-[#F2EFE7] dark:hover:bg-[#2A2723] flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Older than 7 days</span>
                      <span className="font-mono text-xs text-[#787268] dark:text-[#8A8378] tabular-nums">
                        {olderThan7dCount}
                      </span>
                    </button>
                    <div className="my-1 border-t border-[#E2DCD0] dark:border-[#2C2925]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleCleanup('all')}
                      className="w-full px-3 py-2.5 rounded-lg text-left text-xs sm:text-sm text-[#B91C1C] dark:text-[#F87171] hover:bg-[#FEF2F2] dark:hover:bg-[#3A1717]/60 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span>Clear all items</span>
                      <span className="font-mono text-xs opacity-75 tabular-nums">
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
            <div className="space-y-3.5" aria-label="Loading drops">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-32 rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl bg-[#FCFBF8] dark:bg-[#1A1917] border border-[#E2DCD0] dark:border-[#2C2925] py-16 px-6 text-center space-y-3">
              <p className="font-[family-name:var(--font-display)] text-lg font-medium text-[#181715] dark:text-[#F3EFE8]">
                {items.length === 0
                  ? 'Your relay stream is clear'
                  : 'No items match your filter'}
              </p>
              <p className="text-sm text-[#6B655C] dark:text-[#968F84] max-w-sm mx-auto leading-relaxed">
                {items.length === 0
                  ? 'Write a note above, drop any file, or press Cmd/Ctrl+V anywhere to send a screenshot across your devices.'
                  : 'Try clearing your search query or switching back to the All tab.'}
              </p>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterTab('all');
                    setSearchQuery('');
                  }}
                  className="mt-2 h-9 px-4 rounded-lg bg-[#181715] dark:bg-[#F3EFE8] text-xs font-medium text-[#FCFBF8] dark:text-[#121110] hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3.5" data-testid="drop-feed">
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
