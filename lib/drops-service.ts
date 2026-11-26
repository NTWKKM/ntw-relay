'use client';

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from './firebase';
import {
  generateDropId,
  looksLikeCode,
  MAX_FILE_SIZE_BYTES,
  MAX_TEXT_LENGTH,
  sanitizeFileName,
} from './drop-utils';
import type { DropItem } from './types';

const DROPS_COLLECTION = 'drops';

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
          downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : undefined,
          storagePath: typeof data.storagePath === 'string' ? data.storagePath : undefined,
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
  if (!db || !storage) throw new Error('Firebase Storage is not configured.');
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the 500 MB limit.');
  }

  const dropId = generateDropId();
  const safeName = sanitizeFileName(file.name || 'dropped-file');
  const storagePath = `drops/${userId}/${dropId}/${safeName}`;
  const fileRef = storageRef(storage, storagePath);

  const startedAt = Date.now();
  const contentType = file.type || 'application/octet-stream';

  // Stream the File/Blob directly without base64 inflation
  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType,
    cacheControl: 'private, max-age=3600',
    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const elapsedSec = Math.max(0.1, (Date.now() - startedAt) / 1000);
        const speedBps = snapshot.bytesTransferred / elapsedSec;
        const progress =
          snapshot.totalBytes > 0
            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            : 100;
        callbacks.onProgress({
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
          progress,
          speedBps,
        });
      },
      (err) => reject(err),
      () => resolve()
    );
  });

  const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
  const isImage = contentType.startsWith('image/');
  const path = `${DROPS_COLLECTION}/${dropId}`;

  try {
    await setDoc(doc(db, DROPS_COLLECTION, dropId), {
      ownerId: userId,
      type: isImage ? 'image' : 'file',
      content: safeName,
      fileName: safeName,
      fileSize: file.size,
      mimeType: contentType.slice(0, 128),
      downloadUrl,
      storagePath,
      createdAt: serverTimestamp(),
    });
    return dropId;
  } catch (error) {
    // Clean up orphaned storage blob if Firestore write failed
    try {
      await deleteObject(fileRef);
    } catch {
      // Ignore cleanup failure
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
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
  if (!db) throw new Error('Firestore is not configured.');
  const path = `${DROPS_COLLECTION}/${item.id}`;

  // Remove backing Storage object first if present
  if (item.storagePath && storage) {
    try {
      await deleteObject(storageRef(storage, item.storagePath));
    } catch (err) {
      // Ignore storage/object-not-found so Firestore metadata can still be cleaned up
      const code = (err as { code?: string })?.code;
      if (code !== 'storage/object-not-found') {
        console.warn('Storage delete warning:', err);
      }
    }
  }

  try {
    await deleteDoc(doc(db, DROPS_COLLECTION, item.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
