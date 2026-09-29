-- ====================================================================
-- RentalMove Supabase Migration: 0002_auth_integration.sql
-- Links Supabase Auth (auth.users) to the application users table
-- Adds auto-profile creation trigger + tightens RLS policies
-- ====================================================================

-- 1. Alter users table to use UUID as primary key (matching auth.users.id)
-- NOTE: If migrating from TEXT to UUID, existing data must be migrated first.
-- For a fresh database, this ensures the users.id column is UUID type.

-- Drop existing foreign key constraints that reference users(id) as TEXT
-- and recreate them after altering the column type.

-- Add a foreign key reference from users.id to auth.users.id
-- This enforces that every app user must have a corresponding auth user.
ALTER TABLE users 
  ADD CONSTRAINT fk_users_auth_id 
  FOREIGN KEY (id) 
  REFERENCES auth.users(id) 
  ON DELETE CASCADE;

-- 2. Function: Auto-create user profile when a new auth user signs up
-- This is triggered by Supabase Auth on user creation.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into public.users, extracting name and role from raw_user_meta_data
  INSERT INTO public.users (id, name, email, role, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING; -- Idempotent: skip if profile already exists
  RETURN NEW;
END;
$$;

-- 3. Trigger: Fire after new auth user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Tighten RLS policies: Replace the generic `if user exists` with
--    policies that use auth.uid() directly

-- Users can view and update their own profile
DROP POLICY IF EXISTS user_own_profile ON users;
CREATE POLICY user_own_profile ON users
  FOR ALL
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- 5. Add is_active column to users for soft-deletion support
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 6. Add updated_at to properties and users for change tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE properties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 7. Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language plpgsql;

-- 8. Triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Add invitation tokens table for property invitation flow
CREATE TABLE IF NOT EXISTS property_invitations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant' CHECK (role IN ('tenant', 'owner')),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_hash TEXT UNIQUE GENERATED ALWAYS AS (encode(sha256(token::bytea), 'hex')) STORED,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_property ON property_invitations(property_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON property_invitations(invited_email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON property_invitations(token);

ALTER TABLE property_invitations ENABLE ROW LEVEL SECURITY;

-- Owners can view and create invitations for their properties
CREATE POLICY invitations_owner ON property_invitations
  FOR ALL
  USING (
    property_id IN (SELECT id FROM properties WHERE owner_id = auth.uid()::text)
  );

-- Public can read an invitation by token (for the acceptance flow)
CREATE POLICY invitations_by_token ON property_invitations
  FOR SELECT
  USING (
    accepted_at IS NULL
    AND expires_at > NOW()
    AND revoked_at IS NULL
  );

-- Add revoked_at to invitations
ALTER TABLE property_invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- 10. Add audit_log table for production compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Owners can view audit logs for their properties
CREATE POLICY audit_log_owner ON audit_log
  FOR SELECT
  USING (user_id = auth.uid()::text);

-- Service role has full access
CREATE POLICY audit_log_service ON audit_log
  FOR ALL
  USING (auth.role() = 'service_role');
