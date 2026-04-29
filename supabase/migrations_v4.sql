-- ─────────────────────────────────────────────────────────────────────────────
-- Ascend Challenges Feature Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.challenges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text        NOT NULL,
  description    text,
  challenge_type text        NOT NULL CHECK (challenge_type IN ('most_workouts', 'biggest_score_gain', 'most_volume')),
  start_date     timestamptz NOT NULL,
  end_date       timestamptz NOT NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid        NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);


-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS challenge_participants_challenge_id_idx ON public.challenge_participants (challenge_id);
CREATE INDEX IF NOT EXISTS challenge_participants_user_id_idx      ON public.challenge_participants (user_id);


-- ── 3. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.challenges             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants  ENABLE ROW LEVEL SECURITY;


-- ── 4. RLS policies: challenges ───────────────────────────────────────────────

CREATE POLICY "authenticated users can read challenges"
  ON public.challenges FOR SELECT
  TO authenticated
  USING (true);


-- ── 5. RLS policies: challenge_participants ───────────────────────────────────

CREATE POLICY "authenticated users can read challenge participants"
  ON public.challenge_participants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "users can join challenges"
  ON public.challenge_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can leave challenges"
  ON public.challenge_participants FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ── 6. Seed: three weekly challenges (current week) ──────────────────────────
-- date_trunc('week', now()) returns Monday 00:00 UTC of the current week.

INSERT INTO public.challenges (title, description, challenge_type, start_date, end_date) VALUES
  (
    'Weekly Grind',
    'Most workouts completed this week wins.',
    'most_workouts',
    date_trunc('week', now()),
    date_trunc('week', now()) + interval '7 days'
  ),
  (
    'Score Surge',
    'Who can earn the highest Ascend Score this week?',
    'biggest_score_gain',
    date_trunc('week', now()),
    date_trunc('week', now()) + interval '7 days'
  ),
  (
    'Volume King',
    'Total weight moved (lbs × reps) across all exercises.',
    'most_volume',
    date_trunc('week', now()),
    date_trunc('week', now()) + interval '7 days'
  );
