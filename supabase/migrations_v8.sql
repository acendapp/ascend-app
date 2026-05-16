-- ─────────────────────────────────────────────────────────────────────────────
-- Group Admin Tools — v8 Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Add avatar_url to groups ──────────────────────────────────────────────

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS avatar_url text;


-- ── 2. Admin UPDATE policy on groups (so admins can change avatar/name) ──────

DROP POLICY IF EXISTS "admins can update their groups" ON public.groups;
CREATE POLICY "admins can update their groups"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid()
        AND role    = 'admin'
        AND status  = 'approved'
    )
  )
  WITH CHECK (
    id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid()
        AND role    = 'admin'
        AND status  = 'approved'
    )
  );
