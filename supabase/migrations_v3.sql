-- ─────────────────────────────────────────────────────────────────────────────
-- Ascend Groups Feature Migration
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  formal_name  text,
  category     text        NOT NULL,
  created_at   timestamptz DEFAULT now(),
  member_count integer     DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NOT NULL REFERENCES public.groups(id)  ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id)   ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'member'  CHECK (role   IN ('admin',   'member')),
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  requested_at timestamptz DEFAULT now(),
  approved_at  timestamptz,
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_scores (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         uuid        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  avg_ascend_score integer     DEFAULT 0,
  total_members    integer     DEFAULT 0,
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (group_id)
);


-- ── 2. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS group_members_group_id_idx ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS group_members_user_id_idx  ON public.group_members (user_id);
CREATE INDEX IF NOT EXISTS group_members_status_idx   ON public.group_members (status);
CREATE INDEX IF NOT EXISTS group_scores_group_id_idx  ON public.group_scores  (group_id);


-- ── 3. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_scores  ENABLE ROW LEVEL SECURITY;


-- ── 4. RLS policies: groups ───────────────────────────────────────────────────

-- Any authenticated user can browse all groups
CREATE POLICY "authenticated users can read groups"
  ON public.groups FOR SELECT
  TO authenticated
  USING (true);


-- ── 5. RLS policies: group_members ───────────────────────────────────────────

-- Any authenticated user can read group membership
-- (required for group leaderboards and join-status checks)
CREATE POLICY "authenticated users can read group members"
  ON public.group_members FOR SELECT
  TO authenticated
  USING (true);

-- A user can only submit a join request for themselves
CREATE POLICY "users can request to join groups"
  ON public.group_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admins of a group can approve / promote members of that group
CREATE POLICY "admins can update group members"
  ON public.group_members FOR UPDATE
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid()
        AND role    = 'admin'
        AND status  = 'approved'
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid()
        AND role    = 'admin'
        AND status  = 'approved'
    )
  );

-- Admins of a group can deny (delete) pending requests
CREATE POLICY "admins can delete group members"
  ON public.group_members FOR DELETE
  TO authenticated
  USING (
    group_id IN (
      SELECT group_id FROM public.group_members
      WHERE user_id = auth.uid()
        AND role    = 'admin'
        AND status  = 'approved'
    )
  );


-- ── 6. RLS policies: group_scores ────────────────────────────────────────────

CREATE POLICY "authenticated users can read group scores"
  ON public.group_scores FOR SELECT
  TO authenticated
  USING (true);


-- ── 7. Seed: Penn groups ──────────────────────────────────────────────────────

INSERT INTO public.groups (name, formal_name, category) VALUES

-- ── Fraternities ──────────────────────────────────────────────────────────────
('Castle',   'Psi Upsilon',          'Fraternity'),
('Alpha',    'Alpha Phi Alpha',       'Fraternity'),
('Kappa',    'Kappa Alpha Psi',       'Fraternity'),
('Que',      'Omega Psi Phi',         'Fraternity'),
('Owls',      NULL,                   'Fraternity'),
('Oz',        NULL,                   'Fraternity'),
('Phi',       NULL,                   'Fraternity'),
('Theos',     NULL,                   'Fraternity'),
('ZBT',      'Zeta Beta Tau',         'Fraternity'),
('Sammy',    'Sigma Alpha Mu',        'Fraternity'),
('Sig Chi',  'Sigma Chi',             'Fraternity'),
('Sig Nu',    NULL,                   'Fraternity'),
('SigEp',    'Sigma Phi Epsilon',     'Fraternity'),
('Zete',     'Zeta Psi',              'Fraternity'),
('AXR',      'Alpha Chi Rho',         'Fraternity'),
('AEPi',     'Alpha Epsilon Pi',      'Fraternity'),
('ATO',      'Alpha Tau Omega',       'Fraternity'),
('Beta',     'Beta Theta Pi',         'Fraternity'),
('PCT',      'Phi Chi Theta',         'Fraternity'),
('AKPsi',    'Alpha Kappa Psi',       'Fraternity'),
('DSP',      'Delta Sigma Pi',        'Fraternity'),
('PGN',      'Phi Gamma Nu',          'Fraternity'),

-- ── Sororities ────────────────────────────────────────────────────────────────
('A Phi',     'Alpha Phi',            'Sorority'),
('OAX',       NULL,                   'Sorority'),
('Tabard',    NULL,                   'Sorority'),
('Theta',     NULL,                   'Sorority'),
('Tri Delt',  NULL,                   'Sorority'),
('AKA',      'Alpha Kappa Alpha',     'Sorority'),
('Delta',    'Delta Sigma Theta',     'Sorority'),
('Zetas',    'Zeta Phi Beta',         'Sorority'),

