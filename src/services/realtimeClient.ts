import type {
  AppDatabaseState,
  BangsalTag,
  OutboundRecord,
  StagingSession,
  SyncSettings,
} from '../utils/outboundLogic';

const BROADCAST_CHANNEL_NAME = 'stageflow_outbound_realtime_v1';

type StateListener = (state: AppDatabaseState, connected: boolean) => void;

class RealtimeOutboundClient {
  private listeners = new Set<StateListener>();
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private currentState: AppDatabaseState | null = null;
  private isConnected = false;

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

    if (!this.eventSource) {
      void this.fetchSnapshot();

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
  }

  private teardown(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
