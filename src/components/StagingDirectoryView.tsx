import React, { useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import {
  calculateStagingTotals,
  validateStagingInput,
  type StagingSession,
} from '../utils/outboundLogic';

interface StagingDirectoryViewProps {
  stagings: StagingSession[];
  onCreateStaging: (name: string, destination: string) => Promise<void>;
  onDeleteStaging: (id: string) => Promise<void>;
  onOpenStagingForScan: (id: string) => void;
}

export const StagingDirectoryView: React.FC<StagingDirectoryViewProps> = ({
  stagings,
  onCreateStaging,
  onDeleteStaging,
  onOpenStagingForScan,
}) => {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateStagingInput(name, stagings);
    if (!check.valid) {
      setError(check.error || 'Nama staging tidak valid.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onCreateStaging(check.normalizedName, destination.trim() || 'Area Outbound Manual');
      setName('');
      setDestination('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah staging.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Daftar Jalur Staging &amp; Tambah Staging Manual
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola daftar nama staging aktif secara realtime. Staging yang ditambahkan di sini langsung tersedia di semua perangkat.
          </p>
        </div>

        {/* Inline Manual Staging Form */}
        <form
          onSubmit={handleQuickAdd}
          className="p-5 sm:p-6 bg-slate-50/60 border-b border-slate-200"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label
                htmlFor="dir-staging-name"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Nama Staging Baru
              </label>
              <input
                id="dir-staging-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Contoh: STG-MKS-02"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="md:col-span-5">
              <label
                htmlFor="dir-staging-dest"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Tujuan Hub / Gate
              </label>
              <input
                id="dir-staging-dest"
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Contoh: Hub Makassar · Gate Timur"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Tambah Staging'}</span>
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-red-600">
              {error}
            </p>
          )}
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-3 pl-6 pr-3">Nama Staging</th>
                <th className="py-3 px-3">Tujuan / Gate</th>
                <th className="py-3 px-3">Tipe</th>
                <th className="py-3 px-3 text-right">Bangsal Aktif</th>
                <th className="py-3 px-3 text-right">Qty Bagseal</th>
                <th className="py-3 pl-3 pr-6 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {stagings.map((stg) => {
                const { totalBangsal, totalBagseal } = calculateStagingTotals(stg.items);
                return (
                  <tr key={stg.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 pl-6 pr-3 font-semibold text-slate-900">
                      {stg.name}
                    </td>
                    <td className="py-3.5 px-3 text-slate-600">{stg.destination}</td>
                    <td className="py-3.5 px-3 text-xs text-slate-500">
                      {stg.isManual ? 'Manual' : 'Terjadwal'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {totalBangsal}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {totalBagseal}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenStagingForScan(stg.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
                        >
                          Buka &amp; Scan
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={stagings.length <= 1}
                          onClick={() => void onDeleteStaging(stg.id)}
                          aria-label={`Hapus staging ${stg.name}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
