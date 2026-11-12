import React, { useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Maximize2, Minus, Plus, ScanBarcode, Trash2 } from 'lucide-react';
import {
  BANGSAL_TAGS,
  DEFAULT_BANGSAL_TAG,
  calculateStagingTotals,
  parseMultiScanInput,
  type BangsalItem,
  type BangsalTag,
  type StagingSession,
} from '../utils/outboundLogic';
import { Barcode128Svg } from './Barcode128Svg';

interface ActiveStagingWorkspaceProps {
  stagings: StagingSession[];
  selectedStagingId: string;
  onSelectStagingId: (id: string) => void;
  onOpenManualStagingModal: () => void;
  onOpenCameraScanner: (tag: BangsalTag, qty: number) => void;
  onScanItems: (codes: string[], qtyBagseal: number, tag: BangsalTag) => Promise<void>;
  onUpdateItem: (itemId: string, patch: { qtyBagseal?: number; tag?: BangsalTag }) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onFinalizeStaging: () => Promise<void>;
  onOpenRescanModal: (items: BangsalItem[], startIndex: number, stagingName: string, destination: string) => void;
}

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const ActiveStagingWorkspace: React.FC<ActiveStagingWorkspaceProps> = ({
  stagings,
  selectedStagingId,
  onSelectStagingId,
  onOpenManualStagingModal,
  onOpenCameraScanner,
  onScanItems,
  onUpdateItem,
  onRemoveItem,
  onFinalizeStaging,
  onOpenRescanModal,
}) => {
  const activeStaging =
    stagings.find((s) => s.id === selectedStagingId) ?? stagings[0] ?? null;

  const [scanMode, setScanMode] = useState<'single' | 'batch'>('single');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [qtyInput, setQtyInput] = useState<number>(1);
  const [selectedTag, setSelectedTag] = useState<BangsalTag>(DEFAULT_BANGSAL_TAG);
  const [scanError, setScanError] = useState<string | null>(null);
  const [busyScan, setBusyScan] = useState(false);
  const [busyFinalize, setBusyFinalize] = useState(false);

  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLTextAreaElement | null>(null);

  const totals = useMemo(
    () => calculateStagingTotals(activeStaging ? activeStaging.items : []),
    [activeStaging]
  );

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStaging) return;

    const codes = parseMultiScanInput(barcodeInput);
    if (codes.length === 0) {
      setScanError('Masukkan atau scan minimal 1 kode barcode bangsal.');
      return;
    }

    setBusyScan(true);
    setScanError(null);
    try {
      await onScanItems(codes, Math.max(1, qtyInput), selectedTag);
      setBarcodeInput('');
      setQtyInput(1);
      if (scanMode === 'single') {
        singleInputRef.current?.focus();
      } else {
        batchInputRef.current?.focus();
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal memproses scan barcode.');
    } finally {
      setBusyScan(false);
    }
  };

  const handleFinalize = async () => {
    if (!activeStaging || activeStaging.items.length === 0) return;
    setBusyFinalize(true);
    setScanError(null);
    try {
      await onFinalizeStaging();
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Gagal menyelesaikan staging.');
    } finally {
      setBusyFinalize(false);
    }
  };

  if (!activeStaging) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">Belum Ada Staging Aktif</h2>
        <p className="text-sm text-slate-600 mt-1">
          Tambahkan jalur staging terlebih dahulu untuk mulai scan bangsal outbound.
        </p>
        <button
          type="button"
          onClick={onOpenManualStagingModal}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          + Tambah Staging Manual
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Unified Staging & Multi-Item Scanner Surface (Single-elevation, no nested cards) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Top Staging Selection Bar */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <label
              htmlFor="active-staging-select"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Pilih Nama Staging Aktif
            </label>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
              <select
                id="active-staging-select"
                value={activeStaging.id}
                onChange={(e) => onSelectStagingId(e.target.value)}
                className="w-full sm:w-96 lg:w-[26rem] px-3.5 py-2.5 text-sm font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              >
                {stagings.map((stg) => (
                  <option key={stg.id} value={stg.id}>
                    {stg.destination && stg.destination !== 'Staging Default'
                      ? `${stg.name} — ${stg.destination}`
                      : stg.name}{' '}
                    ({stg.items.length} bangsal)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onOpenManualStagingModal}
                className="px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                + Tambah Manual
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-medium text-slate-900">{activeStaging.destination}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-900">{totals.totalBangsal}</strong> Bangsal
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              <strong className="font-semibold text-slate-900">{totals.totalBagseal}</strong> Qty Bagseal
            </span>
          </div>
        </div>

        {/* Multi-Item Barcode Scan Form */}
        <form onSubmit={handleScanSubmit} className="p-5 sm:p-6 bg-slate-50/60 border-b border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Scan Barcode Bangsal ke {activeStaging.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tag otomatis <strong className="font-medium text-slate-700">Reg</strong> agar proses scan beruntun tetap berjalan tanpa jeda.
              </p>
            </div>

            {/* Interactive Scan Mode Segmented Control */}
            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setScanMode('single')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  scanMode === 'single'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Scan Cepat
              </button>
              <button
                type="button"
                onClick={() => setScanMode('batch')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  scanMode === 'batch'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Multi-Item Sekaligus
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Barcode Input Field */}
            <div className="lg:col-span-5">
              <label
                htmlFor="bangsal-barcode-input"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                {scanMode === 'single'
                  ? 'Kode Barcode Bangsal'
                  : 'Daftar Barcode Bangsal (pisahkan baris atau koma)'}
              </label>
              {scanMode === 'single' ? (
                <input
                  ref={singleInputRef}
                  id="bangsal-barcode-input"
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => {
                    setBarcodeInput(e.target.value);
                    if (scanError) setScanError(null);
                  }}
                  placeholder="Scan atau ketik kode bangsal (contoh: BGS-001)"
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              ) : (
                <textarea
                  ref={batchInputRef}
                  id="bangsal-barcode-input"
                  rows={3}
                  value={barcodeInput}
                  onChange={(e) => {
                    setBarcodeInput(e.target.value);
                    if (scanError) setScanError(null);
                  }}
                  placeholder={'BGS-001\nBGS-002\nBGS-003'}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                />
              )}
            </div>

            {/* Qty Bagseal Stepper */}
            <div className="lg:col-span-2">
              <label
                htmlFor="qty-bagseal-input"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Qty Bagseal
              </label>
              <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
                <button
                  type="button"
                  aria-label="Kurangi qty bagseal"
                  onClick={() => setQtyInput((q) => Math.max(1, q - 1))}
                  className="px-2.5 py-2.5 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  id="qty-bagseal-input"
                  type="number"
                  min={1}
                  value={qtyInput}
                  onChange={(e) => setQtyInput(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full py-2 text-center text-sm font-mono font-semibold text-slate-900 tabular-nums focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Tambah qty bagseal"
                  onClick={() => setQtyInput((q) => q + 1)}
                  className="px-2.5 py-2.5 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Bangsal Tag Selector (Default: Reg) */}
            <div className="lg:col-span-3">
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Tag Bangsal (Default: Reg)
              </span>
              <div
                role="group"
                aria-label="Pilih tag bangsal"
                className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto"
              >
                {BANGSAL_TAGS.map((tag) => {
                  const active = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(tag)}
                      aria-pressed={active}
                      className={`flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit & Camera Actions */}
            <div className="lg:col-span-2 flex flex-col gap-2 lg:pt-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenCameraScanner(selectedTag, qtyInput)}
                  aria-label="Scan barcode dengan kamera"
                  title="Scan dengan kamera"
                  className="px-3 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={busyScan}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <ScanBarcode className="w-4 h-4" />
                  <span>{busyScan ? 'Menyimpan...' : 'Masuk Scan'}</span>
                </button>
              </div>
            </div>
          </div>

          {scanError && (
            <p role="alert" className="mt-3 text-xs font-medium text-red-600">
              {scanError}
            </p>
          )}
        </form>

        {/* Active Staging Scanned Bangsal Items Grid */}
        {activeStaging.items.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm font-medium text-slate-800">
              Staging {activeStaging.name} masih kosong
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Scan barcode bangsal satu per satu atau tempel beberapa barcode sekaligus. Setiap bangsal otomatis diberi tag Reg dan dibuatkan gambar barcode untuk scan ulang.
            </p>
            <button
              type="button"
              onClick={() => singleInputRef.current?.focus()}
              className="mt-4 px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              Fokus Kolom Scan
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-white">
                  <th className="py-3 pl-6 pr-3 w-12">#</th>
                  <th className="py-3 px-3">Kode Bangsal</th>
                  <th className="py-3 px-3 w-36">Tag Bangsal</th>
                  <th className="py-3 px-3 w-40">Qty Bagseal</th>
                  <th className="py-3 px-3">Barcode Scan Ulang</th>
                  <th className="py-3 pl-3 pr-6 text-right w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {activeStaging.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 pl-6 pr-3 text-xs font-mono text-slate-400 tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-semibold text-slate-900">
                        {item.bangsalCode}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums mt-0.5">
                        Discan {formatTimeShort(item.scannedAt)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <label htmlFor={`tag-${item.id}`} className="sr-only">
                        Tag untuk {item.bangsalCode}
                      </label>
                      <select
                        id={`tag-${item.id}`}
                        value={item.tag}
                        onChange={(e) =>
                          void onUpdateItem(item.id, { tag: e.target.value as BangsalTag })
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        {BANGSAL_TAGS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <div className="inline-flex items-center border border-slate-300 rounded-lg bg-white">
                        <button
                          type="button"
                          aria-label={`Kurangi bagseal ${item.bangsalCode}`}
                          disabled={item.qtyBagseal <= 1}
                          onClick={() =>
                            void onUpdateItem(item.id, {
                              qtyBagseal: Math.max(1, item.qtyBagseal - 1),
                            })
                          }
                          className="px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-35"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 py-1 text-xs font-mono font-semibold text-slate-900 tabular-nums">
                          {item.qtyBagseal}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tambah bagseal ${item.bangsalCode}`}
                          onClick={() =>
                            void onUpdateItem(item.id, {
                              qtyBagseal: item.qtyBagseal + 1,
                            })
                          }
                          className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenRescanModal(
                              activeStaging.items,
                              idx,
                              activeStaging.name,
                              activeStaging.destination
                            )
                          }
                          aria-label={`Perbesar barcode ${item.bangsalCode} untuk scan ulang`}
                          className="group flex items-center gap-2.5 text-left hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                        >
                          <Barcode128Svg
                            value={item.bangsalCode}
                            barHeight={28}
                            showLabel={false}
                            className="w-36 h-9 border border-slate-200 rounded px-1"
                          />
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 group-hover:underline whitespace-nowrap shrink-0">
                            <Maximize2 className="w-3.5 h-3.5" />
                            Perbesar
                          </span>
                        </button>
                      </div>
                    </td>
                    <td className="py-3 pl-3 pr-6 text-right">
                      <button
                        type="button"
                        onClick={() => void onRemoveItem(item.id)}
                        aria-label={`Hapus bangsal ${item.bangsalCode}`}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Staging Completion Action Footer */}
        <div className="p-5 sm:p-6 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="tabular-nums font-medium text-slate-900">
              Ringkasan {activeStaging.name}: {totals.totalBangsal} Bangsal / {totals.totalBagseal} Bagseal
            </span>
            {BANGSAL_TAGS.map((tag) =>
              totals.tagCounts[tag] > 0 ? (
                <React.Fragment key={tag}>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {tag}: {totals.tagCounts[tag]}
                  </span>
                </React.Fragment>
              ) : null
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {activeStaging.items.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onOpenRescanModal(
                    activeStaging.items,
                    0,
                    activeStaging.name,
                    activeStaging.destination
                  )
                }
                className="px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
              >
                Scan Ulang Semua ({activeStaging.items.length})
              </button>
            )}
            <button
              type="button"
              disabled={activeStaging.items.length === 0 || busyFinalize}
              onClick={() => void handleFinalize()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {busyFinalize
                  ? 'Memindahkan...'
                  : 'Jadikan Outbound (Pindah ke Riwayat)'}
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
