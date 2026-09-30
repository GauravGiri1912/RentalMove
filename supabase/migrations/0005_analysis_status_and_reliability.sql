-- Migration 0005: Expand assets analysis_status check constraint
-- Supports reliability and failure states: 'quota_limited', 'retryable', 'completed'

DO $$
BEGIN
  -- Drop existing check constraint if present
  ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_analysis_status_check;

  -- Add updated check constraint with expanded status enum
  ALTER TABLE assets ADD CONSTRAINT assets_analysis_status_check
    CHECK (analysis_status IN ('queued', 'running', 'done', 'completed', 'failed', 'quota_limited', 'retryable'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;
