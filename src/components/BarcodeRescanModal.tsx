import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { BangsalItem } from '../utils/outboundLogic';
import { Barcode128Svg } from './Barcode128Svg';

interface BarcodeRescanModalProps {
  isOpen: boolean;
  stagingName: string;
  destination?: string;
  items: BangsalItem[];
  activeIndex: number;
  onChangeIndex: (nextIndex: number) => void;
  onClose: () => void;
}

export const BarcodeRescanModal: React.FC<BarcodeRescanModalProps> = ({
  isOpen,
  stagingName,
  destination,
  items,
  activeIndex,
  onChangeIndex,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
        onChangeIndex(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && activeIndex < items.length - 1) {
        onChangeIndex(activeIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, items.length, onChangeIndex, onClose]);

  if (!isOpen || items.length === 0) return null;

  const safeIndex = Math.min(Math.max(0, activeIndex), items.length - 1);
  const currentItem = items[safeIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rescan-modal-title"
    >
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="rescan-modal-title" className="text-lg font-semibold text-slate-900">
              Barcode Scan Ulang Antar-Perangkat
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span>{stagingName}</span>
              {destination ? (
                <>
                  <span className="mx-1.5" aria-hidden="true">·</span>
                  <span>{destination}</span>
                </>
              ) : null}
              <span className="mx-1.5" aria-hidden="true">·</span>
              <span className="tabular-nums">
                Bangsal {safeIndex + 1} dari {items.length}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup tampilan barcode"
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-8 px-4 flex flex-col items-center justify-center bg-white">
          <div className="w-full max-w-md py-4 px-6 border border-slate-200 rounded-lg bg-white">
            <Barcode128Svg
              value={currentItem.bangsalCode}
              barHeight={78}
              showLabel={true}
              className="w-full h-auto"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-700">
            <span className="font-mono font-semibold text-slate-900">
              {currentItem.bangsalCode}
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>
              Tag: <strong className="font-semibold text-slate-900">{currentItem.tag}</strong>
            </span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="tabular-nums">
              Qty Bagseal: <strong className="font-semibold text-slate-900">{currentItem.qtyBagseal}</strong>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Arahkan scanner PDA atau kamera perangkat lain langsung ke barcode di atas.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onChangeIndex(safeIndex - 1)}
            disabled={safeIndex === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            Sebelumnya
          </button>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {safeIndex + 1} / {items.length}
          </span>

          <button
            type="button"
            onClick={() => onChangeIndex(safeIndex + 1)}
            disabled={safeIndex >= items.length - 1}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
          >
            Berikutnya
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
