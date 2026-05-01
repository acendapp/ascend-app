-- Seed two always-live rolling monthly challenges.
-- Re-run at the start of each month to reset dates, or set up a pg_cron job:
--   SELECT cron.schedule('monthly-challenges', '0 0 1 * *', $$<this script>$$);

INSERT INTO challenges (id, title, description, challenge_type, start_date, end_date)
VALUES
  (
    gen_random_uuid(),
    'Penn Volume King',
    'Lift the most total weight this month. Sets × reps × weight counts.',
    'most_volume',
    date_trunc('month', now()),
    (date_trunc('month', now()) + interval '1 month' - interval '1 second')
  ),
  (
    gen_random_uuid(),
    'Consistency King',
    'Complete the most workouts this month. Every session counts toward your rank.',
    'most_workouts',
    date_trunc('month', now()),
    (date_trunc('month', now()) + interval '1 month' - interval '1 second')
  )
ON CONFLICT DO NOTHING;
