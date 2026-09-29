-- ====================================================================
-- RentalMove Supabase Seed: Property #381
-- ====================================================================

-- Property #381
INSERT INTO properties (id, address_label, unit_label, created_at)
VALUES ('prop-381', '381 Elmwood Ave', 'Apt 4B', '2024-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Rooms for Property #381
INSERT INTO rooms (id, property_id, name, category) VALUES
  ('room-living', 'prop-381', 'Living Room', 'living_room'),
  ('room-kitchen', 'prop-381', 'Kitchen', 'kitchen'),
  ('room-bathroom', 'prop-381', 'Bathroom', 'bathroom'),
  ('room-bedroom', 'prop-381', 'Master Bedroom', 'bedroom')
ON CONFLICT (id) DO NOTHING;

-- Timeline Inspections
INSERT INTO inspections (id, property_id, type, captured_at, status, created_at) VALUES
  ('insp-2024-move-in', 'prop-381', 'move_in', '2024-06-01 10:00:00+00', 'completed', '2024-06-01 10:00:00+00'),
  ('insp-2025-periodic', 'prop-381', 'inspection', '2025-06-01 11:00:00+00', 'completed', '2025-06-01 11:00:00+00'),
  ('insp-2026-move-out', 'prop-381', 'move_out', '2026-06-01 09:30:00+00', 'completed', '2026-06-01 09:30:00+00')
ON CONFLICT (id) DO NOTHING;
