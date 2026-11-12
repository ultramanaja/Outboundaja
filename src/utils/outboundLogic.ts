export const BANGSAL_TAGS = ['Reg', 'HV', 'DOC', 'BP', 'CARGO'] as const;
export type BangsalTag = (typeof BANGSAL_TAGS)[number];

export const DEFAULT_BANGSAL_TAG: BangsalTag = 'Reg';

export const DEFAULT_SUPABASE_URL = 'https://japrxrakdloyhuchdlnr.supabase.co';
export const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable__xAollf27vKdArrQ1QfZxA_qwCzTiv8';
export const TARGET_PUBLISH_DOMAIN = 'https://outboundaja.skom.id';

export const DEFAULT_STAGING_CODES = [
  'TANB', 'TBET', 'KBYB', 'JGKA', 'CNER', 'PSMG', 'PREB', 'CPYU',
  'KRAJ', 'BJIN', 'TJHL', 'BGOT', 'KASB', 'BOGU', 'CLKU', 'SKMJ',
  'CBTO', 'SDBR', 'PDGD', 'TLJU', 'STIB', 'TNGH', 'BGSR', 'JTSA',
  'TPOS', 'KDUM', 'SMJA', 'PMAS', 'PCRM', 'CGIN', 'CLBR', 'MLYH',
  'SKMN', 'SKB', 'STR', 'SRG', 'KRW',
] as const;

export const DEFAULT_STAGING_DESTINATIONS: Readonly<Record<string, string>> = {
  TANB: 'Tanah Abang',
  TBET: 'TEBET',
  KBYB: 'Kebayoran Baru',
  JGKA: 'Jagakarsa',
  CNER: 'Cinere',
  PSMG: 'Pasar Minggu',
  BJIN: 'Bojong Indah',
  TJHL: 'Tajur Halang',
  BGOT: 'Bojong Timur',
  KASB: 'Kasam Barat',
  BOGU: 'Bojong Utara',
  CLKU: 'Cileungsi',
};

export interface BangsalItem {
  id: string;
  bangsalCode: string;
  qtyBagseal: number;
  tag: BangsalTag;
  scannedAt: string;
  note?: string;
}

export interface StagingSession {
  id: string;
  name: string;
  destination: string;
  isManual: boolean;
  createdAt: string;
  updatedAt: string;
  items: BangsalItem[];
}

export type SyncStatus = 'pending' | 'synced';

export interface OutboundRecord {
  id: string;
  stagingId: string;
  stagingName: string;
  destination: string;
  completedAt: string;
  totalBangsal: number;
  totalBagseal: number;
  items: BangsalItem[];
  syncStatus: SyncStatus;
  syncedAt?: string;
  syncTarget?: string;
}

export interface SyncSettings {
  gsheetWebhookUrl: string;
  sheetName: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  autoSyncSupabase: boolean;
}

export interface AppDatabaseState {
  stagings: StagingSession[];
  outboundHistory: OutboundRecord[];
  syncSettings: SyncSettings;
  lastUpdated: string;
}

export function createCleanDefaultState(nowIso: string = new Date().toISOString()): AppDatabaseState {
  return {
    stagings: DEFAULT_STAGING_CODES.map((code) => ({
      id: `stg-${code.toLowerCase()}`,
      name: code,
      destination: DEFAULT_STAGING_DESTINATIONS[code] ?? 'Staging Default',
      isManual: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      items: [],
    })),
    outboundHistory: [],
    syncSettings: {
      gsheetWebhookUrl: '',
      sheetName: 'Outbound_Log',
      supabaseUrl: DEFAULT_SUPABASE_URL,
      supabaseAnonKey: DEFAULT_SUPABASE_PUBLISHABLE_KEY,
      autoSyncSupabase: true,
    },
    lastUpdated: nowIso,
  };
}

export function isValidBangsalTag(value: unknown): value is BangsalTag {
  return typeof value === 'string' && (BANGSAL_TAGS as readonly string[]).includes(value);
}

export function normalizeBangsalTag(value?: string | null): BangsalTag {
  if (value && isValidBangsalTag(value)) {
    return value;
  }
  return DEFAULT_BANGSAL_TAG;
}

export function parseMultiScanInput(raw: string): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }
  return raw
    .split(/[\r\n,;|\t]+/)
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);
}

