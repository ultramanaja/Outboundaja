import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  CloudUpload,
  Download,
  Maximize2,
  Search,
  Trash2,
} from 'lucide-react';
import {
  BANGSAL_TAGS,
  buildGoogleSheetsTsv,
  buildOutboundCsv,
  calculateStagingTotals,
  filterOutboundRecords,
  type BangsalItem,
  type BangsalTag,
  type OutboundRecord,
  type SyncStatus,
} from '../utils/outboundLogic';
import { Barcode128Svg } from './Barcode128Svg';

interface OutboundHistoryViewProps {
  records: OutboundRecord[];
  onSyncRecords: (recordIds: string[]) => Promise<void>;
  onDeleteRecord: (recordId: string) => Promise<void>;
  onOpenRescanModal: (
    items: BangsalItem[],
    startIndex: number,
    stagingName: string,
    destination: string
  ) => void;
  onNavigateToStaging: () => void;
  onShowNotice: (message: string) => void;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const OutboundHistoryView: React.FC<OutboundHistoryViewProps> = ({
  records,
  onSyncRecords,
  onDeleteRecord,
  onOpenRescanModal,
  onNavigateToStaging,
  onShowNotice,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<BangsalTag | 'ALL'>('ALL');
  const [syncFilter, setSyncFilter] = useState<'ALL' | SyncStatus>('ALL');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const first = records[0]?.id;
    return first ? { [first]: true } : {};
  });
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const filteredRecords = useMemo(
    () => filterOutboundRecords(records, searchQuery, tagFilter, syncFilter),
    [records, searchQuery, tagFilter, syncFilter]
  );

