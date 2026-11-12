import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { BANGSAL_TAGS, type BangsalTag } from '../utils/outboundLogic';

interface CameraScannerModalProps {
  isOpen: boolean;
  stagingName: string;
  defaultTag: BangsalTag;
  defaultQty: number;
  onClose: () => void;
  onDetectedCode: (code: string, qty: number, tag: BangsalTag) => Promise<void>;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  stagingName,
  defaultTag,
  defaultQty,
  onClose,
  onDetectedCode,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const [continuousMode, setContinuousMode] = useState(true);
  const [selectedTag, setSelectedTag] = useState<BangsalTag>(defaultTag);
  const [qty, setQty] = useState<number>(defaultQty);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScannedNotice, setLastScannedNotice] = useState<string | null>(null);
  const [manualFallback, setManualFallback] = useState('');

  useEffect(() => {
    setSelectedTag(defaultTag);
    setQty(defaultQty);
  }, [defaultTag, defaultQty, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function startCamera() {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Browser atau perangkat ini tidak menyediakan akses kamera langsung. Gunakan kolom scan cepat atau scanner USB/Bluetooth.'
        );
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!window.BarcodeDetector) {
          setCameraError(
            'Pratinjau kamera aktif. Untuk deteksi otomatis instan di semua browser, gunakan input kode di bawah atau scanner eksternal.'
          );
          return;
        }

        const detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'qr_code'],
        });

        const loop = async () => {
          if (!active) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const results = await detector.detect(videoRef.current);
              if (results.length > 0 && results[0].rawValue) {
                const code = results[0].rawValue.trim().toUpperCase();
                const now = Date.now();
                if (
                  code &&
                  (code !== lastScanRef.current.code || now - lastScanRef.current.time > 2200)
                ) {
                  lastScanRef.current = { code, time: now };
                  await onDetectedCode(code, qty, selectedTag);
                  setLastScannedNotice(`Berhasil scan: ${code} (${selectedTag}, Qty ${qty})`);
                  if (!continuousMode) {
                    onClose();
                    return;
                  }
                }
              }
            } catch {
              // Ignore transient frame errors
            }
          }
          rafId = window.requestAnimationFrame(() => {
            void loop();
          });
        };

        rafId = window.requestAnimationFrame(() => {
          void loop();
        });
      } catch {
        if (active) {
          setCameraError(
            'Izin kamera belum diaktifkan atau kamera tidak ditemukan. Anda tetap dapat memasukkan barcode di bawah.'
          );
        }
      }
    }

    void startCamera();

    return () => {
      active = false;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, continuousMode, onClose, onDetectedCode, qty, selectedTag]);

  if (!isOpen) return null;

  const handleFallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualFallback.trim().toUpperCase();
    if (!clean) return;
    await onDetectedCode(clean, qty, selectedTag);
    setLastScannedNotice(`Berhasil scan: ${clean} (${selectedTag}, Qty ${qty})`);
    setManualFallback('');
    if (!continuousMode) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-scanner-title"
    >
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 id="camera-scanner-title" className="text-base font-semibold text-slate-900">
              Scan Kamera Barcode — {stagingName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mendukung scan beruntun multi-item dalam satu sesi staging
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kamera scanner"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="relative aspect-video w-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="pointer-events-none absolute inset-6 border border-white/60 rounded-lg" />
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/85 p-5 flex flex-col items-center justify-center text-center">
                <Camera className="w-7 h-7 text-slate-300 mb-2" />
                <p className="text-xs text-slate-200 max-w-sm leading-relaxed">{cameraError}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cam-tag-select" className="block text-xs font-medium text-slate-700 mb-1">
                Tag Bangsal
              </label>
              <select
                id="cam-tag-select"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value as BangsalTag)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
              >
                {BANGSAL_TAGS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cam-qty-input" className="block text-xs font-medium text-slate-700 mb-1">
                Qty Bagseal
              </label>
              <input
                id="cam-qty-input"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 tabular-nums"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span>Mode scan beruntun (tetap buka kamera untuk scan multi-item)</span>
          </label>

          {lastScannedNotice && (
            <p className="text-xs font-medium text-emerald-700">{lastScannedNotice}</p>
          )}

          <form onSubmit={handleFallbackSubmit} className="pt-3 border-t border-slate-200 flex gap-2">
            <label htmlFor="cam-manual-code" className="sr-only">
              Input kode barcode manual
            </label>
            <input
              id="cam-manual-code"
              type="text"
              value={manualFallback}
              onChange={(e) => setManualFallback(e.target.value)}
              placeholder="Ketik / tembak kode barcode di sini..."
              className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Simpan Scan
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
