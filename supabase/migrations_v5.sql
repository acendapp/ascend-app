-- ─────────────────────────────────────────────────────────────────────────────
-- Workout Types System — v5 Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Extend workouts table ──────────────────────────────────────────────────
-- workout_source distinguishes Ascend Method / Custom / Class workouts.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS workout_source TEXT    DEFAULT 'ascend_method',
  ADD COLUMN IF NOT EXISTS class_type     TEXT,
  ADD COLUMN IF NOT EXISTS studio_name    TEXT,
  ADD COLUMN IF NOT EXISTS intensity      TEXT,
  ADD COLUMN IF NOT EXISTS template_id    UUID;


-- ── 2. workout_templates ──────────────────────────────────────────────────────
-- Reusable custom workout definitions owned by a user.

CREATE TABLE IF NOT EXISTS public.workout_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workout_templates_user_id_idx
  ON public.workout_templates (user_id);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own templates"
  ON public.workout_templates FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 3. template_exercises ─────────────────────────────────────────────────────
-- Exercises belonging to a template, ordered by order_index.

CREATE TABLE IF NOT EXISTS public.template_exercises (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID        NOT NULL REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  exercise_name TEXT        NOT NULL,
  sets          INTEGER     NOT NULL DEFAULT 3,
  reps          TEXT        NOT NULL DEFAULT '8-10',
  weight        NUMERIC     DEFAULT 0,
  notes         TEXT,
  order_index   INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS template_exercises_template_id_idx
  ON public.template_exercises (template_id);

ALTER TABLE public.template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own template exercises"
  ON public.template_exercises FOR ALL
  TO authenticated
  USING (
    template_id IN (
      SELECT id FROM public.workout_templates WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    template_id IN (
      SELECT id FROM public.workout_templates WHERE user_id = auth.uid()
    )
  );
