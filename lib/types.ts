export type DropType = 'text' | 'image' | 'file';

export type FilterTab = 'all' | 'text' | 'image' | 'file';

export type CleanupRange = '24h' | '7d' | 'all';

export interface DropItem {
  id: string;
  ownerId: string;
  type: DropType;
  content: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  /** Local Demo Mode only: data:/blob: URL. Cloud files use Firestore chunks instead. */
  downloadUrl?: string;
  /** Number of Bytes chunk documents under drops/{id}/chunks (cloud files/images). */
  chunkCount?: number;
  /** Small inline JPEG data URL (images only) so the feed renders without loading chunks. */
  previewDataUrl?: string;
  isCode?: boolean;
  createdAtMs: number;
  /** True when stored only in localStorage demo mode (no public cloud URL) */
  isLocalOnly?: boolean;
}

export interface UploadTaskState {
  id: string;
  fileName: string;
  fileSize: number;
  bytesTransferred: number;
  progress: number;
  speedBps: number;
  status: 'uploading' | 'done' | 'error';
  errorMessage?: string;
}