  const summary = useMemo(() => {
    let totalBangsal = 0;
    let totalBagseal = 0;
    let pendingBatches = 0;
    for (const rec of records) {
      totalBangsal += rec.totalBangsal;
      totalBagseal += rec.totalBagseal;
      if (rec.syncStatus === 'pending') pendingBatches += 1;
    }
    return {
      totalBatches: records.length,
      totalBangsal,
      totalBagseal,
      pendingBatches,
    };
  }, [records]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDownloadCsv = (targetRecords: OutboundRecord[], filenamePrefix: string) => {
    if (targetRecords.length === 0) return;
    const csvContent = '\uFEFF' + buildOutboundCsv(targetRecords);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowNotice(`Berhasil mengunduh CSV (${targetRecords.length} staging outbound).`);
  };

  const handleCopyForGoogleSheets = async (targetRecords: OutboundRecord[]) => {
    if (targetRecords.length === 0) return;
    const tsv = buildGoogleSheetsTsv(targetRecords);
    try {
      await navigator.clipboard.writeText(tsv);
      onShowNotice('Data riwayat disalin (format tabel). Tempel langsung (Ctrl+V) di Google Sheets.');
    } catch {
      onShowNotice('Gagal menyalin otomatis. Gunakan tombol Download CSV atau Sync Google Sheets.');
    }
  };

  const handleSyncBatch = async (recordIds: string[], keyName: string) => {
    if (recordIds.length === 0) return;
    setSyncingKey(keyName);
    try {
      await onSyncRecords(recordIds);
    } finally {
      setSyncingKey(null);
    }
  };

  const pendingFilteredIds = filteredRecords
    .filter((r) => r.syncStatus === 'pending')
    .map((r) => r.id);

  const syncAllTargetIds =
    pendingFilteredIds.length > 0 ? pendingFilteredIds : filteredRecords.map((r) => r.id);

  return (
    <div className="space-y-6">
      {/* Flat KPI Strip */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-2 lg:grid-cols-4">
        <div className="p-5 flex flex-col justify-between border-b border-r border-slate-200 lg:border-b-0">
          <div className="text-xs text-slate-500">Batch Riwayat Outbound</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-2">
            {summary.totalBatches}
          </div>
        </div>
        <div className="p-5 flex flex-col justify-between border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="text-xs text-slate-500">Total Bangsal Selesai</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-2">
            {summary.totalBangsal}
          </div>
        </div>
        <div className="p-5 flex flex-col justify-between border-r border-slate-200">
          <div className="text-xs text-slate-500">Total Qty Bagseal</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-2">
            {summary.totalBagseal}
          </div>
        </div>
        <div className="p-5 flex flex-col justify-between">
          <div className="text-xs text-slate-500">Menunggu Sync Google Sheets</div>
          <div className="text-2xl font-semibold text-amber-700 tabular-nums mt-2">
            {summary.pendingBatches}
          </div>
        </div>
      </section>

      {/* Main Outbound History Table & Sync Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold text-slate-900">
              Riwayat Outbound — Sinkronisasi Google Sheets &amp; Ekspor CSV
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hanya staging yang telah dijadikan outbound yang muncul di sini untuk disinkronkan ke Google Sheets atau diunduh sebagai CSV.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={filteredRecords.length === 0}
              onClick={() => void handleCopyForGoogleSheets(filteredRecords)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
              Salin Tabel GSheet
            </button>

            <button
              type="button"
              disabled={filteredRecords.length === 0}
              onClick={() => handleDownloadCsv(filteredRecords, 'outbound-riwayat')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV ({filteredRecords.length})
            </button>

            <button
              type="button"
              disabled={syncAllTargetIds.length === 0 || syncingKey !== null}
              onClick={() => void handleSyncBatch(syncAllTargetIds, 'ALL')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <CloudUpload className="w-4 h-4" />
              <span>
                {syncingKey === 'ALL'
                  ? 'Menyinkronkan...'
                  : pendingFilteredIds.length > 0
                  ? `Sync Google Sheets (${pendingFilteredIds.length} Baru)`
                  : 'Sync Ulang ke Google Sheets'}
              </span>
            </button>
          </div>
        </div>

        {/* Search & Interactive Filter Controls */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50/60 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <label htmlFor="history-search-input" className="sr-only">
              Cari staging atau kode bangsal
            </label>
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="history-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama staging, ID outbound, atau kode bangsal..."
              className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tag Filter */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
              <button
                type="button"
                onClick={() => setTagFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  tagFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Tag
              </button>
              {BANGSAL_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(tag)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    tagFilter === tag
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Sync Status Filter */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'Semua Status' },
                  { id: 'pending', label: 'Belum Sync' },
                  { id: 'synced', label: 'Tersinkronisasi' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSyncFilter(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    syncFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Outbound Records List */}
        {records.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-800">Belum ada riwayat outbound</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Selesaikan proses scan bangsal di menu Proses Staging lalu klik &ldquo;Jadikan Outbound&rdquo; untuk memindahkan hasilnya ke sini.
            </p>
            <button
              type="button"
              onClick={onNavigateToStaging}
              className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Ke Proses Staging
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-800">
              Tidak ada riwayat outbound yang cocok dengan filter
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTagFilter('ALL');
                setSyncFilter('ALL');
              }}
              className="mt-3 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              Reset Filter
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRecords.map((rec) => {
              const isExpanded = Boolean(expandedIds[rec.id]);
              const tagBreakdown = calculateStagingTotals(rec.items).tagCounts;

              return (
                <div key={rec.id} className="bg-white">
                  <div className="p-5 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(rec.id)}
                        aria-expanded={isExpanded}
                        aria-label={`Tampilkan rincian bangsal untuk ${rec.stagingName} (${rec.id})`}
                        className="mt-0.5 p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <div>
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">
                            {rec.stagingName}
                          </h3>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="text-xs font-mono text-slate-500">{rec.id}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span
                            className={`text-xs font-medium ${
                              rec.syncStatus === 'synced' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {rec.syncStatus === 'synced' ? 'Tersinkronisasi ke Google' : 'Belum Sync'}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{rec.destination}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">Selesai {formatDateTime(rec.completedAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums font-medium text-slate-700">
                            {rec.totalBangsal} Bangsal / {rec.totalBagseal} Qty Bagseal
                          </span>
                          {BANGSAL_TAGS.map((t) =>
                            tagBreakdown[t] > 0 ? (
                              <React.Fragment key={t}>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {t} ({tagBreakdown[t]})
                                </span>
                              </React.Fragment>
                            ) : null
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-9 lg:pl-0">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenRescanModal(rec.items, 0, rec.stagingName, rec.destination)
                        }
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
                      >
                        Scan Ulang ({rec.items.length})
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadCsv([rec], `outbound-${rec.stagingName}`)}
                        aria-label={`Download CSV ${rec.stagingName}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CSV
                      </button>

                      <button
                        type="button"
                        disabled={syncingKey !== null}
                        onClick={() => void handleSyncBatch([rec.id], rec.id)}
                        aria-label={`Sync ${rec.stagingName} ke Google Sheets`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          rec.syncStatus === 'synced'
                            ? 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                            : 'text-white bg-slate-900 hover:bg-slate-800'
                        }`}
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        {syncingKey === rec.id
                          ? 'Sync...'
                          : rec.syncStatus === 'synced'
                          ? 'Sync Ulang'
                          : 'Sync GSheet'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void onDeleteRecord(rec.id)}
                        aria-label={`Hapus riwayat ${rec.id}`}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Bangsal Items & Barcodes */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/40 overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                            <th className="py-2.5 pl-12 pr-3 w-16">#</th>
                            <th className="py-2.5 px-3">Kode Bangsal</th>
                            <th className="py-2.5 px-3">Tag</th>
                            <th className="py-2.5 px-3 text-right w-32">Qty Bagseal</th>
                            <th className="py-2.5 pl-6 pr-6">Gambar Barcode (Scan Ulang Device Lain)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 text-sm">
                          {rec.items.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-white transition-colors">
                              <td className="py-2.5 pl-12 pr-3 text-xs font-mono text-slate-400 tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                                {item.bangsalCode}
                              </td>
                              <td className="py-2.5 px-3 text-xs font-semibold text-slate-700">
                                {item.tag}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                                {item.qtyBagseal}
                              </td>
                              <td className="py-2.5 pl-6 pr-6">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onOpenRescanModal(
                                      rec.items,
                                      idx,
                                      rec.stagingName,
                                      rec.destination
                                    )
                                  }
                                  aria-label={`Perbesar barcode ${item.bangsalCode}`}
                                  className="group inline-flex items-center gap-2.5 text-left"
                                >
                                  <Barcode128Svg
                                    value={item.bangsalCode}
                                    barHeight={26}
                                    showLabel={false}
                                    className="w-36 h-8 border border-slate-200 rounded px-1"
                                  />
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 group-hover:underline whitespace-nowrap shrink-0">
                                    <Maximize2 className="w-3.5 h-3.5" />
                                    Perbesar Barcode
                                  </span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
