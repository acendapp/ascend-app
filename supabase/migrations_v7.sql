-- ─────────────────────────────────────────────────────────────────────────────
-- Active Challenges (always-available) — v7 Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Expand challenge_type to include streak + PR challenges ───────────────

ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_challenge_type_check;
ALTER TABLE public.challenges ADD CONSTRAINT challenges_challenge_type_check
  CHECK (challenge_type IN ('most_workouts', 'biggest_score_gain', 'most_volume', 'longest_streak', 'most_prs'));


-- ── 2. Relax personal_records SELECT so leaderboards can read other users ────

DROP POLICY IF EXISTS "pr_select_own" ON public.personal_records;
CREATE POLICY "pr_select_authed" ON public.personal_records FOR SELECT
  TO authenticated USING (true);


-- ── 3. Rename any existing 'Volume King' challenges to 'Volume Leader' ───────

UPDATE public.challenges SET title = 'Volume Leader' WHERE title ILIKE '%Volume King%';


-- ── 4. Seed the 4 always-available builtin challenges ───────────────────────
-- Fixed UUIDs so client code can reference them directly.

INSERT INTO public.challenges (id, title, description, challenge_type, start_date, end_date) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Monthly Grind',
   'Most workouts completed this month.',
   'most_workouts',
   '2024-01-01T00:00:00Z',
   '9999-12-31T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222',
   'Volume Leader',
   'Most total pounds lifted this month.',
   'most_volume',
   '2024-01-01T00:00:00Z',
   '9999-12-31T00:00:00Z'),
  ('33333333-3333-3333-3333-333333333333',
   'PR Hunter',
   'Most personal records set this month.',
   'most_prs',
   '2024-01-01T00:00:00Z',
   '9999-12-31T00:00:00Z'),
  ('44444444-4444-4444-4444-444444444444',
   'Streak Master',
   'Longest current workout streak.',
   'longest_streak',
   '2024-01-01T00:00:00Z',
   '9999-12-31T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
