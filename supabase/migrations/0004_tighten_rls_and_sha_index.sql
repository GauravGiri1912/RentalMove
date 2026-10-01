-- ====================================================================
-- RentalMove Supabase Migration: 0004_tighten_rls_and_sha_index.sql
-- 1. Tighten RLS policies: Enforce owner-only mutations on observations,
--    rooms, inspections, and assets.
-- 2. Prevent tenants or anonymous users from mutating observations.
-- 3. Add index on assets(sha256) for O(1) hash verification.
-- ====================================================================

-- 1. Index on assets(sha256) for high-performance public verification lookup
CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
CREATE INDEX IF NOT EXISTS idx_assets_inspection_id ON assets(inspection_id);
CREATE INDEX IF NOT EXISTS idx_assets_room_id ON assets(room_id);
CREATE INDEX IF NOT EXISTS idx_observations_asset_id ON observations(asset_id);
CREATE INDEX IF NOT EXISTS idx_observations_review_status ON observations(review_status);

-- 2. Tighten Observations RLS
-- Drop the overly permissive 'FOR ALL' policy that allowed tenant mutations
DROP POLICY IF EXISTS observations_access ON observations;
DROP POLICY IF EXISTS observations_select ON observations;
DROP POLICY IF EXISTS observations_owner_update ON observations;
DROP POLICY IF EXISTS observations_owner_insert ON observations;
DROP POLICY IF EXISTS observations_owner_delete ON observations;

-- Allow SELECT for property owners and assigned tenants
CREATE POLICY observations_select ON observations
  FOR SELECT
  USING (
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

-- Strictly restrict observation UPDATE (finding review status, notes, edits) to property owners
CREATE POLICY observations_owner_update ON observations
  FOR UPDATE
  USING (
    asset_id IN (
      SELECT a.id FROM assets a
      JOIN inspections i ON a.inspection_id = i.id
      JOIN properties p ON i.property_id = p.id
      WHERE p.owner_id = auth.uid()::text
    )
  )
  WITH CHECK (
    asset_id IN (
      SELECT a.id FROM assets a
      JOIN inspections i ON a.inspection_id = i.id
      JOIN properties p ON i.property_id = p.id
      WHERE p.owner_id = auth.uid()::text
    )
  );

-- Restrict observation DELETE to property owners
CREATE POLICY observations_owner_delete ON observations
  FOR DELETE
  USING (
    asset_id IN (
      SELECT a.id FROM assets a
      JOIN inspections i ON a.inspection_id = i.id
      JOIN properties p ON i.property_id = p.id
      WHERE p.owner_id = auth.uid()::text
    )
  );

-- Restrict observation INSERT to property owners or service role
CREATE POLICY observations_owner_insert ON observations
  FOR INSERT
  WITH CHECK (
    asset_id IN (
      SELECT a.id FROM assets a
      JOIN inspections i ON a.inspection_id = i.id
      JOIN properties p ON i.property_id = p.id
      WHERE p.owner_id = auth.uid()::text
    )
    OR auth.role() = 'service_role'
    OR (auth.jwt()->>'role') = 'service_role'
  );

-- 3. Tighten Rooms RLS
DROP POLICY IF EXISTS rooms_access ON rooms;
DROP POLICY IF EXISTS rooms_select ON rooms;
DROP POLICY IF EXISTS rooms_owner_write ON rooms;

CREATE POLICY rooms_select ON rooms
  FOR SELECT
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
      UNION
      SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
    )
  );

CREATE POLICY rooms_owner_write ON rooms
  FOR ALL
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
    )
    OR auth.role() = 'service_role'
    OR (auth.jwt()->>'role') = 'service_role'
  );

-- 4. Tighten Inspections RLS
DROP POLICY IF EXISTS inspections_access ON inspections;
DROP POLICY IF EXISTS inspections_select ON inspections;
DROP POLICY IF EXISTS inspections_owner_write ON inspections;

CREATE POLICY inspections_select ON inspections
  FOR SELECT
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
      UNION
      SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
    )
  );

CREATE POLICY inspections_owner_write ON inspections
  FOR ALL
  USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = auth.uid()::text
    )
    OR auth.role() = 'service_role'
    OR (auth.jwt()->>'role') = 'service_role'
  );

-- 5. Tighten Assets RLS
DROP POLICY IF EXISTS assets_access ON assets;
DROP POLICY IF EXISTS assets_select ON assets;
DROP POLICY IF EXISTS assets_owner_write ON assets;

CREATE POLICY assets_select ON assets
  FOR SELECT
  USING (
    inspection_id IN (
      SELECT id FROM inspections WHERE property_id IN (
        SELECT id FROM properties WHERE owner_id = auth.uid()::text
        UNION
        SELECT property_id FROM property_tenants WHERE tenant_id = auth.uid()::text
      )
    )
  );

CREATE POLICY assets_owner_write ON assets
  FOR ALL
  USING (
    inspection_id IN (
      SELECT id FROM inspections WHERE property_id IN (
        SELECT id FROM properties WHERE owner_id = auth.uid()::text
      )
    )
    OR auth.role() = 'service_role'
    OR (auth.jwt()->>'role') = 'service_role'
  );
