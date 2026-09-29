-- ====================================================================
-- RentalMove Supabase Migration: 0001_init.sql
-- Hackathon: Pixels to Products 2026, Track 1 (AI Media Pipelines)
-- ====================================================================

-- 1. Properties
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  address_label TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Inspections
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('move_in', 'inspection', 'move_out')),
  captured_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Assets
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT UNIQUE NOT NULL,
  secure_url TEXT NOT NULL,
  etag TEXT,
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_status TEXT NOT NULL DEFAULT 'queued' CHECK (analysis_status IN ('queued', 'running', 'done', 'failed')),
  analysis_error TEXT,
  room_guess TEXT CHECK (room_guess IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'unknown')),
  image_quality TEXT CHECK (image_quality IN ('ok', 'blurry', 'too_dark', 'not_a_room')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Observations
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('scratch', 'stain', 'crack', 'dent', 'mark', 'other')),
  sub_area TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bbox JSONB NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'accepted', 'rejected', 'edited')),
  reviewer_note TEXT,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human')),
  edited_from JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Comparisons
CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  prior_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  current_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Share Links
CREATE TABLE IF NOT EXISTS share_links (
  token TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_assets_inspection_room ON assets(inspection_id, room_id);
CREATE INDEX IF NOT EXISTS idx_assets_cloudinary_public_id ON assets(cloudinary_public_id);
CREATE INDEX IF NOT EXISTS idx_observations_asset ON observations(asset_id);
CREATE INDEX IF NOT EXISTS idx_inspections_property ON inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(property_id);

-- Enable Supabase Realtime for Asset status and Observations
ALTER PUBLICATION supabase_realtime ADD TABLE assets;
ALTER PUBLICATION supabase_realtime ADD TABLE observations;
