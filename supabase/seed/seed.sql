-- ====================================================================
-- RentalMove Supabase Seed: Safe Demo Users & Property #381
-- ====================================================================

-- Demo Users (Alex Chen = Tenant, Sarah Jenkins = Owner)
INSERT INTO users (id, name, email, role, created_at) VALUES
  ('user-tenant-1', 'Alex Chen', 'alex.chen@example.com', 'tenant', '2024-01-01 00:00:00+00'),
  ('user-owner-1', 'Sarah Jenkins', 'sarah.jenkins@example.com', 'owner', '2024-01-01 00:00:00+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- Property #381 (Owned by Sarah Jenkins)
INSERT INTO properties (id, owner_id, address_label, unit_label, created_at) VALUES
  ('prop-381', 'user-owner-1', '381 Elmwood Ave', 'Apt 4B', '2024-01-01 00:00:00+00')
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  address_label = EXCLUDED.address_label,
  unit_label = EXCLUDED.unit_label;

-- Tenant Assignment: Alex Chen assigned to Property #381
INSERT INTO property_tenants (id, property_id, tenant_id, created_at) VALUES
  ('assign-381-tenant-1', 'prop-381', 'user-tenant-1', '2024-01-01 00:00:00+00')
ON CONFLICT (property_id, tenant_id) DO NOTHING;

-- Rooms for Property #381
INSERT INTO rooms (id, property_id, name, category, created_at) VALUES
  ('room-living', 'prop-381', 'Living Room', 'living_room', '2024-01-01 00:00:00+00'),
  ('room-kitchen', 'prop-381', 'Kitchen', 'kitchen', '2024-01-01 00:00:00+00'),
  ('room-bathroom', 'prop-381', 'Bathroom', 'bathroom', '2024-01-01 00:00:00+00'),
  ('room-bedroom', 'prop-381', 'Master Bedroom', 'bedroom', '2024-01-01 00:00:00+00')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

-- Inspections for Property #381
INSERT INTO inspections (id, property_id, type, captured_at, created_by, status, created_at) VALUES
  ('insp-2024-move-in', 'prop-381', 'move_in', '2024-06-01 10:00:00+00', 'user-tenant-1', 'completed', '2024-06-01 10:00:00+00'),
  ('insp-2025-periodic', 'prop-381', 'inspection', '2025-06-01 11:00:00+00', 'user-owner-1', 'completed', '2025-06-01 11:00:00+00'),
  ('insp-2026-move-out', 'prop-381', 'move_out', '2026-06-01 09:30:00+00', 'user-tenant-1', 'completed', '2026-06-01 09:30:00+00')
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  captured_at = EXCLUDED.captured_at,
  created_by = EXCLUDED.created_by,
  status = EXCLUDED.status;
