-- 0003_studio_events.sql
-- Append-only event log for the Studio features: tenant/owner positions on findings,
-- discussion comments, report signatures, photo fingerprints and pipeline activity.
-- Events are never updated or deleted by the app; the current state is derived by
-- replaying them in order, so every change stays traceable.
--
-- Apply once: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Until it is applied the app keeps working on a local file (data/rentalmove-events.json).

CREATE TABLE IF NOT EXISTS rm_events (
  id           TEXT PRIMARY KEY,
  property_id  TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  resource_id  TEXT,
  actor_id     TEXT,
  actor_name   TEXT,
  actor_role   TEXT CHECK (actor_role IS NULL OR actor_role IN ('tenant', 'owner', 'system')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rm_events_property_time ON rm_events(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rm_events_type ON rm_events(property_id, type);

-- Only the server (service role) reads and writes events; the browser goes through the API.
ALTER TABLE rm_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rm_events_service ON rm_events;
CREATE POLICY rm_events_service ON rm_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
