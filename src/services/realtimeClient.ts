import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
  addScannedItemsToStaging,
  createCleanDefaultState,
  finalizeStagingToOutbound,
  removeBangsalItemFromStaging,
  updateBangsalItemInStaging,
  validateStagingInput,
  type AppDatabaseState,
  type BangsalTag,
  type OutboundRecord,
  type StagingSession,
  type SyncSettings,
} from '../utils/outboundLogic';

const BROADCAST_CHANNEL_NAME = 'stageflow_outbound_realtime_v1';
const LOCAL_SETTINGS_KEY = 'stageflow_sync_settings_v1';

type StateListener = (state: AppDatabaseState, connected: boolean) => void;
type BackendTransportMode = 'detecting' | 'server' | 'supabase';

function loadLocalSyncSettings(): SyncSettings {
  const envUrl =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const envKey =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  const fallback: SyncSettings = {
    gsheetWebhookUrl: '',
    sheetName: 'Outbound_Log',
    supabaseUrl: envUrl,
    supabaseAnonKey: envKey,
    autoSyncSupabase: true,
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SyncSettings>;
    return {
      gsheetWebhookUrl: parsed.gsheetWebhookUrl ?? fallback.gsheetWebhookUrl,
      sheetName: parsed.sheetName || fallback.sheetName,
      supabaseUrl: parsed.supabaseUrl || fallback.supabaseUrl,
      supabaseAnonKey: parsed.supabaseAnonKey || fallback.supabaseAnonKey,
      autoSyncSupabase: parsed.autoSyncSupabase ?? fallback.autoSyncSupabase,
    };
  } catch {
    return fallback;
  }
}

