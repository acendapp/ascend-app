-- ============================================================
-- Ascend v2 Migration — run AFTER migrations.sql
-- Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Extend users table with new profile fields
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url     text,
  ADD COLUMN IF NOT EXISTS school_year    text,
  ADD COLUMN IF NOT EXISTS affiliation    text,
  ADD COLUMN IF NOT EXISTS gym_checkin_at timestamptz;

-- 2. Broaden SELECT policies so social features work
--    (search, leaderboard, activity feed all need to read other users)

DROP POLICY IF EXISTS "users_select_own"    ON public.users;
CREATE POLICY "users_select_authed"         ON public.users
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "scores_select_own"   ON public.user_scores;
CREATE POLICY "scores_select_authed"        ON public.user_scores
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "workouts_select_own" ON public.workouts;
CREATE POLICY "workouts_select_authed"      ON public.workouts
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 3. friendships
CREATE TABLE IF NOT EXISTS public.friendships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted'
  created_at   timestamptz DEFAULT now(),
  UNIQUE (requester_id, recipient_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_select" ON public.friendships FOR SELECT
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "friendships_insert" ON public.friendships FOR INSERT
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "friendships_update" ON public.friendships FOR UPDATE
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "friendships_delete" ON public.friendships FOR DELETE
  USING (requester_id = auth.uid() OR recipient_id = auth.uid());

-- 4. kudos
CREATE TABLE IF NOT EXISTS public.kudos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workout_id   uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (sender_id, workout_id)
);

ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kudos_select" ON public.kudos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "kudos_insert" ON public.kudos FOR INSERT
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "kudos_delete" ON public.kudos FOR DELETE
  USING (sender_id = auth.uid());

-- 5. personal_records
CREATE TABLE IF NOT EXISTS public.personal_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  weight        integer NOT NULL,
  logged_at     timestamptz DEFAULT now()
);

ALTER TABLE public.personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_select_own" ON public.personal_records FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "pr_insert_own" ON public.personal_records FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- 6. Supabase Storage bucket for avatars (public read, user-scoped write)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

-- Drop old storage policies if they exist so re-running is idempotent
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;

CREATE POLICY "avatars_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
