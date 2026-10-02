-- 0003_studio_events.sql
-- Append-only event log for the Studio features: tenant/owner positions on findings,
-- discussion comments, report signatures, photo fingerprints, pipeline activity, scale
-- references, measurements, repairs, coverage, translations, privacy areas and room checks.
-- Events are never updated or deleted by the app; the current state is derived by
-- replaying them in order, so every change stays traceable.
--
-- Apply once: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Until it is applied the app keeps working on a local file (data/rentalmove-events.json).
-- Safe to run again: every statement is idempotent.

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

-- Insertion order. Replay must follow the order events were written, and two events can
-- share a timestamp (e.g. "clear the AI's areas" then "add an area" in the same millisecond).
ALTER TABLE rm_events ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

CREATE INDEX IF NOT EXISTS idx_rm_events_property_time ON rm_events(property_id, created_at, seq);
CREATE INDEX IF NOT EXISTS idx_rm_events_type ON rm_events(property_id, type);
-- Account-wide lookups by type (e.g. the monthly OCR budget across all properties).
CREATE INDEX IF NOT EXISTS idx_rm_events_type_time ON rm_events(type, created_at);

-- Only the server (service role) reads and writes events; the browser goes through the API.
ALTER TABLE rm_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rm_events_service ON rm_events;
CREATE POLICY rm_events_service ON rm_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
