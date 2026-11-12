import React, { useState } from 'react';
import { X } from 'lucide-react';
import { validateStagingInput, type StagingSession } from '../utils/outboundLogic';

interface ManualStagingModalProps {
  isOpen: boolean;
  existingStagings: StagingSession[];
  onClose: () => void;
  onCreate: (name: string, destination: string) => Promise<void>;
}

export const ManualStagingModal: React.FC<ManualStagingModalProps> = ({
  isOpen,
  existingStagings,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateStagingInput(name, existingStagings);
    if (!check.valid) {
      setError(check.error || 'Nama staging tidak valid.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(check.normalizedName, destination.trim() || 'Area Outbound Manual');
      setName('');
      setDestination('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat staging baru.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-staging-modal-title"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <h2 id="manual-staging-modal-title" className="text-base font-semibold text-slate-900">
            Tambah Staging Manual
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup form tambah staging"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="manual-staging-name"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Nama Staging <span className="text-red-600">*</span>
            </label>
            <input
              id="manual-staging-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Contoh: STG-DPS-04 atau Gate B3"
              autoFocus
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="manual-staging-dest"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Tujuan Hub / Keterangan Jalur
            </label>
            <input
              id="manual-staging-dest"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Contoh: Hub Denpasar · Jalur Reguler & Cargo"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Staging'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
