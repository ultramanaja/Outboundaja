-- =========================================================================
-- StageFlow Outbound - Supabase Database Schema & Realtime Setup
-- =========================================================================
-- Jalankan query SQL ini di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- =========================================================================

-- 1. Tabel State Utama (Menyimpan snapshot realtime yang sinkron antar-perangkat)
CREATE TABLE IF NOT EXISTS public.stageflow_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  stagings JSONB NOT NULL DEFAULT '[]'::jsonb,
  outbound_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Tabel Rincian Outbound Log (Untuk query relasional/BI/reporting detail per bangsal)
CREATE TABLE IF NOT EXISTS public.outbound_items_log (
  id TEXT PRIMARY KEY,
  outbound_id TEXT NOT NULL,
  staging_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  bangsal_code TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'Reg',
  qty_bagseal INTEGER NOT NULL DEFAULT 1,
  scanned_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Aktifkan Row Level Security (RLS) & Berikan Akses Anon
ALTER TABLE public.stageflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_items_log ENABLE ROW LEVEL SECURITY;

-- Policy untuk stageflow_state (read & write via anon key)
DROP POLICY IF EXISTS "Allow anon read stageflow_state" ON public.stageflow_state;
CREATE POLICY "Allow anon read stageflow_state"
  ON public.stageflow_state FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anon upsert stageflow_state" ON public.stageflow_state;
CREATE POLICY "Allow anon upsert stageflow_state"
  ON public.stageflow_state FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Policy untuk outbound_items_log
DROP POLICY IF EXISTS "Allow anon read outbound_items_log" ON public.outbound_items_log;
CREATE POLICY "Allow anon read outbound_items_log"
  ON public.outbound_items_log FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow anon upsert outbound_items_log" ON public.outbound_items_log;
CREATE POLICY "Allow anon upsert outbound_items_log"
  ON public.outbound_items_log FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Aktifkan Supabase Realtime pada tabel stageflow_state
-- Ini membuat perubahan dari aplikasi otomatis broadcast ke semua listener realtime Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.stageflow_state;
