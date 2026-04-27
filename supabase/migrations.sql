-- ============================================================
-- Ascend App — Supabase Schema
-- Run this entire file in your Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New query
-- ============================================================

-- 1. users
CREATE TABLE IF NOT EXISTS public.users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  username         text UNIQUE NOT NULL,
  name             text NOT NULL,
  school           text NOT NULL DEFAULT 'Penn',
  goal             text,
  experience_level text,
  equipment        text,
  created_at       timestamptz DEFAULT now()
);

-- 2. user_scores
CREATE TABLE IF NOT EXISTS public.user_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ascend_score      integer DEFAULT 0,
  strength_score    integer DEFAULT 0,
  consistency_score integer DEFAULT 0,
  social_score      integer DEFAULT 0,
  xp                integer DEFAULT 0,
  level             integer DEFAULT 1,
  streak_days       integer DEFAULT 0
);

-- 3. workouts
CREATE TABLE IF NOT EXISTS public.workouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workout_date timestamptz DEFAULT now(),
  workout_type text,
  duration     integer,
  completed    boolean DEFAULT false,
  score_change integer DEFAULT 0
);

-- 4. exercise_logs
CREATE TABLE IF NOT EXISTS public.exercise_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id    uuid NOT NULL REFERENCES public.workouts(id) ON DELETE CASCADE,
  exercise_name text,
  sets          integer,
  reps          integer,
  weight        integer,
  completed     boolean DEFAULT false
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;

-- users: own row only (id = auth.uid())
CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_update_own" ON public.users FOR UPDATE USING (id = auth.uid());

-- user_scores: own rows only (user_id = auth.uid())
CREATE POLICY "scores_select_own" ON public.user_scores FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "scores_insert_own" ON public.user_scores FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "scores_update_own" ON public.user_scores FOR UPDATE USING (user_id = auth.uid());

-- workouts: own rows only
CREATE POLICY "workouts_select_own" ON public.workouts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "workouts_insert_own" ON public.workouts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "workouts_update_own" ON public.workouts FOR UPDATE USING (user_id = auth.uid());

-- exercise_logs: own rows via workout join
CREATE POLICY "logs_select_own" ON public.exercise_logs FOR SELECT
  USING (workout_id IN (SELECT id FROM public.workouts WHERE user_id = auth.uid()));
CREATE POLICY "logs_insert_own" ON public.exercise_logs FOR INSERT
  WITH CHECK (workout_id IN (SELECT id FROM public.workouts WHERE user_id = auth.uid()));
CREATE POLICY "logs_update_own" ON public.exercise_logs FOR UPDATE
  USING (workout_id IN (SELECT id FROM public.workouts WHERE user_id = auth.uid()));
