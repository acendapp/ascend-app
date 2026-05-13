-- ─────────────────────────────────────────────────────────────────────────────
-- Activity Feed System — v6 Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. activity_events ───────────────────────────────────────────────────────
-- One row per feed-worthy action (workout complete, PR, check-in, streak, rank).

CREATE TABLE IF NOT EXISTS public.activity_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- 'workout' | 'pr' | 'checkin' | 'streak' | 'rank'
  title       TEXT        NOT NULL,   -- verb phrase, e.g. "finished a workout"
  subtitle    TEXT,                   -- detail line, e.g. "Upper Body · Ascend Method"
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_events_user_created_idx
  ON public.activity_events (user_id, created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Users insert their own events
CREATE POLICY "users insert own activity events"
  ON public.activity_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- All authenticated users can read (app filters to self + friends)
CREATE POLICY "authenticated users read activity events"
  ON public.activity_events FOR SELECT
  TO authenticated
  USING (true);


-- ── 2. gym_checkins ──────────────────────────────────────────────────────────
-- Individual check-in records so the feed can show each check-in separately.

CREATE TABLE IF NOT EXISTS public.gym_checkins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gym_name      TEXT        NOT NULL DEFAULT 'Pottruck Fitness Center',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gym_checkins_user_idx
  ON public.gym_checkins (user_id, checked_in_at DESC);

ALTER TABLE public.gym_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own checkins"
  ON public.gym_checkins FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated users read checkins"
  ON public.gym_checkins FOR SELECT
  TO authenticated
  USING (true);