-- ── Club Sports ───────────────────────────────────────────────────────────────
('Ski',              NULL,            'Club Sport'),
('Soccer',           NULL,            'Club Sport'),
('Rugby',            NULL,            'Club Sport'),
('LAX',             'Lacrosse',       'Club Sport'),
('Powerlifting',     NULL,            'Club Sport'),
('Volleyball',       NULL,            'Club Sport'),
('Basketball',       NULL,            'Club Sport'),
('Baseball',         NULL,            'Club Sport'),
('Ice Hockey',       NULL,            'Club Sport'),
('Tennis',           NULL,            'Club Sport'),
('Squash',           NULL,            'Club Sport'),
('Swimming',         NULL,            'Club Sport'),
('Water Polo',       NULL,            'Club Sport'),
('Crew',            'Rowing',         'Club Sport'),
('Ultimate Frisbee', NULL,            'Club Sport'),
('Track',            NULL,            'Club Sport'),
('Triathlon',        NULL,            'Club Sport'),
('Cycling',          NULL,            'Club Sport'),
('Boxing',           NULL,            'Club Sport'),
('Wrestling',        NULL,            'Club Sport'),
('Fencing',          NULL,            'Club Sport'),
('Badminton',        NULL,            'Club Sport'),
('Table Tennis',     NULL,            'Club Sport'),
('Cricket',          NULL,            'Club Sport'),
('Field Hockey',     NULL,            'Club Sport'),
('Golf',             NULL,            'Club Sport'),
('Gymnastics',       NULL,            'Club Sport'),

-- ── Clubs ─────────────────────────────────────────────────────────────────────
('WITG',        'Wharton Investment & Trading Group',    'Club'),
('WUFC',        'Wharton Undergraduate Finance Club',    'Club'),
('PIIC',        'Penn International Impact Consulting',  'Club'),
('WUCC',        'Wharton Undergraduate Consulting Club', 'Club'),
('GRC',         'Global Research and Consulting',        'Club'),
('WUHC',        'Wharton Undergraduate Healthcare Club', 'Club'),
('MUSE',        'MUSE Consulting',                       'Club'),
('PL',          'Penn Labs',                             'Club'),
('PennApps',    'PennApps Hackathon',                    'Club'),
('DSG',         'Data Science Group',                    'Club'),
('PB',          'Penn Blockchain',                       'Club'),
('PEC',         'Penn Entrepreneurship Club',            'Club'),
('WTH',         'Weiss Tech House',                      'Club'),
('PMF',         'Penn Microfinance',                     'Club'),
('SWS',         'Smart Woman Securities',                'Club'),
('180DC',       '180 Degrees Consulting',                'Club'),
('WA',          'Wharton Alliance',                      'Club'),
('PDS',         'Penn Debate Society',                   'Club'),
('PMUN',        'Penn Model UN',                         'Club'),
('DP',          'Daily Pennsylvanian',                   'Club'),
('34th Street', '34th Street Magazine',                  'Club'),
('M&W',         'Mask & Wig',                            'Club'),
('Bloomers',    'Bloomers Comedy Group',                 'Club'),
('PEMS',        'Penn EMS',                              'Club'),
('PPMA',        'Penn Pre-Medical Association',          'Club'),
('PVC',         'Penn Volunteer Corps',                  'Club'),
('CH',          'Civic House',                           'Club'),
('PNSA',        'Penn Nigerian Students Association',    'Club'),
('BSL',         'Black Student League',                  'Club'),
('OPA',         'Orientation Peer Advising',             'Club'),
('KKS',         'Kite & Key Society',                    'Club'),
('PTC',         'Penn Traditions Council',               'Club'),
('UMC',         'United Minorities Council',             'Club'),
('AHDC',        'Arts House Dance Company',              'Club'),
('PADT',        'Pan-Asian Dance Troupe',                'Club'),
('PDC',         'Penn Dance Company',                    'Club'),
('ODY',         'Onda Latina Dance Group',               'Club'),
('BHY',         'BodyHype Dance Crew',                   'Club'),
('PRR',         'Penn Raas',                             'Club'),
('CG',          'Counterparts A Cappella',               'Club'),
('OTB',         'Off The Beat A Cappella',               'Club'),
('PMS',         'Penn Masala A Cappella',                'Club'),
('PGC',         'Penn Glee Club',                        'Club'),
('PP',          'Penn Players',                          'Club'),
('PAB',         'Penn Alternative Breaks',               'Club'),
('PLV',         'Penn Leads the Vote',                   'Club'),
('PRH',         'Penn Reflect',                          'Club');
