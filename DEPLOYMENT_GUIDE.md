# NTW Relay — Firestore-Only Setup & Deployment (Firebase Spark / free plan)

NTW Relay stores **everything in Cloud Firestore**: text drops, file metadata, and the file bytes
themselves. No Cloud Storage bucket, Blaze plan, or CORS configuration is required.

## 1. Environment Variables & Console Checklist
Copy `.env.example` to `.env.local` and fill in your `NEXT_PUBLIC_FIREBASE_*` values for local development.
For GitHub Pages deployment, configure the same `NEXT_PUBLIC_FIREBASE_*` keys in your GitHub repository under **Settings → Secrets and variables → Actions** (either **Variables** or **Secrets**).
Enable **Email/Password** and/or **Google** sign-in in Firebase Console.
Writes require a verified email.
- **Authorized domains**: Add `ntwkkm.github.io` (and any custom domain) under Firebase Console → Authentication → Settings → Authorized domains so Google Sign-In works on GitHub Pages.
- **Web API key restrictions**: Restrict the Firebase browser API key in Google Cloud Console to allowed HTTP referrers (`localhost`, `127.0.0.1`, `ntwkkm.github.io`, `gen-lang-client-0817705965.firebaseapp.com`).

## 2. Deploy Firestore Security Rules
```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use gen-lang-client-0817705965
npx -y firebase-tools@latest deploy --only firestore:rules
```
`firebase.json` targets the named database configured in `firestore.database`.

### 2.1 One-off storage counter backfill (Spark plan, runs locally)
Drops created before `/stats/storage` existed lack the `counted` marker, so the shared storage
meter excludes them. Deploy the rules **together with** the app build that writes `counted: true`,
then recompute the counter once with the Admin SDK (no Cloud Functions needed):

1. Firebase Console → Project settings → Service accounts → **Generate new private key**.
   Store the JSON outside the repo and never commit it.
2. Dry run (default, writes nothing) and review `newlyCounted`, `skipped`, `nextTotalBytes`:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=~/keys/ntw-relay-admin.json npm run backfill:storage
   ```
3. Apply:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS=~/keys/ntw-relay-admin.json npm run backfill:storage -- --apply
   ```

The script (`lib/storage-backfill.ts`) reads `/stats/storage` and every drop in **one transaction**,
marks sizable legacy drops `counted: true`, and sets `totalBytes` to the exact sum, so concurrent
client writes retry on top of the new total. It is idempotent and also repairs counter drift.
Drops whose shape the rules cannot size are reported under `skipped` and stay uncounted.
Project and database default to `.firebaserc` and `firebase.json`; override with
`--project` / `--database`. Aborts if more than 450 writes would be needed in one commit.
Verified against the emulator by `npm run test:rules`.

## 3. How files are stored
```
drops/{dropId}                    # metadata: ownerId, type, content, fileName, fileSize,
                                  #           mimeType, chunkCount, previewDataUrl?, isCode, counted, createdAt
drops/{dropId}/chunks/{0..13}     # { ownerId, index, data: Bytes (≤ 768 KiB) }
```
- Upload writes chunks first, then the parent doc (the feed never shows half-uploaded files);
  chunks are removed if the parent write fails.
- Images also get an inline JPEG `previewDataUrl` (≤ 640 px, ≤ 150 KB) so the feed renders
  without reading chunks. Full-size view, Download, and Copy Image read the chunks on demand
  and cache the reassembled `Blob` in memory.
- Delete removes all chunks and the parent doc in one `writeBatch`.

## 4. Limits (Spark plan)
| Item | Value |
| :--- | :--- |
| Max file size | 10 MB (`MAX_FILE_SIZE_BYTES` in `lib/drop-utils.ts`, mirrored in `firestore.rules`) |
| Chunk size | 768 KiB raw bytes (Firestore document limit is 1 MiB) |
| Writes per 10 MB file | 15 (14 chunks + 1 metadata doc) |
| Free quota | 1 GiB stored · 20k writes/day · 50k reads/day · 20k deletes/day |

> To change the cap, update `MAX_FILE_SIZE_BYTES` **and** the `fileSize` / `chunkCount` /
> chunk `index` bounds in `firestore.rules` + `firestore.rules.test.ts`, then redeploy the rules.

### QR codes
Text/link drops encode the content directly. Cloud files have no public URL, so their QR opens
the NTW Relay app; sign in on the phone to download.

## 5. Deploy the web app
GitHub Pages static export runs automatically on push to `main` (`.github/workflows/deploy.yml`).
Local verification:
```bash
npm test
npm run lint
GITHUB_PAGES=true npm run build
```
