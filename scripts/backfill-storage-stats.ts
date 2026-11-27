/**
 * One-off /stats/storage baseline for drops created before the counter existed.
 * Spark-plan friendly: runs locally with the Admin SDK (no Cloud Functions).
 *
 * Usage (dry run by default; add --apply to write):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run backfill:storage -- [--apply] [--project <id>] [--database <id>]
 *
 * Defaults: project from .firebaserc "default", database from firebase.json firestore.database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { recomputeStorageStats } from '../lib/storage-backfill';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readJson(file: string): Record<string, unknown> | null {
  const p = path.resolve(process.cwd(), file);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>) : null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const projectId =
    argValue('--project') ??
    ((readJson('.firebaserc')?.projects as Record<string, string> | undefined)?.default);
  const databaseId =
    argValue('--database') ??
    ((readJson('firebase.json')?.firestore as Record<string, string> | undefined)?.database) ??
    '(default)';
  if (!projectId) throw new Error('No project id: pass --project or set .firebaserc default.');

  const app = initializeApp(
    process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() }
  );
  const db = getFirestore(app, databaseId);

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · project=${projectId} · database=${databaseId}`);
  const report = await recomputeStorageStats(db, { apply });
  console.log(JSON.stringify(report, null, 2));
  if (!apply) console.log('No changes written. Re-run with --apply to commit.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
