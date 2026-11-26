'use client';

import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  estimateDropStorageBytes,
  formatBytes,
  generateDropId,
  looksLikeCode,
  MAX_FILE_SIZE_BYTES,
  MAX_STORAGE_COUNTER_DELTA_BYTES,
  MAX_TEXT_LENGTH,
  sanitizeFileName,
  splitIntoChunkRanges,
} from './drop-utils';
import { createImagePreviewDataUrl } from './image-preview';
import type { DropItem } from './types';

const DROPS_COLLECTION = 'drops';
const CHUNKS_SUBCOLLECTION = 'chunks';
const STATS_COLLECTION = 'stats';
const STORAGE_STATS_DOC = 'storage';
const MAX_STORED_TOTAL_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB hard ceiling matching firestore.rules

const MAX_BLOB_CACHE_BYTES = 50 * 1024 * 1024; // 50 MB total LRU budget
const MAX_BLOB_CACHE_ENTRIES = 20;

interface BlobCacheEntry {
  promise: Promise<Blob>;
  size: number;
}

/** Bounded LRU in-memory cache of reassembled file Blobs keyed by dropId. */
const blobCache = new Map<string, BlobCacheEntry>();
let blobCacheTotalBytes = 0;

function deleteBlobCacheEntry(dropId: string) {
  const existing = blobCache.get(dropId);
  if (!existing) return;
  blobCacheTotalBytes = Math.max(0, blobCacheTotalBytes - existing.size);
  blobCache.delete(dropId);
}

function evictBlobCacheIfNeeded(keepDropId: string) {
  for (const key of blobCache.keys()) {
    if (blobCache.size <= MAX_BLOB_CACHE_ENTRIES && blobCacheTotalBytes <= MAX_BLOB_CACHE_BYTES) {
      break;
    }
    if (key === keepDropId) continue;
    deleteBlobCacheEntry(key);
  }
}

function setBlobCacheEntry(dropId: string, promise: Promise<Blob>, estimatedSize: number) {
  deleteBlobCacheEntry(dropId);
  const safeSize = Math.max(0, estimatedSize);
  const entry: BlobCacheEntry = { promise, size: safeSize };
  blobCache.set(dropId, entry);
  blobCacheTotalBytes += safeSize;
  evictBlobCacheIfNeeded(dropId);

  promise
    .then((blob) => {
      if (blobCache.get(dropId) !== entry) return;
      blobCacheTotalBytes = Math.max(0, blobCacheTotalBytes - entry.size + blob.size);
      entry.size = blob.size;
      evictBlobCacheIfNeeded(dropId);
    })
    .catch(() => {
      if (blobCache.get(dropId) === entry) {
        deleteBlobCacheEntry(dropId);
      }
    });
}

