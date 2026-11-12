import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_TAGS = ['Reg', 'HV', 'DOC', 'BP', 'CARGO'] as const;
type BangsalTag = (typeof VALID_TAGS)[number];

interface BangsalItem {
  id: string;
  bangsalCode: string;
  qtyBagseal: number;
  tag: BangsalTag;
  scannedAt: string;
  note?: string;
}

interface StagingSession {
  id: string;
  name: string;
  destination: string;
  isManual: boolean;
  createdAt: string;
  updatedAt: string;
  items: BangsalItem[];
}

interface OutboundRecord {
  id: string;
  stagingId: string;
  stagingName: string;
  destination: string;
  completedAt: string;
  totalBangsal: number;
  totalBagseal: number;
  items: BangsalItem[];
  syncStatus: 'pending' | 'synced';
  syncedAt?: string;
  syncTarget?: string;
}

interface SyncSettings {
  gsheetWebhookUrl: string;
  sheetName: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  autoSyncSupabase: boolean;
}

interface AppDatabaseState {
  stagings: StagingSession[];
  outboundHistory: OutboundRecord[];
  syncSettings: SyncSettings;
  lastUpdated: string;
}

const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'outbound-realtime-db.json');

function normalizeTag(value: unknown): BangsalTag {
  if (typeof value === 'string' && (VALID_TAGS as readonly string[]).includes(value)) {
    return value as BangsalTag;
  }
  return 'Reg';
}

function createSeedState(): AppDatabaseState {
  const baseTime = '2026-11-12T08:15:00.000Z';
  return {
    stagings: [
      {
        id: 'stg-jkt-01',
        name: 'STG-JKT-01',
        destination: 'Hub Jakarta Utara · Gate A1',
        isManual: false,
        createdAt: '2026-11-12T07:30:00.000Z',
        updatedAt: '2026-11-12T08:12:00.000Z',
        items: [
          {
            id: 'bgs-seed-1',
            bangsalCode: 'BGS-JKT-4401',
            qtyBagseal: 4,
            tag: 'Reg',
            scannedAt: '2026-11-12T08:10:12.000Z',
          },
          {
            id: 'bgs-seed-2',
            bangsalCode: 'BGS-JKT-4402',
            qtyBagseal: 2,
            tag: 'HV',
            scannedAt: '2026-11-12T08:11:05.000Z',
          },
          {
            id: 'bgs-seed-3',
            bangsalCode: 'BGS-JKT-4403',
            qtyBagseal: 1,
            tag: 'DOC',
            scannedAt: '2026-11-12T08:12:00.000Z',
          },
        ],
      },
      {
        id: 'stg-sby-01',
        name: 'STG-SBY-01',
        destination: 'Hub Surabaya Rungkut · Gate C1',
        isManual: false,
        createdAt: '2026-11-12T07:35:00.000Z',
        updatedAt: '2026-11-12T08:05:00.000Z',
        items: [
          {
            id: 'bgs-seed-4',
            bangsalCode: 'BGS-SBY-7101',
            qtyBagseal: 5,
            tag: 'CARGO',
            scannedAt: '2026-11-12T08:03:20.000Z',
          },
          {
            id: 'bgs-seed-5',
            bangsalCode: 'BGS-SBY-7102',
            qtyBagseal: 3,
            tag: 'BP',
            scannedAt: '2026-11-12T08:05:00.000Z',
          },
        ],
      },
      {
        id: 'stg-bdg-02',
        name: 'STG-BDG-02',
        destination: 'Hub Bandung Soekarno-Hatta · Gate B2',
        isManual: false,
        createdAt: '2026-11-12T07:40:00.000Z',
        updatedAt: '2026-11-12T07:40:00.000Z',
        items: [],
      },
    ],
    outboundHistory: [
      {
        id: 'OUT-20261112-A81F',
        stagingId: 'stg-mdn-01',
        stagingName: 'STG-MDN-01',
        destination: 'Hub Medan Amplas · Gate D1',
        completedAt: '2026-11-12T07:55:00.000Z',
        totalBangsal: 3,
        totalBagseal: 10,
        syncStatus: 'pending',
        items: [
          {
            id: 'bgs-hist-1',
            bangsalCode: 'BGS-MDN-1201',
            qtyBagseal: 3,
            tag: 'Reg',
            scannedAt: '2026-11-12T07:48:00.000Z',
          },
          {
            id: 'bgs-hist-2',
            bangsalCode: 'BGS-MDN-1202',
            qtyBagseal: 1,
            tag: 'HV',
            scannedAt: '2026-11-12T07:50:15.000Z',
          },
          {
            id: 'bgs-hist-3',
            bangsalCode: 'BGS-MDN-1203',
            qtyBagseal: 6,
            tag: 'CARGO',
            scannedAt: '2026-11-12T07:53:40.000Z',
          },
        ],
      },
      {
        id: 'OUT-20261112-B40C',
        stagingId: 'stg-smg-03',
        stagingName: 'STG-SMG-03',
        destination: 'Hub Semarang Barat · Gate A4',
        completedAt: '2026-11-12T07:20:00.000Z',
        totalBangsal: 2,
        totalBagseal: 6,
        syncStatus: 'synced',
        syncedAt: '2026-11-12T07:24:10.000Z',
        syncTarget: 'Google Sheets (Outbound_Log)',
        items: [
          {
            id: 'bgs-hist-4',
            bangsalCode: 'BGS-SMG-3101',
            qtyBagseal: 4,
            tag: 'Reg',
            scannedAt: '2026-11-12T07:15:00.000Z',
          },
          {
            id: 'bgs-hist-5',
            bangsalCode: 'BGS-SMG-3102',
            qtyBagseal: 2,
            tag: 'BP',
            scannedAt: '2026-11-12T07:18:10.000Z',
          },
        ],
      },
    ],
    syncSettings: {
      gsheetWebhookUrl: process.env.GSHEET_WEBHOOK_URL || '',
      sheetName: 'Outbound_Log',
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      autoSyncSupabase: true,
    },
    lastUpdated: baseTime,
  };
}

