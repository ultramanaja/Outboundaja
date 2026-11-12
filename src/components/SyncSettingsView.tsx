import React, { useEffect, useState } from 'react';
import { Check, Copy, Database, ExternalLink, HelpCircle, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import type { SyncSettings } from '../utils/outboundLogic';

interface SyncSettingsViewProps {
  settings: SyncSettings;
  realtimeConnected: boolean;
  lastUpdated: string;
  onSaveSettings: (next: Partial<SyncSettings>) => Promise<void>;
  onTestSupabase: (url: string, anonKey: string) => Promise<{ ok: boolean; message?: string }>;
}

const APPS_SCRIPT_SNIPPET = `function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(payload.sheetName) || ss.insertSheet(payload.sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ID Outbound", "Staging", "Tujuan", "Waktu Selesai", "Kode Bangsal", "Tag", "Qty Bagseal", "Waktu Scan"]);
  }
  payload.rows.forEach(function(r) {
    sheet.appendRow([r.outboundId, r.stagingName, r.destination, r.completedAt, r.bangsalCode, r.tag, r.qtyBagseal, r.scannedAt]);
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`;

const SUPABASE_SQL_SNIPPET = `-- 1. Buat tabel state snapshot realtime
CREATE TABLE IF NOT EXISTS public.stageflow_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  stagings JSONB NOT NULL DEFAULT '[]'::jsonb,
  outbound_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Aktifkan Row Level Security (RLS) & Akses Anon/Authenticated
ALTER TABLE public.stageflow_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read stageflow_state"
  ON public.stageflow_state FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow anon upsert stageflow_state"
  ON public.stageflow_state FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Aktifkan Supabase Realtime broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.stageflow_state;`;

export const SyncSettingsView: React.FC<SyncSettingsViewProps> = ({
  settings,
  realtimeConnected,
  lastUpdated,
  onSaveSettings,
  onTestSupabase,
}) => {
  const [sheetName, setSheetName] = useState(settings.sheetName || 'Outbound_Log');
  const [gsheetWebhookUrl, setGsheetWebhookUrl] = useState(settings.gsheetWebhookUrl || '');
  const [supabaseUrl, setSupabaseUrl] = useState(settings.supabaseUrl || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(settings.supabaseAnonKey || '');
  const [autoSyncSupabase, setAutoSyncSupabase] = useState(settings.autoSyncSupabase ?? true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'supabase' | 'gsheet' | 'publish'>('publish');

  useEffect(() => {
    setSheetName(settings.sheetName || 'Outbound_Log');
    setGsheetWebhookUrl(settings.gsheetWebhookUrl || '');
    setSupabaseUrl(settings.supabaseUrl || '');
    setSupabaseAnonKey(settings.supabaseAnonKey || '');
    setAutoSyncSupabase(settings.autoSyncSupabase ?? true);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      await onSaveSettings({
        sheetName: sheetName.trim() || 'Outbound_Log',
        gsheetWebhookUrl: gsheetWebhookUrl.trim(),
        supabaseUrl: supabaseUrl.trim(),
        supabaseAnonKey: supabaseAnonKey.trim(),
        autoSyncSupabase,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setTestResult({
        ok: false,
        msg: 'Isi Project URL dan Anon Key terlebih dahulu untuk menguji koneksi.',
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTestSupabase(supabaseUrl.trim(), supabaseAnonKey.trim());
      setTestResult({
        ok: true,
        msg: res.message || 'Koneksi ke Supabase berhasil dan siap digunakan!',
      });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: err instanceof Error ? err.message : 'Koneksi ke Supabase gagal.',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'sql' | 'script') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'sql') {
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2000);
      } else {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      }
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              Integrasi Database Supabase &amp; Google Sheets
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hubungkan database cloud Supabase untuk sinkronisasi realtime multi-perangkat dan webhook Google Sheets.
            </p>
          </div>
          <div className="text-xs text-slate-600 tabular-nums">
            <span>Status Engine: </span>
            <strong className={realtimeConnected ? 'text-emerald-700' : 'text-amber-700'}>
              {realtimeConnected ? 'Aktif Realtime' : 'Menyambung Ulang'}
            </strong>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>Update {new Date(lastUpdated).toLocaleTimeString('id-ID')}</span>
          </div>
        </div>

        {/* Form Konfigurasi */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
          {/* Section Supabase */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Konfigurasi Kredensial Supabase
              </h3>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
              >
                Buka Supabase Dashboard
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="cfg-supabase-url"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Supabase Project URL <span className="text-red-500">*</span>
                </label>
                <input
                  id="cfg-supabase-url"
                  type="url"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xyzcompanyproject.supabase.co"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ditemukan di Supabase: <strong>Project Settings &rarr; API &rarr; Project URL</strong>
                </p>
              </div>

              <div>
                <label
                  htmlFor="cfg-supabase-key"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Supabase Anon Public API Key <span className="text-red-500">*</span>
                </label>
                <input
                  id="cfg-supabase-key"
                  type="password"
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ditemukan di Supabase: <strong>Project Settings &rarr; API &rarr; Project API keys (anon public)</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSyncSupabase}
                  onChange={(e) => setAutoSyncSupabase(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Otomatis sinkronkan setiap scan bangsal &amp; perubahan staging ke Supabase</span>
              </label>

              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testing}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Menguji...' : 'Uji Koneksi Supabase'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                  testResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {testResult.ok ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{testResult.msg}</span>
              </div>
            )}
          </div>

          {/* Section Google Sheets */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div className="pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Konfigurasi Google Sheets (Webhook Web App)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="cfg-sheet-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Nama Tab / Sheet Tujuan
                </label>
                <input
                  id="cfg-sheet-name"
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Outbound_Log"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="cfg-gsheet-url"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  URL Web App Google Apps Script (Opsional)
                </label>
                <input
                  id="cfg-gsheet-url"
                  type="url"
                  value={gsheetWebhookUrl}
                  onChange={(e) => setGsheetWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-3.5 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Semua Konfigurasi'}</span>
            </button>
          </div>
        </form>

        {/* Panduan & Tutorial Cara Menghubungkan */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Panduan Langkah Demi Langkah Menghubungkan
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pilih panduan di bawah untuk melihat instruksi lengkap dan script siap salin.
              </p>
            </div>

            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setActiveGuideTab('publish')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeGuideTab === 'publish'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Publish ke outboundaja.skom.id
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('supabase')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeGuideTab === 'supabase'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cara Setup Supabase
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('gsheet')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeGuideTab === 'gsheet'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cara Setup Google Sheets
              </button>
            </div>
          </div>

          {activeGuideTab === 'publish' ? (
            <div className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200">
                <li>
                  Jalankan perintah build produksi <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-900">npm run build</code> untuk menghasilkan folder siap publish <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-900">dist/</code> (sudah termasuk file <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-900">.htaccess</code> untuk HTTPS &amp; routing SPA).
                </li>
                <li>
                  Buka cPanel / File Manager hosting domain <strong>outboundaja.skom.id</strong>, lalu unggah seluruh isi folder <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-900">dist/</code> ke dalam direktori <code className="px-1.5 py-0.5 bg-slate-100 rounded font-mono text-slate-900">public_html/</code>.
                </li>
                <li>
                  Saat dibuka di <strong>https://outboundaja.skom.id</strong>, aplikasi otomatis terhubung langsung ke database <strong>Supabase Realtime</strong> (<code className="font-mono">japrxrakdloyhuchdlnr.supabase.co</code>) tanpa memerlukan server Node.js di hosting Anda.
                </li>
                <li>
                  Semua scan bangsal, staging manual, dan riwayat outbound di domain Anda akan langsung tersinkronisasi realtime dengan database Supabase yang sama.
                </li>
              </ol>

              <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-800 space-y-1">
                <p className="font-semibold text-slate-900">
                  Opsional — Hosting Node.js / VPS (Jika Tersedia):
                </p>
                <p>
                  Jika hosting Anda mendukung Node.js, jalankan <code className="px-1.5 py-0.5 bg-white rounded font-mono">npm run build &amp;&amp; npm start</code> dengan port <code className="font-mono">3000</code> lalu arahkan reverse proxy domain <strong>outboundaja.skom.id</strong>.
                </p>
              </div>
            </div>
          ) : activeGuideTab === 'supabase' ? (
            <div className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200">
                <li>
                  Buka akun di{' '}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-700 underline"
                  >
                    Supabase.com
                  </a>{' '}
                  dan buat project baru (gratis).
                </li>
                <li>
                  Masuk ke menu <strong>SQL Editor</strong> di sidebar kiri Supabase, klik <strong>New Query</strong>.
                </li>
                <li>
                  Salin kode SQL di bawah ini dan tempel di SQL Editor Supabase, lalu klik <strong>Run</strong>:
                </li>
              </ol>

              <div className="relative">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold text-slate-700 font-mono">
                    Schema Tabel &amp; Realtime Publication (Supabase SQL)
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(SUPABASE_SQL_SNIPPET, 'sql')}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedSql ? 'Tersalin' : 'Salin SQL'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono bg-slate-900 text-slate-100 rounded-lg overflow-x-auto leading-relaxed max-h-64">
                  {SUPABASE_SQL_SNIPPET}
                </pre>
              </div>

              <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950 space-y-1">
                <p className="font-semibold text-emerald-900">
                  Langkah Terakhir Mengambil Kunci API:
                </p>
                <p>
                  1. Di Supabase, buka <strong>Project Settings</strong> (ikon roda gigi di pojok kiri bawah) &rarr; <strong>API</strong>.
                </p>
                <p>
                  2. Salin <strong>Project URL</strong> dan tempel di kolom input &ldquo;Supabase Project URL&rdquo; di atas.
                </p>
                <p>
                  3. Salin <strong>Project API keys (anon public)</strong> dan tempel di kolom input &ldquo;Supabase Anon Public API Key&rdquo; di atas.
                </p>
                <p>
                  4. Klik <strong>Simpan Semua Konfigurasi</strong>, lalu klik <strong>Uji Koneksi Supabase</strong> untuk memastikan status terhubung!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed bg-white p-4 rounded-lg border border-slate-200">
                <li>Buka Google Sheets baru di browser Anda.</li>
                <li>
                  Klik menu <strong>Extensions &rarr; Apps Script</strong>.
                </li>
                <li>
                  Hapus isi file bawaan, lalu tempel kode Google Apps Script di bawah ini:
                </li>
              </ol>

              <div className="relative">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-semibold text-slate-700 font-mono">
                    Google Apps Script Webhook Snippet
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyToClipboard(APPS_SCRIPT_SNIPPET, 'script')}
                    className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedScript ? 'Tersalin' : 'Salin Script'}
                  </button>
                </div>
                <pre className="p-4 text-xs font-mono bg-slate-900 text-slate-100 rounded-lg overflow-x-auto leading-relaxed max-h-64">
                  {APPS_SCRIPT_SNIPPET}
                </pre>
              </div>

              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-950 space-y-1">
                <p className="font-semibold text-blue-900">
                  Langkah Deploy Web App di Apps Script:
                </p>
                <p>
                  1. Klik tombol biru <strong>Deploy &rarr; New deployment</strong>.
                </p>
                <p>
                  2. Pilih tipe <strong>Web app</strong> (klik ikon roda gigi &rarr; Web app).
                </p>
                <p>
                  3. Pada opsi <em>Execute as</em> pilih <strong>Me</strong>, dan pada <em>Who has access</em> pilih <strong>Anyone</strong>.
                </p>
                <p>
                  4. Klik <strong>Deploy</strong>, izinkan akses akun Google Anda, lalu salin <strong>Web app URL</strong> dan tempel di kolom input Google Sheets di atas.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