export function subscribeToUserDrops(
  userId: string,
  onUpdate: (items: DropItem[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }

  // Query strictly scoped to ownerId (no composite index required; sorted newest-first in memory)
  const dropsQuery = query(
    collection(db, DROPS_COLLECTION),
    where('ownerId', '==', userId)
  );

  return onSnapshot(
    dropsQuery,
    (snapshot) => {
      const mapped: DropItem[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const createdAtVal = data.createdAt;
        let createdAtMs = Date.now();
        if (createdAtVal instanceof Timestamp) {
          createdAtMs = createdAtVal.toMillis();
        } else if (typeof createdAtVal === 'number') {
          createdAtMs = createdAtVal;
        }

        return {
          id: docSnap.id,
          ownerId: String(data.ownerId ?? userId),
          type: (data.type as DropItem['type']) ?? 'text',
          content: String(data.content ?? ''),
          fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
          fileSize: typeof data.fileSize === 'number' ? data.fileSize : undefined,
          mimeType: typeof data.mimeType === 'string' ? data.mimeType : undefined,
          chunkCount: typeof data.chunkCount === 'number' ? data.chunkCount : undefined,
          previewDataUrl:
            typeof data.previewDataUrl === 'string' &&
            data.previewDataUrl.startsWith('data:image/jpeg;base64,')
              ? data.previewDataUrl
              : undefined,
          isCode: typeof data.isCode === 'boolean' ? data.isCode : undefined,
          createdAtMs,
          isLocalOnly: false,
        };
      });

      mapped.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onUpdate(mapped);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, DROPS_COLLECTION);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Best-effort transactional update of the shared /stats/storage counter across all accounts.
 * Clamps totalBytes >= 0 and delta within firestore.rules bounds; never fails the primary mutation.
 */
async function adjustGlobalStorageBytes(rawDeltaBytes: number): Promise<void> {
  const firestore = db;
  if (!firestore || !Number.isFinite(rawDeltaBytes)) return;
  const delta = Math.max(
    -MAX_STORAGE_COUNTER_DELTA_BYTES,
    Math.min(MAX_STORAGE_COUNTER_DELTA_BYTES, Math.round(rawDeltaBytes))
  );
  if (delta === 0) return;

  const statsRef = doc(firestore, STATS_COLLECTION, STORAGE_STATS_DOC);
  try {
    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(statsRef);
      if (!snap.exists()) {
        tx.set(statsRef, {
          totalBytes: Math.max(0, delta),
          updatedAt: serverTimestamp(),
        });
        return;
      }
      const rawCurrent = snap.data().totalBytes;
      const current =
        typeof rawCurrent === 'number' && Number.isFinite(rawCurrent)
          ? Math.max(0, Math.floor(rawCurrent))
          : 0;
      const next = Math.min(MAX_STORED_TOTAL_BYTES, Math.max(0, current + delta));
      tx.update(statsRef, {
        totalBytes: next,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // Non-blocking: counter contention or un-deployed rules must not break uploads/deletes.
  }
}

/**
 * Subscribes to the shared /stats/storage document tracking aggregate bytes across all accounts.
 */
export function subscribeToGlobalStorageBytes(
  onUpdate: (totalBytes: number) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }

  const statsRef = doc(db, STATS_COLLECTION, STORAGE_STATS_DOC);
  return onSnapshot(
    statsRef,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(0);
        return;
      }
      const raw = snap.data().totalBytes;
      onUpdate(typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0);
    },
    () => {
      // Quietly ignore if rules for /stats/storage are not yet deployed.
    }
  );
}

export async function createCloudTextDrop(userId: string, rawText: string): Promise<string> {
  if (!db) throw new Error('Firestore is not configured.');
  const content = rawText.trim().slice(0, MAX_TEXT_LENGTH);
  const dropId = generateDropId();
  const path = `${DROPS_COLLECTION}/${dropId}`;

  try {
    await setDoc(doc(db, DROPS_COLLECTION, dropId), {
      ownerId: userId,
      type: 'text',
      content,
      isCode: looksLikeCode(content),
      createdAt: serverTimestamp(),
    });
    void adjustGlobalStorageBytes(estimateDropStorageBytes({ content }));
    return dropId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export interface CloudUploadCallbacks {
  onProgress: (info: { bytesTransferred: number; totalBytes: number; progress: number; speedBps: number }) => void;
}

export async function uploadCloudFileDrop(
  userId: string,
  file: File,
  callbacks: CloudUploadCallbacks
): Promise<string> {
  const firestore = db;
  if (!firestore) throw new Error('Firestore is not configured.');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} limit.`);
  }

  const dropId = generateDropId();
  const safeName = sanitizeFileName(file.name || 'dropped-file');
  const contentType = (file.type || 'application/octet-stream').slice(0, 128);
  const isImage = contentType.startsWith('image/');
  const path = `${DROPS_COLLECTION}/${dropId}`;
  const ranges = splitIntoChunkRanges(file.size);
  const writtenChunkIds: string[] = [];
  const startedAt = Date.now();

  const reportProgress = (bytesTransferred: number) => {
    const elapsedSec = Math.max(0.1, (Date.now() - startedAt) / 1000);
    callbacks.onProgress({
      bytesTransferred,
      totalBytes: file.size,
      progress: file.size > 0 ? Math.round((bytesTransferred / file.size) * 100) : 100,
      speedBps: bytesTransferred / elapsedSec,
    });
  };

  try {
    // Build the inline thumbnail first so a decode failure never leaves orphaned chunks
    const previewDataUrl = isImage ? await createImagePreviewDataUrl(file) : null;
    reportProgress(0);

    // 1) Chunks first (raw Bytes, no base64 inflation) ...
    for (const { index, start, end } of ranges) {
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
      const chunkId = String(index);
      // Record before awaiting so cleanup can remove chunks that committed before a local error
      writtenChunkIds.push(chunkId);
      await setDoc(doc(firestore, DROPS_COLLECTION, dropId, CHUNKS_SUBCOLLECTION, chunkId), {
        ownerId: userId,
        index,
        data: Bytes.fromUint8Array(bytes),
      });
      reportProgress(end);
    }

    // 2) ... then the parent doc, so the feed only ever shows fully uploaded files
    await setDoc(doc(firestore, DROPS_COLLECTION, dropId), {
      ownerId: userId,
      type: isImage ? 'image' : 'file',
      content: safeName,
      fileName: safeName,
      fileSize: file.size,
      mimeType: contentType,
      chunkCount: ranges.length,
      ...(previewDataUrl ? { previewDataUrl } : {}),
      createdAt: serverTimestamp(),
    });
    setBlobCacheEntry(dropId, Promise.resolve(file), file.size);
    void adjustGlobalStorageBytes(
      estimateDropStorageBytes({
        content: safeName,
        fileSize: file.size,
        previewDataUrl,
      })
    );
    return dropId;
  } catch (error) {
    // Best-effort cleanup of chunks that were written before the failure
    await Promise.allSettled(
      writtenChunkIds.map((chunkId) =>
        deleteDoc(doc(firestore, DROPS_COLLECTION, dropId, CHUNKS_SUBCOLLECTION, chunkId))
      )
    );
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Reassembles a cloud file from its Firestore Bytes chunks (cached per dropId).
 */
export function fetchCloudDropBlob(item: DropItem): Promise<Blob> {
  const cached = blobCache.get(item.id);
  if (cached) {
    // Refresh LRU recency
    blobCache.delete(item.id);
    blobCache.set(item.id, cached);
    return cached.promise;
  }

  const pending = (async () => {
    const firestore = db;
    if (!firestore) throw new Error('Firestore is not configured.');
    const expected = item.chunkCount ?? 0;
    const mimeType = item.mimeType || 'application/octet-stream';
    if (expected === 0) return new Blob([], { type: mimeType });

    const chunksPath = `${DROPS_COLLECTION}/${item.id}/${CHUNKS_SUBCOLLECTION}`;
    let parts: { index: number; bytes: Uint8Array<ArrayBuffer> }[];
    try {
      const snap = await getDocs(
        query(
          collection(firestore, DROPS_COLLECTION, item.id, CHUNKS_SUBCOLLECTION),
          where('ownerId', '==', item.ownerId)
        )
      );
      parts = snap.docs.map((d) => {
        const data = d.data();
        return {
          index: Number(data.index),
          bytes: (data.data as Bytes).toUint8Array() as Uint8Array<ArrayBuffer>,
        };
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, chunksPath);
    }

    parts.sort((a, b) => a.index - b.index);
    const complete =
      parts.length === expected && parts.every((part, i) => part.index === i);
    if (!complete) {
      throw new Error(
        `File data is incomplete (${parts.length}/${expected} chunks). Re-upload the file.`
      );
    }
    return new Blob(
      parts.map((part) => part.bytes),
      { type: mimeType }
    );
  })();

  setBlobCacheEntry(item.id, pending, item.fileSize ?? 0);
  return pending;
}

export async function toggleCloudDropCodeMode(dropId: string, nextIsCode: boolean): Promise<void> {
  if (!db) throw new Error('Firestore is not configured.');
  const path = `${DROPS_COLLECTION}/${dropId}`;
  try {
    await updateDoc(doc(db, DROPS_COLLECTION, dropId), { isCode: nextIsCode });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCloudDrop(item: DropItem): Promise<void> {
  const firestore = db;
  if (!firestore) throw new Error('Firestore is not configured.');
  const path = `${DROPS_COLLECTION}/${item.id}`;

  try {
    const batch = writeBatch(firestore);
    if (typeof item.chunkCount === 'number' && item.chunkCount > 0) {
      // Query (not blind index deletes): rules deny deleting non-existent chunk docs
      const chunkSnap = await getDocs(
        query(
          collection(firestore, DROPS_COLLECTION, item.id, CHUNKS_SUBCOLLECTION),
          where('ownerId', '==', item.ownerId)
        )
      );
      chunkSnap.docs.forEach((chunkDoc) => batch.delete(chunkDoc.ref));
    }
    batch.delete(doc(firestore, DROPS_COLLECTION, item.id));
    await batch.commit();
    deleteBlobCacheEntry(item.id);
    void adjustGlobalStorageBytes(-estimateDropStorageBytes(item));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
