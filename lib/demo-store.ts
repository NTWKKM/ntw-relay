import type { DropItem } from './types';

const STORAGE_KEY = 'personal_drop_demo_items_v1';
const SEEDED_KEY = 'personal_drop_demo_seeded_v1';
export const MAX_LOCAL_IMAGE_BYTES = 1.5 * 1024 * 1024; // Keep localStorage healthy

/**
 * Generates a crisp local SVG data URL representing a dark-mode architecture diagram
 * screenshot so Demo Mode has a rich, zero-dependency, 100% hermetic image preview.
 */
function createDemoScreenshotDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0d1117"/>
        <stop offset="100%" stop-color="#151b26"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#bg)"/>
    <g stroke="#242c3b" stroke-width="1">
      <line x1="0" y1="90" x2="1200" y2="90"/>
      <line x1="360" y1="90" x2="360" y2="750"/>
    </g>
    <circle cx="48" cy="45" r="7" fill="#3b4458"/>
    <circle cx="72" cy="45" r="7" fill="#3b4458"/>
    <circle cx="96" cy="45" r="7" fill="#3b4458"/>
    <text x="132" y="51" fill="#9aa4b5" font-family="ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="600">Personal Drop — Sync Architecture Diagram</text>
    <rect x="48" y="136" width="264" height="56" rx="10" fill="#1b2230" stroke="#313b4e"/>
    <text x="72" y="170" fill="#f1f5f9" font-family="ui-sans-serif, system-ui, sans-serif" font-size="17" font-weight="600">1. Client Capture</text>
    <rect x="48" y="216" width="264" height="56" rx="10" fill="#141923" stroke="#262f40"/>
    <text x="72" y="250" fill="#9aa4b5" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">Paste Cmd+V / Drag &amp; Drop</text>
    <rect x="48" y="296" width="264" height="56" rx="10" fill="#141923" stroke="#262f40"/>
    <text x="72" y="330" fill="#9aa4b5" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">Firestore onSnapshot</text>
    <rect x="48" y="376" width="264" height="56" rx="10" fill="#141923" stroke="#262f40"/>
    <text x="72" y="410" fill="#9aa4b5" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16">Storage Resumable Upload</text>
    <rect x="424" y="140" width="210" height="128" rx="14" fill="#171d29" stroke="#6366f1" stroke-width="2"/>
    <text x="452" y="188" fill="#e2e8f0" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="600">Laptop</text>
    <text x="452" y="220" fill="#818cf8" font-family="ui-monospace, monospace" font-size="14">Cmd+V Screenshot</text>
    <text x="452" y="244" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="13">uploadBytesResumable()</text>
    <line x1="634" y1="204" x2="720" y2="204" stroke="#6366f1" stroke-width="2.5" stroke-dasharray="6 5"/>
    <rect x="720" y="140" width="220" height="128" rx="14" fill="#171d29" stroke="#334155" stroke-width="1.5"/>
    <text x="748" y="188" fill="#e2e8f0" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="600">Firebase Cloud</text>
    <text x="748" y="220" fill="#94a3b8" font-family="ui-monospace, monospace" font-size="14">Firestore + Storage</text>
    <text x="748" y="244" fill="#22c55e" font-family="ui-monospace, monospace" font-size="13">Owner-Isolated Rules</text>
    <line x1="830" y1="268" x2="830" y2="386" stroke="#22c55e" stroke-width="2.5"/>
    <rect x="650" y="386" width="360" height="140" rx="14" fill="#171d29" stroke="#334155" stroke-width="1.5"/>
    <text x="680" y="434" fill="#e2e8f0" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="600">Phone Pickup via QR</text>
    <text x="680" y="466" fill="#94a3b8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">Scan card QR for instant direct download</text>
    <text x="680" y="496" fill="#818cf8" font-family="ui-monospace, monospace" font-size="14">getDownloadURL() -&gt; QRCodeSVG</text>
    <rect x="424" y="576" width="712" height="106" rx="12" fill="#111620" stroke="#242c3b"/>
    <text x="454" y="618" fill="#cbd5e1" font-family="ui-monospace, monospace" font-size="15">gsutil cors set cors.json gs://your-bucket.firebasestorage.app</text>
    <text x="454" y="652" fill="#64748b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14">Direct file downloads &amp; Canvas Copy Image verified without browser CORS errors</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createInitialDemoItems(nowMs: number = Date.now()): DropItem[] {
  const min = 60_000;
  const hour = 3_600_000;

  return [
    {
      id: 'drop_demo_link_1',
      ownerId: 'local_demo',
      type: 'text',
      content:
        'ลิงก์เอกสารตั้งค่า Firebase Storage CORS และเอกสารอ้างอิง: https://firebase.google.com/docs/storage/web/download-files',
      isCode: false,
      createdAtMs: nowMs - 4 * min,
      isLocalOnly: true,
    },
    {
      id: 'drop_demo_img_2',
      ownerId: 'local_demo',
      type: 'image',
      content: 'Sync architecture reference diagram',
      fileName: 'sync-architecture-diagram.svg',
      fileSize: 2840,
      mimeType: 'image/svg+xml',
      downloadUrl: createDemoScreenshotDataUrl(),
      createdAtMs: nowMs - 18 * min,
      isLocalOnly: true,
    },
    {
      id: 'drop_demo_code_3',
      ownerId: 'local_demo',
      type: 'text',
      content: `gcloud storage buckets update gs://<BUCKET_NAME> --cors-file=cors.json\nfirebase deploy --only firestore:rules,storage`,
      isCode: true,
      createdAtMs: nowMs - 2 * hour,
      isLocalOnly: true,
    },
    {
      id: 'drop_demo_file_4',
      ownerId: 'local_demo',
      type: 'file',
      content: 'Sample UTF-8 Thai filename document',
      fileName: 'สรุปแผนงาน_PersonalDrop_2569.txt',
      fileSize: 4280,
      mimeType: 'text/plain;charset=utf-8',
      downloadUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(
        'Personal Drop — Sample UTF-8 Document\nชื่อไฟล์ภาษาไทยรองรับ UTF-8 เต็มรูปแบบ\n'
      )}`,
      createdAtMs: nowMs - 30 * hour, // > 24h so "Clear Old (> 24h)" has a realistic target
      isLocalOnly: true,
    },
  ];
}

export function loadLocalDemoItems(): DropItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as DropItem[];
      }
    }
    const alreadySeeded = window.localStorage.getItem(SEEDED_KEY);
    if (!alreadySeeded) {
      const seeded = createInitialDemoItems();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      window.localStorage.setItem(SEEDED_KEY, '1');
      return seeded;
    }
    return [];
  } catch {
    return createInitialDemoItems();
  }
}

export function saveLocalDemoItems(items: DropItem[]): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') return { ok: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.localStorage.setItem(SEEDED_KEY, '1');
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Local browser storage is full. Delete older items or sign in with Firebase Sync.',
    };
  }
}