export function validateStagingInput(
  name: string,
  existingStagings: StagingSession[]
): { valid: boolean; error?: string; normalizedName: string } {
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) {
    return {
      valid: false,
      error: 'Nama staging wajib diisi.',
      normalizedName: '',
    };
  }
  if (normalizedName.length < 2) {
    return {
      valid: false,
      error: 'Nama staging minimal 2 karakter.',
      normalizedName,
    };
  }
  const duplicate = existingStagings.some(
    (s) => s.name.toLowerCase() === normalizedName.toLowerCase()
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Staging "${normalizedName}" sudah terdaftar.`,
      normalizedName,
    };
  }
  return { valid: true, normalizedName };
}

export function addScannedItemsToStaging(
  staging: StagingSession,
  rawCodes: string[],
  qtyBagsealPerItem: number,
  selectedTag: BangsalTag = DEFAULT_BANGSAL_TAG,
  nowIso: string = new Date().toISOString()
): { updatedStaging: StagingSession; addedCount: number; mergedCount: number } {
  const safeQty = Math.max(1, Math.floor(Number.isFinite(qtyBagsealPerItem) ? qtyBagsealPerItem : 1));
  const safeTag = normalizeBangsalTag(selectedTag);
  const nextItems = staging.items.map((item) => ({ ...item }));

  let addedCount = 0;
  let mergedCount = 0;

  for (const rawCode of rawCodes) {
    const cleanCode = rawCode.trim().toUpperCase();
    if (!cleanCode) continue;

    const existingIdx = nextItems.findIndex(
      (item) => item.bangsalCode.toUpperCase() === cleanCode
    );

    if (existingIdx >= 0) {
      const existing = nextItems[existingIdx];
      nextItems[existingIdx] = {
        ...existing,
        qtyBagseal: existing.qtyBagseal + safeQty,
        tag: selectedTag ? safeTag : existing.tag,
        scannedAt: nowIso,
      };
      mergedCount += 1;
    } else {
      nextItems.unshift({
        id: `bgs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${addedCount}`,
        bangsalCode: cleanCode,
        qtyBagseal: safeQty,
        tag: safeTag,
        scannedAt: nowIso,
      });
      addedCount += 1;
    }
  }

  return {
    updatedStaging: {
      ...staging,
      updatedAt: nowIso,
      items: nextItems,
    },
    addedCount,
    mergedCount,
  };
}

export function updateBangsalItemInStaging(
  staging: StagingSession,
  itemId: string,
  patch: { qtyBagseal?: number; tag?: BangsalTag; note?: string },
  nowIso: string = new Date().toISOString()
): StagingSession {
  const items = staging.items.map((item) => {
    if (item.id !== itemId) return item;
    const nextQty =
      patch.qtyBagseal !== undefined
        ? Math.max(1, Math.floor(patch.qtyBagseal))
        : item.qtyBagseal;
    const nextTag = patch.tag !== undefined ? normalizeBangsalTag(patch.tag) : item.tag;
    const nextNote = patch.note !== undefined ? patch.note : item.note;
    return {
      ...item,
      qtyBagseal: nextQty,
      tag: nextTag,
      note: nextNote,
    };
  });

  return {
    ...staging,
    updatedAt: nowIso,
    items,
  };
}

export function removeBangsalItemFromStaging(
  staging: StagingSession,
  itemId: string,
  nowIso: string = new Date().toISOString()
): StagingSession {
  return {
    ...staging,
    updatedAt: nowIso,
    items: staging.items.filter((item) => item.id !== itemId),
  };
}

export function calculateStagingTotals(items: BangsalItem[]): {
  totalBangsal: number;
  totalBagseal: number;
  tagCounts: Record<BangsalTag, number>;
} {
  const tagCounts: Record<BangsalTag, number> = {
    Reg: 0,
    HV: 0,
    DOC: 0,
    BP: 0,
    CARGO: 0,
  };
  let totalBagseal = 0;

  for (const item of items) {
    totalBagseal += item.qtyBagseal;
    const t = normalizeBangsalTag(item.tag);
    tagCounts[t] += 1;
  }

  return {
    totalBangsal: items.length,
    totalBagseal,
    tagCounts,
  };
}

export function finalizeStagingToOutbound(
  staging: StagingSession,
  completedAtIso: string = new Date().toISOString()
): { resetStaging: StagingSession; outboundRecord: OutboundRecord } {
  if (staging.items.length === 0) {
    throw new Error('Tidak dapat menyelesaikan staging kosong. Scan minimal 1 bangsal terlebih dahulu.');
  }

  const { totalBangsal, totalBagseal } = calculateStagingTotals(staging.items);

  const outboundRecord: OutboundRecord = {
    id: `OUT-${completedAtIso.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    stagingId: staging.id,
    stagingName: staging.name,
    destination: staging.destination,
    completedAt: completedAtIso,
    totalBangsal,
    totalBagseal,
    items: staging.items.map((item) => ({ ...item })),
    syncStatus: 'pending',
  };

  const resetStaging: StagingSession = {
    ...staging,
    updatedAt: completedAtIso,
    items: [],
  };

  return {
    resetStaging,
    outboundRecord,
  };
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildOutboundCsv(records: OutboundRecord[]): string {
  const headers = [
    'ID Outbound',
    'Nama Staging',
    'Tujuan / Gate',
    'Waktu Selesai Outbound',
    'Kode Bangsal',
    'Tag Bangsal',
    'Qty Bagseal',
    'Waktu Scan Bangsal',
    'Status Sync Google',
    'Waktu Sync',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  for (const rec of records) {
    for (const item of rec.items) {
      const row = [
        rec.id,
        rec.stagingName,
        rec.destination,
        rec.completedAt,
        item.bangsalCode,
        item.tag,
        item.qtyBagseal,
        item.scannedAt,
        rec.syncStatus === 'synced' ? 'Tersinkronisasi' : 'Belum Sync',
        rec.syncedAt ?? '',
      ];
      lines.push(row.map(escapeCsvCell).join(','));
    }
  }

  return lines.join('\r\n');
}

export function buildGoogleSheetsTsv(records: OutboundRecord[]): string {
  const headers = [
    'ID Outbound',
    'Nama Staging',
    'Tujuan / Gate',
    'Waktu Selesai Outbound',
    'Kode Bangsal',
    'Tag Bangsal',
    'Qty Bagseal',
    'Waktu Scan Bangsal',
    'Status Sync',
  ];

  const lines: string[] = [headers.join('\t')];

  for (const rec of records) {
    for (const item of rec.items) {
      lines.push(
        [
          rec.id,
          rec.stagingName,
          rec.destination,
          rec.completedAt,
          item.bangsalCode,
          item.tag,
          String(item.qtyBagseal),
          item.scannedAt,
          'Tersinkronisasi',
        ]
          .map((cell) => cell.replace(/[\t\r\n]+/g, ' '))
          .join('\t')
      );
    }
  }

  return lines.join('\n');
}

export interface GSheetRowPayload {
  outboundId: string;
  stagingName: string;
  destination: string;
  completedAt: string;
  bangsalCode: string;
  tag: BangsalTag;
  qtyBagseal: number;
  scannedAt: string;
}

export function buildGoogleSheetsRows(records: OutboundRecord[]): GSheetRowPayload[] {
  const rows: GSheetRowPayload[] = [];
  for (const rec of records) {
    for (const item of rec.items) {
      rows.push({
        outboundId: rec.id,
        stagingName: rec.stagingName,
        destination: rec.destination,
        completedAt: rec.completedAt,
        bangsalCode: item.bangsalCode,
        tag: item.tag,
        qtyBagseal: item.qtyBagseal,
        scannedAt: item.scannedAt,
      });
    }
  }
  return rows;
}

export function filterOutboundRecords(
  records: OutboundRecord[],
  searchQuery: string,
  tagFilter: BangsalTag | 'ALL',
  syncFilter: 'ALL' | SyncStatus
): OutboundRecord[] {
  const q = searchQuery.trim().toLowerCase();

  return records.filter((rec) => {
    if (syncFilter !== 'ALL' && rec.syncStatus !== syncFilter) {
      return false;
    }
    if (tagFilter !== 'ALL') {
      const hasMatchingTag = rec.items.some((i) => i.tag === tagFilter);
      if (!hasMatchingTag) return false;
    }
    if (q) {
      const matchBatch =
        rec.id.toLowerCase().includes(q) ||
        rec.stagingName.toLowerCase().includes(q) ||
        rec.destination.toLowerCase().includes(q);
      const matchBangsal = rec.items.some((i) => i.bangsalCode.toLowerCase().includes(q));
      if (!matchBatch && !matchBangsal) return false;
    }
    return true;
  });
}
