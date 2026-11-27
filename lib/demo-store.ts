import type { DropItem } from './types';

const STORAGE_KEY = 'ntw_relay_demo_items_v1';
const SEEDED_KEY = 'ntw_relay_demo_seeded_v1';
export const MAX_LOCAL_IMAGE_BYTES = 1.5 * 1024 * 1024; // Keep localStorage healthy

/**
 * Generates a crisp local SVG data URL representing a warm archival studio architecture
 * diagram so Sandbox / Demo Mode has a rich, zero-dependency, 100% hermetic image preview.
 */
function createDemoScreenshotDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750">
    <rect width="1200" height="750" fill="#F5F2EB"/>
    <g stroke="#E3DDD1" stroke-width="1">
      <line x1="0" y1="88" x2="1200" y2="88"/>
      <line x1="360" y1="88" x2="360" y2="750"/>
    </g>
    <text x="48" y="54" fill="#181715" font-family="Georgia, serif" font-size="22" font-weight="600">NTW Relay — Cross-Device Handoff Diagram</text>
    <text x="980" y="52" fill="#787268" font-family="ui-monospace, monospace" font-size="14">SHEET 01 / ARCH</text>

    <rect x="48" y="136" width="264" height="58" rx="8" fill="#181715"/>
    <text x="72" y="171" fill="#FCFBF8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="600">01. Client Capture</text>

    <rect x="48" y="216" width="264" height="58" rx="8" fill="#FCFBF8" stroke="#DDD6C8"/>
    <text x="72" y="250" fill="#5D5850" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">Paste Cmd+V / Drag &amp; Drop</text>

    <rect x="48" y="296" width="264" height="58" rx="8" fill="#FCFBF8" stroke="#DDD6C8"/>
    <text x="72" y="330" fill="#5D5850" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">Firestore onSnapshot</text>

    <rect x="48" y="376" width="264" height="58" rx="8" fill="#FCFBF8" stroke="#DDD6C8"/>
    <text x="72" y="410" fill="#5D5850" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">Firestore Bytes Chunks</text>

    <rect x="424" y="140" width="224" height="132" rx="10" fill="#FCFBF8" stroke="#1D4ED8" stroke-width="1.5"/>
    <text x="450" y="186" fill="#181715" font-family="Georgia, serif" font-size="21" font-weight="600">Workstation</text>
    <text x="450" y="218" fill="#1D4ED8" font-family="ui-monospace, monospace" font-size="14">Cmd+V Screenshot</text>
    <text x="450" y="244" fill="#787268" font-family="ui-monospace, monospace" font-size="13">768 KiB chunks → setDoc()</text>

    <line x1="648" y1="206" x2="732" y2="206" stroke="#1D4ED8" stroke-width="2" stroke-dasharray="6 5"/>

    <rect x="732" y="140" width="232" height="132" rx="10" fill="#FCFBF8" stroke="#D2C9B8" stroke-width="1.5"/>
    <text x="758" y="186" fill="#181715" font-family="Georgia, serif" font-size="21" font-weight="600">Firebase Vault</text>
    <text x="758" y="218" fill="#5D5850" font-family="ui-monospace, monospace" font-size="14">Firestore Only</text>
    <text x="758" y="244" fill="#15803D" font-family="ui-monospace, monospace" font-size="13">Owner-Isolated Rules</text>

    <line x1="848" y1="272" x2="848" y2="386" stroke="#181715" stroke-width="1.75"/>

    <rect x="656" y="386" width="384" height="142" rx="10" fill="#FCFBF8" stroke="#D2C9B8" stroke-width="1.5"/>
    <text x="686" y="434" fill="#181715" font-family="Georgia, serif" font-size="21" font-weight="600">Phone Pickup via QR</text>
    <text x="686" y="466" fill="#5D5850" font-family="ui-sans-serif, system-ui, sans-serif" font-size="15">Scan QR to open the app, sign in, download</text>
    <text x="686" y="498" fill="#1D4ED8" font-family="ui-monospace, monospace" font-size="14">chunks → Blob → Download</text>

    <rect x="424" y="576" width="712" height="106" rx="10" fill="#EFECE4" stroke="#DDD6C8"/>
    <text x="454" y="618" fill="#181715" font-family="ui-monospace, monospace" font-size="15">firebase deploy --only firestore:rules</text>
    <text x="454" y="652" fill="#5D5850" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14">Free Spark plan · no Cloud Storage bucket or CORS setup required</text>
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
        'เอกสารอ้างอิง Firestore Security Rules สำหรับ NTW Relay: https://firebase.google.com/docs/firestore/security/get-started',
      isCode: false,
      createdAtMs: nowMs - 4 * min,
      isLocalOnly: true,
    },
    {
      id: 'drop_demo_img_2',
      ownerId: 'local_demo',
      type: 'image',
      content: 'NTW Relay sync architecture reference diagram',
      fileName: 'relay-architecture.svg',
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
      content: `firebase deploy --only firestore:rules`,
      isCode: true,
      createdAtMs: nowMs - 2 * hour,
      isLocalOnly: true,
    },
    {
      id: 'drop_demo_file_4',
      ownerId: 'local_demo',
      type: 'file',
      content: 'Sample UTF-8 Thai filename document',
      fileName: 'สรุปแผนงาน_NTW_Relay_2569.txt',
      fileSize: 4280,
      mimeType: 'text/plain;charset=utf-8',
      downloadUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(
        'NTW Relay — Sample UTF-8 Document\nชื่อไฟล์ภาษาไทยรองรับ UTF-8 เต็มรูปแบบ\n'
      )}`,
      createdAtMs: nowMs - 30 * hour, // > 24h so "Clear Old (> 24h)" has a realistic target
      isLocalOnly: true,
    },
  ];
}

const EMPTY_DEMO_ITEMS: DropItem[] = [];
const demoListeners = new Set<() => void>();
let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: DropItem[] = EMPTY_DEMO_ITEMS;

function notifyDemoListeners() {
  demoListeners.forEach((listener) => listener());
}

export function subscribeLocalDemo(onStoreChange: () => void): () => void {
  demoListeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedRaw = undefined;
      onStoreChange();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    demoListeners.delete(onStoreChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function getServerDemoSnapshot(): DropItem[] {
  return EMPTY_DEMO_ITEMS;
}

export function getLocalDemoSnapshot(): DropItem[] {
  if (typeof window === 'undefined') return EMPTY_DEMO_ITEMS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw && cachedRaw !== undefined) {
      return cachedSnapshot;
    }
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        cachedRaw = raw;
        cachedSnapshot = parsed as DropItem[];
        return cachedSnapshot;
      }
    }
    const alreadySeeded = window.localStorage.getItem(SEEDED_KEY);
    if (!alreadySeeded) {
      const seeded = createInitialDemoItems();
      const serialized = JSON.stringify(seeded);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      window.localStorage.setItem(SEEDED_KEY, '1');
      cachedRaw = serialized;
      cachedSnapshot = seeded;
      return cachedSnapshot;
    }
    cachedRaw = raw;
    cachedSnapshot = EMPTY_DEMO_ITEMS;
    return cachedSnapshot;
  } catch {
    return cachedSnapshot;
  }
}

export function loadLocalDemoItems(): DropItem[] {
  return getLocalDemoSnapshot();
}

export function saveLocalDemoItems(items: DropItem[]): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') return { ok: true };
  try {
    const serialized = JSON.stringify(items);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    window.localStorage.setItem(SEEDED_KEY, '1');
    cachedRaw = serialized;
    cachedSnapshot = items;
    notifyDemoListeners();
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Local browser storage is full. Delete older items or sign in with Firebase Sync.',
    };
  }
}
