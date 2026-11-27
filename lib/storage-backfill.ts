import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { estimateDropStorageBytes } from './drop-utils';

/**
 * Server-only (Admin SDK) recompute of /stats/storage. Never import from client code.
 *
 * Runs in ONE transaction: reads /stats/storage and every /drops doc, marks each computable
 * uncounted (legacy) drop `counted: true`, and sets totalBytes to the exact sum of
 * dropStorageBytes over all counted drops. Because the transaction locks /stats/storage,
 * concurrent client creates/deletes retry and then apply their delta on top of the new total.
 */

const MAX_STORED_TOTAL_BYTES = 10 * 1024 * 1024 * 1024; // matches firestore.rules
/** Conservative cap on writes per transaction commit. */
export const MAX_BACKFILL_WRITES = 450;

export interface BackfillReport {
  applied: boolean;
  dropCount: number;
  alreadyCounted: number;
  newlyCounted: string[];
  /** Drops whose shape firestore.rules cannot size (left uncounted, excluded from the total). */
  skipped: { id: string; reason: string }[];
  previousTotalBytes: number | null;
  nextTotalBytes: number;
}

/** Mirrors the inputs firestore.rules dropStorageBytes(d) reads; returns a reason when unsizable. */
function unsizableReason(d: DocumentData): string | null {
  if (typeof d.content !== 'string') return 'content is not a string';
  if ('fileSize' in d && (typeof d.fileSize !== 'number' || !Number.isFinite(d.fileSize))) {
    return 'fileSize is not a finite number';
  }
  if ('previewDataUrl' in d && typeof d.previewDataUrl !== 'string') return 'previewDataUrl is not a string';
  return null;
}

function rulesDropBytes(d: DocumentData): number {
  return estimateDropStorageBytes({
    content: d.content as string,
    fileSize: typeof d.fileSize === 'number' ? Math.trunc(d.fileSize) : undefined,
    previewDataUrl: typeof d.previewDataUrl === 'string' ? d.previewDataUrl : undefined,
  });
}

export async function recomputeStorageStats(
  db: Firestore,
  options: { apply: boolean }
): Promise<BackfillReport> {
  const statsRef = db.collection('stats').doc('storage');
  const dropsRef = db.collection('drops');

  return db.runTransaction(async (tx) => {
    const [statsSnap, dropsSnap] = await Promise.all([tx.get(statsRef), tx.get(dropsRef)]);

    const report: BackfillReport = {
      applied: false,
      dropCount: dropsSnap.size,
      alreadyCounted: 0,
      newlyCounted: [],
      skipped: [],
      previousTotalBytes: statsSnap.exists ? Number(statsSnap.get('totalBytes') ?? 0) : null,
      nextTotalBytes: 0,
    };

    let total = 0;
    for (const dropDoc of dropsSnap.docs) {
      const data = dropDoc.data();
      const reason = unsizableReason(data);
      if (data.counted === true) {
        // A counted drop is always rules-valid (created through isValidDrop)
        report.alreadyCounted += 1;
        total += rulesDropBytes(data);
      } else if (reason) {
        report.skipped.push({ id: dropDoc.id, reason });
      } else {
        report.newlyCounted.push(dropDoc.id);
        total += rulesDropBytes(data);
      }
    }
    report.nextTotalBytes = Math.min(MAX_STORED_TOTAL_BYTES, total);

    if (!options.apply) return report;

    if (report.newlyCounted.length + 1 > MAX_BACKFILL_WRITES) {
      throw new Error(
        `Backfill needs ${report.newlyCounted.length + 1} writes; limit is ${MAX_BACKFILL_WRITES} per transaction.`
      );
    }

    const existingLastId = statsSnap.exists ? statsSnap.get('lastDropId') : undefined;
    const lastDropId =
      typeof existingLastId === 'string' && existingLastId.length > 0
        ? existingLastId
        : dropsSnap.docs[0]?.id;
    if (!lastDropId) return report; // Empty project with no stats doc: nothing to baseline

    for (const id of report.newlyCounted) {
      tx.update(dropsRef.doc(id), { counted: true });
    }
    tx.set(statsRef, {
      totalBytes: report.nextTotalBytes,
      lastDropId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    report.applied = true;
    return report;
  });
}
