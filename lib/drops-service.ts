'use client';

import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
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
  formatBytes,
  generateDropId,
  looksLikeCode,
  MAX_FILE_SIZE_BYTES,
  MAX_TEXT_LENGTH,
  sanitizeFileName,
  splitIntoChunkRanges,
} from './drop-utils';
import { createImagePreviewDataUrl } from './image-preview';
import type { DropItem } from './types';

const DROPS_COLLECTION = 'drops';
const CHUNKS_SUBCOLLECTION = 'chunks';

/** In-memory cache of reassembled file Blobs keyed by dropId (avoids re-reading chunks). */
const blobCache = new Map<string, Promise<Blob>>();

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
      await setDoc(doc(firestore, DROPS_COLLECTION, dropId, CHUNKS_SUBCOLLECTION, chunkId), {
        ownerId: userId,
        index,
        data: Bytes.fromUint8Array(bytes),
      });
      writtenChunkIds.push(chunkId);
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
    blobCache.set(dropId, Promise.resolve(file));
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
  if (cached) return cached;

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

  blobCache.set(item.id, pending);
  pending.catch(() => blobCache.delete(item.id));
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
    blobCache.delete(item.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
