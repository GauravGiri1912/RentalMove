-- ====================================================================
-- RentalMove Supabase Migration: 0001_init.sql
-- Complete Schema with Users, Properties, Rooms, Inspections, Assets,
-- Observations, Comparisons, Share Links, Foreign Keys, Indexes & RLS
-- ====================================================================

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tenant', 'owner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Properties
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  address_label TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tenant Assignments (Property <-> Tenant Many-to-Many/One-to-Many)
CREATE TABLE IF NOT EXISTS property_tenants (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(property_id, tenant_id)
);

-- 4. Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Inspections
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('move_in', 'inspection', 'move_out')),
  captured_at TIMESTAMPTZ NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Assets
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  cloudinary_public_id TEXT UNIQUE NOT NULL,
  secure_url TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'image' CHECK (resource_type IN ('image', 'video')),
  format TEXT,
  width INTEGER,
  height INTEGER,
  bytes INTEGER,
  etag TEXT,
  sha256 TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_status TEXT NOT NULL DEFAULT 'queued' CHECK (analysis_status IN ('queued', 'running', 'done', 'failed')),
  analysis_error TEXT,
  room_guess TEXT CHECK (room_guess IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'unknown')),
  image_quality TEXT CHECK (image_quality IN ('ok', 'blurry', 'too_dark', 'not_a_room')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Observations
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
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human')),
  edited_from JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Comparisons
CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  prior_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  current_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  caveats JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  review_required BOOLEAN NOT NULL DEFAULT true,
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Share Links
CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  inspection_id TEXT REFERENCES inspections(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Query Performance & Lookups
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_property_tenants_tenant ON property_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_property_tenants_property ON property_tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_rooms_property ON rooms(property_id);
CREATE INDEX IF NOT EXISTS idx_inspections_property ON inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_inspections_captured_at ON inspections(captured_at);
CREATE INDEX IF NOT EXISTS idx_assets_inspection ON assets(inspection_id);
CREATE INDEX IF NOT EXISTS idx_assets_room ON assets(room_id);
CREATE INDEX IF NOT EXISTS idx_assets_captured_at ON assets(captured_at);
CREATE INDEX IF NOT EXISTS idx_assets_cloudinary_public_id ON assets(cloudinary_public_id);
CREATE INDEX IF NOT EXISTS idx_observations_asset ON observations(asset_id);
CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(category);
CREATE INDEX IF NOT EXISTS idx_observations_review_status ON observations(review_status);
CREATE INDEX IF NOT EXISTS idx_comparisons_property ON comparisons(property_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_token_hash ON share_links(token_hash);

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY service_role_all_users ON users FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_properties ON properties FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_tenants ON property_tenants FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_rooms ON rooms FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_inspections ON inspections FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_assets ON assets FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_observations ON observations FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_comparisons ON comparisons FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');
CREATE POLICY service_role_all_share_links ON share_links FOR ALL USING (auth.jwt()->>'role' = 'service_role' OR auth.role() = 'service_role');

-- Authenticated Users RLS:
-- 1. Owner can view and manage their owned properties
CREATE POLICY owner_properties ON properties FOR ALL USING (owner_id = auth.uid()::text);
-- 2. Tenant can view properties they are assigned to
CREATE POLICY tenant_properties ON properties FOR SELECT USING (
  id IN (SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text)
);
-- 3. Room view for owners & assigned tenants
CREATE POLICY rooms_access ON rooms FOR ALL USING (
  property_id IN (
    SELECT id FROM properties WHERE owner_id = auth.uid()::text
    UNION
    SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
  )
);
-- 4. Inspection access for owners & assigned tenants
CREATE POLICY inspections_access ON inspections FOR ALL USING (
  property_id IN (
    SELECT id FROM properties WHERE owner_id = auth.uid()::text
    UNION
    SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
  )
);
-- 5. Asset access through inspections
CREATE POLICY assets_access ON assets FOR ALL USING (
  inspection_id IN (
    SELECT id FROM inspections WHERE property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
      UNION
      SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
    )
  )
);
-- 6. Observations access through assets
CREATE POLICY observations_access ON observations FOR ALL USING (
  asset_id IN (
    SELECT a.id FROM assets a
    JOIN inspections i ON a.inspection_id = i.id
    WHERE i.property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
      UNION
      SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
    )
  )
);
-- 7. Comparison access
CREATE POLICY comparisons_access ON comparisons FOR ALL USING (
  property_id IN (
    SELECT id FROM properties WHERE owner_id = auth.uid()::text
    UNION
    SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
  )
);
-- 8. Share links access
CREATE POLICY share_links_select ON share_links FOR SELECT USING (revoked_at IS NULL AND expires_at > NOW());
