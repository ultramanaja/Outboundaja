import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { realtimeClient } from './services/realtimeClient';
import type {
  AppDatabaseState,
  BangsalItem,
  BangsalTag,
  SyncSettings,
} from './utils/outboundLogic';
import { ActiveStagingWorkspace } from './components/ActiveStagingWorkspace';
import { OutboundHistoryView } from './components/OutboundHistoryView';
import { StagingDirectoryView } from './components/StagingDirectoryView';
import { SyncSettingsView } from './components/SyncSettingsView';
import { ManualStagingModal } from './components/ManualStagingModal';
import { BarcodeRescanModal } from './components/BarcodeRescanModal';
import { CameraScannerModal } from './components/CameraScannerModal';

type ActiveTab = 'staging' | 'history' | 'directory' | 'settings';

export function App() {
  const [dbState, setDbState] = useState<AppDatabaseState | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('staging');
  const [selectedStagingId, setSelectedStagingId] = useState<string>('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);

  // Camera Scanner Modal state
  const [cameraModal, setCameraModal] = useState<{
    open: boolean;
    tag: BangsalTag;
    qty: number;
  }>({ open: false, tag: 'Reg', qty: 1 });

  // Cross-Device Barcode Rescan Modal state
  const [rescanModal, setRescanModal] = useState<{
    open: boolean;
    items: BangsalItem[];
    index: number;
    stagingName: string;
    destination: string;
  }>({
    open: false,
    items: [],
    index: 0,
    stagingName: '',
    destination: '',
  });

  const showNotice = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setNotice({ text, tone });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const unsubscribe = realtimeClient.subscribe((nextState, connected) => {
      setDbState(nextState);
      setRealtimeConnected(connected);
      setSelectedStagingId((prev) => {
        if (prev && nextState.stagings.some((s) => s.id === prev)) {
          return prev;
        }
        return nextState.stagings[0]?.id ?? '';
      });
    });
    return unsubscribe;
  }, []);

  const activeStaging =
    dbState?.stagings.find((s) => s.id === selectedStagingId) ?? dbState?.stagings[0] ?? null;

  const handleCreateStaging = async (name: string, destination: string) => {
    const { staging } = await realtimeClient.createStaging(name, destination);
    setSelectedStagingId(staging.id);
    setActiveTab('staging');
    showNotice(`Staging "${staging.name}" berhasil ditambahkan dan siap discan.`);
  };

  const handleDeleteStaging = async (id: string) => {
    try {
      await realtimeClient.deleteStaging(id);
      showNotice('Staging berhasil dihapus.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal menghapus staging.', 'error');
    }
  };

  const handleScanItems = async (codes: string[], qtyBagseal: number, tag: BangsalTag) => {
    if (!activeStaging) return;
    const res = await realtimeClient.scanBangsalItems(
      activeStaging.id,
      codes,
      qtyBagseal,
      tag
    );
    const totalProcessed = res.addedCount + res.mergedCount;
    showNotice(
      `Berhasil memproses ${totalProcessed} bangsal ke ${activeStaging.name} (Tag: ${tag}).`
    );
  };

  const handleUpdateItem = async (
    itemId: string,
    patch: { qtyBagseal?: number; tag?: BangsalTag }
  ) => {
    if (!activeStaging) return;
    try {
      await realtimeClient.updateBangsalItem(activeStaging.id, itemId, patch);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal memperbarui bangsal.', 'error');
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!activeStaging) return;
    try {
      await realtimeClient.removeBangsalItem(activeStaging.id, itemId);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal menghapus bangsal.', 'error');
    }
  };

  const handleFinalizeStaging = async () => {
    if (!activeStaging) return;
    const { record } = await realtimeClient.finalizeStaging(activeStaging.id);
    setActiveTab('history');
    showNotice(
      `Staging "${record.stagingName}" selesai (${record.totalBangsal} bangsal, ${record.totalBagseal} bagseal) dan dipindahkan ke Riwayat Outbound.`
    );
  };

  const handleSyncRecords = async (recordIds: string[]) => {
    try {
      const res = await realtimeClient.syncOutboundToGSheet(recordIds);
      showNotice(
        `Sinkronisasi berhasil: ${res.syncedBatches} batch (${res.syncedRows} baris bangsal) dikirim ke ${res.deliveryMode}.`
      );
    } catch (err) {
      showNotice(
        err instanceof Error ? err.message : 'Gagal sinkronisasi ke Google Sheets.',
        'error'
      );
    }
  };

  const handleDeleteOutbound = async (recordId: string) => {
    try {
      await realtimeClient.deleteOutboundRecord(recordId);
      showNotice(`Riwayat outbound ${recordId} dihapus.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal menghapus riwayat.', 'error');
    }
  };

  const handleSaveSettings = async (next: Partial<SyncSettings>) => {
    try {
      await realtimeClient.saveSyncSettings(next);
      showNotice('Pengaturan database Supabase dan Google Sheets berhasil disimpan.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.', 'error');
    }
  };

  const handleTestSupabase = async (url: string, anonKey: string) => {
    return await realtimeClient.testSupabaseConnection(url, anonKey);
  };

  const pendingHistoryCount =
    dbState?.outboundHistory.filter((r) => r.syncStatus === 'pending').length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#staging"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('staging');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            StageFlow Outbound
          </a>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#staging"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('staging');
              }}
              aria-current={activeTab === 'staging' ? 'page' : undefined}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'staging'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Proses Staging
            </a>
            <a
              href="#riwayat"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('history');
              }}
              aria-current={activeTab === 'history' ? 'page' : undefined}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'history'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Riwayat Outbound{pendingHistoryCount > 0 ? ` (${pendingHistoryCount})` : ''}
            </a>
            <a
              href="#daftar-staging"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('directory');
              }}
              aria-current={activeTab === 'directory' ? 'page' : undefined}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'directory'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Daftar Staging
            </a>
            <a
              href="#integrasi"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('settings');
              }}
              aria-current={activeTab === 'settings' ? 'page' : undefined}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              Integrasi Sync
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Staging Baru
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Tabs (visible only below md) */}
      <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 grid grid-cols-4 gap-1">
        {(
          [
            { id: 'staging', label: 'Staging' },
            {
              id: 'history',
              label:
                pendingHistoryCount > 0
                  ? `Riwayat (${pendingHistoryCount})`
                  : 'Riwayat',
            },
            { id: 'directory', label: 'Jalur' },
            { id: 'settings', label: 'Integrasi' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-1.5 text-xs font-medium rounded-md text-center transition-colors whitespace-nowrap truncate ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {notice && (
          <div
            role="status"
            className={`mb-5 px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-4 ${
              notice.tone === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs underline hover:opacity-80 whitespace-nowrap shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {!dbState ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
            <div className="h-5 w-56 bg-slate-200 rounded animate-pulse" />
            <div className="h-12 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-40 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        ) : activeTab === 'staging' ? (
          <ActiveStagingWorkspace
            stagings={dbState.stagings}
            selectedStagingId={selectedStagingId}
            onSelectStagingId={setSelectedStagingId}
            onOpenManualStagingModal={() => setIsManualModalOpen(true)}
            onOpenCameraScanner={(tag, qty) =>
              setCameraModal({ open: true, tag, qty })
            }
            onScanItems={handleScanItems}
            onUpdateItem={handleUpdateItem}
            onRemoveItem={handleRemoveItem}
            onFinalizeStaging={handleFinalizeStaging}
            onOpenRescanModal={(items, startIndex, stagingName, destination) =>
              setRescanModal({
                open: true,
                items,
                index: startIndex,
                stagingName,
                destination,
              })
            }
          />
        ) : activeTab === 'history' ? (
          <OutboundHistoryView
            records={dbState.outboundHistory}
            onSyncRecords={handleSyncRecords}
            onDeleteRecord={handleDeleteOutbound}
            onOpenRescanModal={(items, startIndex, stagingName, destination) =>
              setRescanModal({
                open: true,
                items,
                index: startIndex,
                stagingName,
                destination,
              })
            }
            onNavigateToStaging={() => setActiveTab('staging')}
            onShowNotice={(msg) => showNotice(msg, 'success')}
          />
        ) : activeTab === 'directory' ? (
          <StagingDirectoryView
            stagings={dbState.stagings}
            onCreateStaging={handleCreateStaging}
            onDeleteStaging={handleDeleteStaging}
            onOpenStagingForScan={(id) => {
              setSelectedStagingId(id);
              setActiveTab('staging');
            }}
          />
        ) : (
          <SyncSettingsView
            settings={dbState.syncSettings}
            realtimeConnected={realtimeConnected}
            lastUpdated={dbState.lastUpdated}
            onSaveSettings={handleSaveSettings}
            onTestSupabase={handleTestSupabase}
          />
        )}
      </main>

      {/* Modals */}
      <ManualStagingModal
        isOpen={isManualModalOpen}
        existingStagings={dbState?.stagings ?? []}
        onClose={() => setIsManualModalOpen(false)}
        onCreate={handleCreateStaging}
      />

      <BarcodeRescanModal
        isOpen={rescanModal.open}
        stagingName={rescanModal.stagingName}
        destination={rescanModal.destination}
        items={rescanModal.items}
        activeIndex={rescanModal.index}
        onChangeIndex={(nextIdx) =>
          setRescanModal((prev) => ({ ...prev, index: nextIdx }))
        }
        onClose={() => setRescanModal((prev) => ({ ...prev, open: false }))}
      />

      <CameraScannerModal
        isOpen={cameraModal.open}
        stagingName={activeStaging?.name ?? 'Staging'}
        defaultTag={cameraModal.tag}
        defaultQty={cameraModal.qty}
        onClose={() => setCameraModal((prev) => ({ ...prev, open: false }))}
        onDetectedCode={async (code, qty, tag) => {
          await handleScanItems([code], qty, tag);
        }}
      />
    </div>
  );
}

export default App;