function loadDatabase(): AppDatabaseState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as AppDatabaseState;
      if (Array.isArray(parsed.stagings) && Array.isArray(parsed.outboundHistory)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read database file, initializing seed state:', err);
  }
  const seed = createSeedState();
  saveDatabaseToDisk(seed);
  return seed;
}

function saveDatabaseToDisk(state: AppDatabaseState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist database file:', err);
  }
}

async function mirrorToSupabaseIfConfigured(state: AppDatabaseState): Promise<void> {
  const rawUrl = state.syncSettings.supabaseUrl?.trim();
  const rawKey = state.syncSettings.supabaseAnonKey?.trim();
  if (!rawUrl || !rawKey || !state.syncSettings.autoSyncSupabase) return;

  try {
    const cleanBase = rawUrl.replace(/\/+$/, '');
    const endpoint = `${cleanBase}/rest/v1/stageflow_state?on_conflict=id`;
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': rawKey,
        'Authorization': `Bearer ${rawKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        id: 'current',
        stagings: state.stagings,
        outbound_history: state.outboundHistory,
        last_updated: state.lastUpdated,
      }),
    });
  } catch (err) {
    console.error('Supabase REST sync notice (check URL & Key):', err);
  }
}

let dbState: AppDatabaseState = loadDatabase();
const sseClients = new Set<Response>();

function commitAndBroadcast(): void {
  dbState.lastUpdated = new Date().toISOString();
  saveDatabaseToDisk(dbState);
  const payload = `data: ${JSON.stringify(dbState)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
  void mirrorToSupabaseIfConfigured(dbState);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  // Realtime SSE stream endpoint
  app.get('/api/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify(dbState)}\n\n`);
    sseClients.add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Initial state snapshot
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json(dbState);
  });

  // Add new manual staging
  app.post('/api/stagings', (req: Request, res: Response) => {
    const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
    const rawDest = typeof req.body?.destination === 'string' ? req.body.destination : '';
    const normalizedName = rawName.trim().replace(/\s+/g, ' ');
    const normalizedDest = rawDest.trim() || 'Area Outbound Manual';

    if (normalizedName.length < 2) {
      res.status(400).json({ error: 'Nama staging wajib diisi (minimal 2 karakter).' });
      return;
    }

    const exists = dbState.stagings.some(
      (s) => s.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (exists) {
      res.status(400).json({ error: `Staging "${normalizedName}" sudah terdaftar.` });
      return;
    }

    const now = new Date().toISOString();
    const newStaging: StagingSession = {
      id: `stg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: normalizedName,
      destination: normalizedDest,
      isManual: true,
      createdAt: now,
      updatedAt: now,
      items: [],
    };

    dbState.stagings.unshift(newStaging);
    commitAndBroadcast();
    res.status(201).json({ staging: newStaging, state: dbState });
  });

  // Delete staging lane
  app.delete('/api/stagings/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (dbState.stagings.length <= 1) {
      res.status(400).json({ error: 'Minimal 1 staging harus tetap tersedia.' });
      return;
    }
    const idx = dbState.stagings.findIndex((s) => s.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Staging tidak ditemukan.' });
      return;
    }
    dbState.stagings.splice(idx, 1);
    commitAndBroadcast();
    res.json({ state: dbState });
  });

  // Multi-item or single barcode scan into active staging
  app.post('/api/stagings/:id/scan', (req: Request, res: Response) => {
    const { id } = req.params;
    const staging = dbState.stagings.find((s) => s.id === id);
    if (!staging) {
      res.status(404).json({ error: 'Staging tidak ditemukan.' });
      return;
    }

    const rawCodes: unknown[] = Array.isArray(req.body?.codes) ? req.body.codes : [];
    const qtyRaw = Number(req.body?.qtyBagseal ?? 1);
    const safeQty = Math.max(1, Math.floor(Number.isFinite(qtyRaw) ? qtyRaw : 1));
    const tag = normalizeTag(req.body?.tag);

    const cleanedCodes = rawCodes
      .map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : ''))
      .filter((c) => c.length > 0);

    if (cleanedCodes.length === 0) {
      res.status(400).json({ error: 'Masukkan atau scan minimal satu kode barcode bangsal.' });
      return;
    }

    const now = new Date().toISOString();
    let addedCount = 0;
    let mergedCount = 0;

    for (const code of cleanedCodes) {
      const existing = staging.items.find((i) => i.bangsalCode.toUpperCase() === code);
      if (existing) {
        existing.qtyBagseal += safeQty;
        existing.tag = tag;
        existing.scannedAt = now;
        mergedCount += 1;
      } else {
        staging.items.unshift({
          id: `bgs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${addedCount}`,
          bangsalCode: code,
          qtyBagseal: safeQty,
          tag,
          scannedAt: now,
        });
        addedCount += 1;
      }
    }

    staging.updatedAt = now;
    commitAndBroadcast();
    res.json({ addedCount, mergedCount, staging, state: dbState });
  });

  // Update qtyBagseal or tag on a Bangsal item inside active staging
  app.patch('/api/stagings/:id/items/:itemId', (req: Request, res: Response) => {
    const { id, itemId } = req.params;
    const staging = dbState.stagings.find((s) => s.id === id);
    if (!staging) {
      res.status(404).json({ error: 'Staging tidak ditemukan.' });
      return;
    }
    const item = staging.items.find((i) => i.id === itemId);
    if (!item) {
      res.status(404).json({ error: 'Item bangsal tidak ditemukan.' });
      return;
    }

    if (req.body?.qtyBagseal !== undefined) {
      const parsed = Math.floor(Number(req.body.qtyBagseal));
      if (!Number.isFinite(parsed) || parsed < 1) {
        res.status(400).json({ error: 'Qty bagseal minimal 1.' });
        return;
      }
      item.qtyBagseal = parsed;
    }

    if (req.body?.tag !== undefined) {
      item.tag = normalizeTag(req.body.tag);
    }

    staging.updatedAt = new Date().toISOString();
    commitAndBroadcast();
    res.json({ item, state: dbState });
  });

  // Remove Bangsal item from active staging
  app.delete('/api/stagings/:id/items/:itemId', (req: Request, res: Response) => {
    const { id, itemId } = req.params;
    const staging = dbState.stagings.find((s) => s.id === id);
    if (!staging) {
      res.status(404).json({ error: 'Staging tidak ditemukan.' });
      return;
    }
    staging.items = staging.items.filter((i) => i.id !== itemId);
    staging.updatedAt = new Date().toISOString();
    commitAndBroadcast();
    res.json({ state: dbState });
  });

  // Finalize staging -> move result into Riwayat Outbound
  app.post('/api/stagings/:id/finalize', (req: Request, res: Response) => {
    const { id } = req.params;
    const staging = dbState.stagings.find((s) => s.id === id);
    if (!staging) {
      res.status(404).json({ error: 'Staging tidak ditemukan.' });
      return;
    }
    if (staging.items.length === 0) {
      res
        .status(400)
        .json({ error: 'Staging masih kosong. Scan minimal 1 bangsal sebelum dijadikan outbound.' });
      return;
    }

    const now = new Date().toISOString();
    const totalBangsal = staging.items.length;
    const totalBagseal = staging.items.reduce((sum, i) => sum + i.qtyBagseal, 0);

    const record: OutboundRecord = {
      id: `OUT-${now.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      stagingId: staging.id,
      stagingName: staging.name,
      destination: staging.destination,
      completedAt: now,
      totalBangsal,
      totalBagseal,
      items: staging.items.map((item) => ({ ...item })),
      syncStatus: 'pending',
    };

    dbState.outboundHistory.unshift(record);
    staging.items = [];
    staging.updatedAt = now;

    commitAndBroadcast();
    res.json({ record, state: dbState });
  });

  // Sync finalized Outbound History records to Google Sheets
  app.post('/api/outbound/sync-gsheet', async (req: Request, res: Response) => {
    const recordIds: string[] = Array.isArray(req.body?.recordIds) ? req.body.recordIds : [];
    const targets =
      recordIds.length > 0
        ? dbState.outboundHistory.filter((r) => recordIds.includes(r.id))
        : dbState.outboundHistory.filter((r) => r.syncStatus === 'pending');

    if (targets.length === 0) {
      res.status(400).json({ error: 'Tidak ada data riwayat outbound yang dipilih untuk disinkronkan.' });
      return;
    }

    const sheetName = dbState.syncSettings.sheetName || 'Outbound_Log';
    const webhookUrl =
      (typeof req.body?.webhookUrl === 'string' && req.body.webhookUrl.trim()) ||
      dbState.syncSettings.gsheetWebhookUrl.trim();

    const rows = targets.flatMap((rec) =>
      rec.items.map((item) => ({
        outboundId: rec.id,
        stagingName: rec.stagingName,
        destination: rec.destination,
        completedAt: rec.completedAt,
        bangsalCode: item.bangsalCode,
        tag: item.tag,
        qtyBagseal: item.qtyBagseal,
        scannedAt: item.scannedAt,
      }))
    );

    let deliveryMode = `Google Sheets (${sheetName})`;

    if (webhookUrl) {
      try {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetName,
            syncedAt: new Date().toISOString(),
            rows,
          }),
        });
        if (!resp.ok) {
          res.status(502).json({
            error: `Endpoint Google Apps Script merespons HTTP ${resp.status}. Periksa URL Web App Anda.`,
          });
          return;
        }
        deliveryMode = `Webhook Google Sheets (${sheetName})`;
      } catch (err) {
        res.status(502).json({
          error: `Gagal menghubungi URL Google Apps Script: ${err instanceof Error ? err.message : 'Network error'}`,
        });
        return;
      }
    } else {
      // Save a local Google Sheets cloud-ready mirror log file as well
      const gsheetMirrorPath = path.join(DATA_DIR, 'gsheet-synced-rows.json');
      try {
        fs.writeFileSync(
          gsheetMirrorPath,
          JSON.stringify({ sheetName, updatedAt: new Date().toISOString(), rows }, null, 2),
          'utf8'
        );
      } catch {
        // Non-fatal
      }
    }

    const syncedAt = new Date().toISOString();
    for (const rec of targets) {
      rec.syncStatus = 'synced';
      rec.syncedAt = syncedAt;
      rec.syncTarget = deliveryMode;
    }

    commitAndBroadcast();
    res.json({
      syncedBatches: targets.length,
      syncedRows: rows.length,
      syncedAt,
      deliveryMode,
      state: dbState,
    });
  });

  // Delete an outbound history record
  app.delete('/api/outbound/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    dbState.outboundHistory = dbState.outboundHistory.filter((r) => r.id !== id);
    commitAndBroadcast();
    res.json({ state: dbState });
  });

  // Update sync & realtime integration settings
  app.put('/api/settings', (req: Request, res: Response) => {
    if (typeof req.body?.gsheetWebhookUrl === 'string') {
      dbState.syncSettings.gsheetWebhookUrl = req.body.gsheetWebhookUrl.trim();
    }
    if (typeof req.body?.sheetName === 'string' && req.body.sheetName.trim()) {
      dbState.syncSettings.sheetName = req.body.sheetName.trim();
    }
    if (typeof req.body?.supabaseUrl === 'string') {
      dbState.syncSettings.supabaseUrl = req.body.supabaseUrl.trim();
    }
    if (typeof req.body?.supabaseAnonKey === 'string') {
      dbState.syncSettings.supabaseAnonKey = req.body.supabaseAnonKey.trim();
    }
    if (typeof req.body?.autoSyncSupabase === 'boolean') {
      dbState.syncSettings.autoSyncSupabase = req.body.autoSyncSupabase;
    }
    commitAndBroadcast();
    res.json({ syncSettings: dbState.syncSettings, state: dbState });
  });

  // Test Supabase connection & table readiness endpoint
  app.post('/api/supabase/test', async (req: Request, res: Response) => {
    const rawUrl = (typeof req.body?.supabaseUrl === 'string' ? req.body.supabaseUrl : dbState.syncSettings.supabaseUrl).trim();
    const rawKey = (typeof req.body?.supabaseAnonKey === 'string' ? req.body.supabaseAnonKey : dbState.syncSettings.supabaseAnonKey).trim();

    if (!rawUrl || !rawKey) {
      res.status(400).json({
        ok: false,
        error: 'URL Supabase dan Anon Key wajib diisi untuk menguji koneksi.',
      });
      return;
    }

    try {
      const cleanBase = rawUrl.replace(/\/+$/, '');
      const endpoint = `${cleanBase}/rest/v1/stageflow_state?select=id&limit=1`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: rawKey,
          Authorization: `Bearer ${rawKey}`,
        },
      });

      if (response.ok) {
        res.json({
          ok: true,
          message: 'Koneksi ke Supabase berhasil dan tabel "stageflow_state" siap digunakan!',
        });
      } else {
        const errorText = await response.text();
        res.status(response.status).json({
          ok: false,
          error: `Supabase merespons HTTP ${response.status}: ${errorText || 'Periksa apakah tabel stageflow_state sudah dibuat melalui SQL Editor.'}`,
        });
      }
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: `Gagal menghubungi Supabase: ${err instanceof Error ? err.message : 'Network error'}`,
      });
    }
  });

  const distPath = path.join(__dirname, 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StageFlow Outbound server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