function saveLocalSyncSettings(settings: SyncSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

class RealtimeOutboundClient {
  private listeners = new Set<StateListener>();
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private supabase: SupabaseClient | null = null;
  private supabaseChannel: RealtimeChannel | null = null;
  private currentState: AppDatabaseState | null = null;
  private isConnected = false;
  private transportMode: BackendTransportMode = 'detecting';
  private started = false;

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    if (this.currentState) {
      listener(this.currentState, this.isConnected);
    }
    this.ensureConnected();

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.teardown();
      }
    };
  }

  private notify(state: AppDatabaseState, connected: boolean): void {
    this.currentState = state;
    this.isConnected = connected;
    for (const listener of this.listeners) {
      listener(state, connected);
    }
  }

  private ensureConnected(): void {
    if (typeof window === 'undefined') return;

    if (!this.broadcastChannel && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (ev) => {
        if (ev.data && Array.isArray(ev.data.stagings)) {
          this.notify(ev.data as AppDatabaseState, this.isConnected);
        }
      };
    }

    if (!this.started) {
      this.started = true;
      void this.initializeTransport();
    }
  }

  private async initializeTransport(): Promise<void> {
    try {
      const res = await fetch('/api/state', { headers: { Accept: 'application/json' } });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as AppDatabaseState;
        this.transportMode = 'server';
        this.notify(data, true);
        this.connectServerSse();
        return;
      }
    } catch {
      // Fallback to direct Supabase mode when Node.js API is not present (e.g. static hosting)
    }

    this.transportMode = 'supabase';
    await this.connectDirectSupabase();
  }

  private connectServerSse(): void {
    if (this.eventSource || typeof window === 'undefined') return;
    const es = new EventSource('/api/stream');
    this.eventSource = es;

    es.onopen = () => {
      this.isConnected = true;
      if (this.currentState) {
        this.notify(this.currentState, true);
      }
    };

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as AppDatabaseState;
        this.notify(parsed, true);
      } catch {
        // Ignore malformed SSE frames
      }
    };

    es.onerror = () => {
      this.isConnected = false;
      if (this.currentState) {
        this.notify(this.currentState, false);
      }
    };
  }

  private getOrCreateSupabaseClient(settings: SyncSettings): SupabaseClient {
    if (this.supabase) return this.supabase;
    const url = settings.supabaseUrl || DEFAULT_SUPABASE_URL;
    const key = settings.supabaseAnonKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY;
    this.supabase = createClient(url, key, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return this.supabase;
  }

  private async connectDirectSupabase(): Promise<void> {
    const localSettings = loadLocalSyncSettings();
    const client = this.getOrCreateSupabaseClient(localSettings);

    try {
      const { data, error } = await client
        .from('stageflow_state')
        .select('id, stagings, outbound_history, last_updated')
        .eq('id', 'current')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data && Array.isArray(data.stagings) && data.stagings.length > 0) {
        const loaded: AppDatabaseState = {
          stagings: data.stagings as StagingSession[],
          outboundHistory: Array.isArray(data.outbound_history)
            ? (data.outbound_history as OutboundRecord[])
            : [],
          syncSettings: localSettings,
          lastUpdated: (data.last_updated as string) || new Date().toISOString(),
        };
        this.notify(loaded, true);
      } else {
        const clean = createCleanDefaultState();
        clean.syncSettings = localSettings;
        await this.persistDirectSupabase(clean);
        this.notify(clean, true);
      }
    } catch {
      const fallback = createCleanDefaultState();
      fallback.syncSettings = localSettings;
      this.notify(fallback, false);
    }

    if (this.supabaseChannel) {
      void client.removeChannel(this.supabaseChannel);
      this.supabaseChannel = null;
    }

    this.supabaseChannel = client
      .channel('stageflow_state_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stageflow_state',
          filter: 'id=eq.current',
        },
        (payload) => {
          const row = payload.new as {
            stagings?: StagingSession[];
            outbound_history?: OutboundRecord[];
            last_updated?: string;
          } | null;
          if (!row || !Array.isArray(row.stagings)) return;

          const currentSettings = this.currentState?.syncSettings ?? loadLocalSyncSettings();
          const nextState: AppDatabaseState = {
            stagings: row.stagings,
            outboundHistory: Array.isArray(row.outbound_history) ? row.outbound_history : [],
            syncSettings: currentSettings,
            lastUpdated: row.last_updated || new Date().toISOString(),
          };
          this.notify(nextState, true);
        }
      )
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        if (this.currentState) {
          this.notify(this.currentState, connected);
        }
      });
  }

  private async persistDirectSupabase(nextState: AppDatabaseState): Promise<AppDatabaseState> {
    const stamped: AppDatabaseState = {
      ...nextState,
      lastUpdated: new Date().toISOString(),
    };
    this.broadcastLocal(stamped);

    if (stamped.syncSettings.autoSyncSupabase) {
      const client = this.getOrCreateSupabaseClient(stamped.syncSettings);
      const { error } = await client.from('stageflow_state').upsert(
        {
          id: 'current',
          stagings: stamped.stagings,
          outbound_history: stamped.outboundHistory,
          last_updated: stamped.lastUpdated,
        },
        { onConflict: 'id' }
      );
      if (error) {
        throw new Error(`Gagal menyimpan ke Supabase: ${error.message}`);
      }
    }
    return stamped;
  }

  private teardown(): void {
    this.started = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.supabase && this.supabaseChannel) {
      void this.supabase.removeChannel(this.supabaseChannel);
      this.supabaseChannel = null;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
  }

  private broadcastLocal(state: AppDatabaseState): void {
    this.notify(state, this.isConnected);
    this.broadcastChannel?.postMessage(state);
  }

  public async fetchSnapshot(): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase') {
      await this.connectDirectSupabase();
      return this.currentState ?? createCleanDefaultState();
    }
    const res = await fetch('/api/state');
    if (!res.ok) {
      throw new Error('Gagal memuat data realtime.');
    }
    const data = (await res.json()) as AppDatabaseState;
    this.notify(data, true);
    return data;
  }

  public async createStaging(
    name: string,
    destination: string
  ): Promise<{ staging: StagingSession; state: AppDatabaseState }> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const check = validateStagingInput(name, this.currentState.stagings);
      if (!check.valid) {
        throw new Error(check.error || 'Nama staging tidak valid.');
      }
      const now = new Date().toISOString();
      const newStaging: StagingSession = {
        id: `stg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: check.normalizedName,
        destination: destination.trim() || 'Area Outbound Manual',
        isManual: true,
        createdAt: now,
        updatedAt: now,
        items: [],
      };
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: [newStaging, ...this.currentState.stagings],
      };
      const saved = await this.persistDirectSupabase(nextState);
      return { staging: newStaging, state: saved };
    }

    const res = await fetch('/api/stagings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, destination }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menambah staging baru.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload;
  }

  public async deleteStaging(stagingId: string): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase' && this.currentState) {
      if (this.currentState.stagings.length <= 1) {
        throw new Error('Minimal 1 staging harus tetap tersedia.');
      }
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: this.currentState.stagings.filter((s) => s.id !== stagingId),
      };
      return await this.persistDirectSupabase(nextState);
    }

    const res = await fetch(`/api/stagings/${encodeURIComponent(stagingId)}`, {
      method: 'DELETE',
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menghapus staging.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload.state;
  }

  public async scanBangsalItems(
    stagingId: string,
    codes: string[],
    qtyBagseal: number,
    tag: BangsalTag
  ): Promise<{ addedCount: number; mergedCount: number; state: AppDatabaseState }> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const target = this.currentState.stagings.find((s) => s.id === stagingId);
      if (!target) throw new Error('Staging tidak ditemukan.');
      const res = addScannedItemsToStaging(target, codes, qtyBagseal, tag);
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: this.currentState.stagings.map((s) =>
          s.id === stagingId ? res.updatedStaging : s
        ),
      };
      const saved = await this.persistDirectSupabase(nextState);
      return { addedCount: res.addedCount, mergedCount: res.mergedCount, state: saved };
    }

    const res = await fetch(`/api/stagings/${encodeURIComponent(stagingId)}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codes, qtyBagseal, tag }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menyimpan hasil scan bangsal.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload;
  }

  public async updateBangsalItem(
    stagingId: string,
    itemId: string,
    patch: { qtyBagseal?: number; tag?: BangsalTag }
  ): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: this.currentState.stagings.map((s) =>
          s.id === stagingId ? updateBangsalItemInStaging(s, itemId, patch) : s
        ),
      };
      return await this.persistDirectSupabase(nextState);
    }

    const res = await fetch(
      `/api/stagings/${encodeURIComponent(stagingId)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }
    );
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal memperbarui data bangsal.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload.state;
  }

  public async removeBangsalItem(stagingId: string, itemId: string): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: this.currentState.stagings.map((s) =>
          s.id === stagingId ? removeBangsalItemFromStaging(s, itemId) : s
        ),
      };
      return await this.persistDirectSupabase(nextState);
    }

    const res = await fetch(
      `/api/stagings/${encodeURIComponent(stagingId)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'DELETE',
      }
    );
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menghapus item bangsal.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload.state;
  }

  public async finalizeStaging(
    stagingId: string
  ): Promise<{ record: OutboundRecord; state: AppDatabaseState }> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const target = this.currentState.stagings.find((s) => s.id === stagingId);
      if (!target) throw new Error('Staging tidak ditemukan.');
      const { resetStaging, outboundRecord } = finalizeStagingToOutbound(target);
      const nextState: AppDatabaseState = {
        ...this.currentState,
        stagings: this.currentState.stagings.map((s) =>
          s.id === stagingId ? resetStaging : s
        ),
        outboundHistory: [outboundRecord, ...this.currentState.outboundHistory],
      };
      const saved = await this.persistDirectSupabase(nextState);
      return { record: outboundRecord, state: saved };
    }

    const res = await fetch(`/api/stagings/${encodeURIComponent(stagingId)}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal memindahkan staging ke riwayat outbound.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload;
  }

  public async syncOutboundToGSheet(
    recordIds: string[],
    webhookUrl?: string
  ): Promise<{
    syncedBatches: number;
    syncedRows: number;
    syncedAt: string;
    deliveryMode: string;
    state: AppDatabaseState;
  }> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const targets =
        recordIds.length > 0
          ? this.currentState.outboundHistory.filter((r) => recordIds.includes(r.id))
          : this.currentState.outboundHistory.filter((r) => r.syncStatus === 'pending');

      if (targets.length === 0) {
        throw new Error('Tidak ada data riwayat outbound yang dipilih untuk disinkronkan.');
      }

      const sheetName = this.currentState.syncSettings.sheetName || 'Outbound_Log';
      const activeWebhook = (webhookUrl || this.currentState.syncSettings.gsheetWebhookUrl || '').trim();
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
      if (activeWebhook) {
        try {
          await fetch(activeWebhook, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              sheetName,
              syncedAt: new Date().toISOString(),
              rows,
            }),
          });
          deliveryMode = `Webhook Google Sheets (${sheetName})`;
        } catch (err) {
          throw new Error(
            `Gagal mengirim ke Google Apps Script: ${err instanceof Error ? err.message : 'Network error'}`
          );
        }
      }

      const syncedAt = new Date().toISOString();
      const targetIdSet = new Set(targets.map((t) => t.id));
      const nextHistory: OutboundRecord[] = this.currentState.outboundHistory.map((rec) =>
        targetIdSet.has(rec.id)
          ? {
              ...rec,
              syncStatus: 'synced',
              syncedAt,
              syncTarget: deliveryMode,
            }
          : rec
      );

      const saved = await this.persistDirectSupabase({
        ...this.currentState,
        outboundHistory: nextHistory,
      });

      return {
        syncedBatches: targets.length,
        syncedRows: rows.length,
        syncedAt,
        deliveryMode,
        state: saved,
      };
    }

    const res = await fetch('/api/outbound/sync-gsheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordIds, webhookUrl }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal sinkronisasi ke Google Sheets.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload;
  }

  public async deleteOutboundRecord(recordId: string): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const nextState: AppDatabaseState = {
        ...this.currentState,
        outboundHistory: this.currentState.outboundHistory.filter((r) => r.id !== recordId),
      };
      return await this.persistDirectSupabase(nextState);
    }

    const res = await fetch(`/api/outbound/${encodeURIComponent(recordId)}`, {
      method: 'DELETE',
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menghapus riwayat outbound.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload.state;
  }

  public async saveSyncSettings(settings: Partial<SyncSettings>): Promise<AppDatabaseState> {
    if (this.transportMode === 'supabase' && this.currentState) {
      const nextSettings: SyncSettings = {
        ...this.currentState.syncSettings,
        ...settings,
      };
      saveLocalSyncSettings(nextSettings);
      this.supabase = null;
      const nextState: AppDatabaseState = {
        ...this.currentState,
        syncSettings: nextSettings,
      };
      const saved = await this.persistDirectSupabase(nextState);
      await this.connectDirectSupabase();
      return saved;
    }

    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal menyimpan pengaturan integrasi.');
    }
    this.broadcastLocal(payload.state as AppDatabaseState);
    return payload.state;
  }

  public async testSupabaseConnection(
    supabaseUrl?: string,
    supabaseAnonKey?: string
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    if (this.transportMode === 'supabase') {
      const url = (supabaseUrl || this.currentState?.syncSettings.supabaseUrl || DEFAULT_SUPABASE_URL).trim();
      const key = (supabaseAnonKey || this.currentState?.syncSettings.supabaseAnonKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();
      const cleanBase = url.replace(/\/+$/, '');
      const res = await fetch(`${cleanBase}/rest/v1/stageflow_state?select=id&limit=1`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });
      if (!res.ok) {
        throw new Error(`Supabase merespons HTTP ${res.status}. Pastikan tabel stageflow_state tersedia.`);
      }
      return {
        ok: true,
        message: 'Koneksi langsung ke Supabase berhasil dan tabel "stageflow_state" siap digunakan!',
      };
    }

    const res = await fetch('/api/supabase/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseUrl, supabaseAnonKey }),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Gagal terhubung ke Supabase.');
    }
    return payload;
  }
}

export const realtimeClient = new RealtimeOutboundClient();
