// All scoring logic lives here. Edit weights or formulas without touching other files.

// ── Rank system ───────────────────────────────────────────────────────────────

export interface RankInfo {
  name: string
  tier: number
  color: string
  minScore: number
  nextScore: number | null
}

// Tuned for the additive Ascend Score (each workout adds ~6–10 pts, rest +2).
// Early ranks are dense so new users see progress quickly; later ranks widen so
// the top tiers stay meaningful for long-term lifters (Ascendant ≈ 3+ years).
export const RANKS: RankInfo[] = [
  { tier: 1,  name: 'Entrant',     color: '#6B7280', minScore: 0,    nextScore: 50    },
  { tier: 2,  name: 'Initiate',    color: '#B45309', minScore: 50,   nextScore: 150   },
  { tier: 3,  name: 'Rookie',      color: '#D97706', minScore: 150,  nextScore: 350   },
  { tier: 4,  name: 'Focused',     color: '#9CA3AF', minScore: 350,  nextScore: 600   },
  { tier: 5,  name: 'Consistent',  color: '#D1D5DB', minScore: 600,  nextScore: 900   },
  { tier: 6,  name: 'Proven',      color: '#FBBF24', minScore: 900,  nextScore: 1300  },
  { tier: 7,  name: 'Established', color: '#F59E0B', minScore: 1300, nextScore: 1800  },
  { tier: 8,  name: 'Prime',       color: '#FDE68A', minScore: 1800, nextScore: 2500  },
  { tier: 9,  name: 'Elite',       color: '#E2E8F0', minScore: 2500, nextScore: 3500  },
  { tier: 10, name: 'Leader',      color: '#F472B6', minScore: 3500, nextScore: 5000  },
  { tier: 11, name: 'Premier',     color: '#A78BFA', minScore: 5000, nextScore: 7000  },
  { tier: 12, name: 'Ascendant',   color: 'accent',  minScore: 7000, nextScore: null  },
]

export function getRankInfo(ascendScore: number): RankInfo {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (ascendScore >= RANKS[i].minScore) return RANKS[i]
  }
  return RANKS[0]
}

export function getRankProgress(ascendScore: number, rank: RankInfo): number {
  if (rank.nextScore === null) return 1
  const range = rank.nextScore - rank.minScore
  if (range <= 0) return 1
  return Math.min((ascendScore - rank.minScore) / range, 1)
}

// ── Level system ──────────────────────────────────────────────────────────────

export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500]

export const LEVEL_NAMES = [
  'Newcomer', 'Trainee', 'Athlete', 'Competitor',
  'Champion', 'Elite', 'Legend', 'Titan', 'Ascendant', 'Apex',
]

export function getLevelName(level: number): string {
  return LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] ?? 'Apex'
}

export function getLevelFromXP(xp: number): number {
  let lvl = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) lvl = i + 1
    else break
  }
  return lvl
}

export function getXPProgress(xp: number, level: number): { current: number; needed: number; fraction: number } {
  const floor = LEVEL_THRESHOLDS[Math.min(level - 1, LEVEL_THRESHOLDS.length - 1)] ?? 0
  const ceiling = LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  const current = xp - floor
  const needed = ceiling - floor
  return { current, needed, fraction: Math.min(current / needed, 1) }
}

export function calculateXPGain(exercisesCompleted: number, newPRCount: number, isFirstWorkout: boolean): number {
  return 50 + exercisesCompleted * 5 + newPRCount * 15 + (isFirstWorkout ? 50 : 0)
}

export const SCORE_WEIGHTS = {
  strength: 0.35,
  consistency: 0.35,
  social: 0.20,
  streak: 0.10,
} as const

// Validate weights always sum to 1.0
const weightSum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
if (Math.abs(weightSum - 1.0) > 0.001) {
  console.error(`SCORE_WEIGHTS must sum to 1.0, currently ${weightSum}`)
}

const WEEKLY_TARGET = 5   // 5 sessions/week
const REST_DAYS_ALLOWED = 2 // off days per week with zero penalty

// IPF GL formula constants
const IPF_GL_COEFFICIENTS = {
  male:   { a: 1236.25115, b: 1449.21864, c: 0.01644 },
  female: { a: 758.63878,  b: 949.31382,  c: 0.02098 },
}

/**
 * IPF GL points — normalizes lifted weight against bodyweight.
 * @param totalLifted  Total weight lifted in kg
 * @param bodyweight   Lifter's bodyweight in kg
 * @param sex          'male' | 'female'
 */
export function calculateStrengthScore(
  totalLifted: number,
  bodyweight: number,
  sex: 'male' | 'female' = 'male'
): number {
  if (bodyweight <= 0 || totalLifted <= 0) return 0
  const { a, b, c } = IPF_GL_COEFFICIENTS[sex]
  const denominator = a - b * Math.exp(-c * bodyweight)
  if (denominator <= 0) return 0
  const points = 100 * (totalLifted / denominator)
  return Math.min(Math.round(points), 100)
}

/**
 * Calculate strength score from a user's best weights per exercise.
 * Converts lb → kg, applies IPF GL to each lift, averages the top 5 results.
 * Returns 0 if no weight has been logged.
 * @param logs           Array of { weight } in pounds
 * @param bodyweight_kg  Lifter's bodyweight in kg (use a sensible default if unknown)
 * @param sex            'male' | 'female'
 */
export function calculateStrengthScoreFromLogs(
  logs: { weight: number }[],
  bodyweight_kg: number,
  sex: 'male' | 'female' = 'male'
): number {
  if (logs.length === 0 || bodyweight_kg <= 0) return 0
  const LB_TO_KG = 0.453592
  const scores = logs
    .map(l => calculateStrengthScore(l.weight * LB_TO_KG, bodyweight_kg, sex))
    .filter(s => s > 0)
    .sort((a, b) => b - a)
    .slice(0, 5)
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

/**
 * Consistency score: pace-based weekly model with 2 free rest days.
 * Score stays at 100% as long as you're on pace after accounting for
 * the 2 allowed rest days. Penalty only kicks in beyond that.
 * @param workoutsThisWeek  Completed workouts since Monday 00:00 local time
 */
export function calculateConsistencyScore(workoutsThisWeek: number): number {
  const dayOfWeek = new Date().getDay() // 0=Sun,1=Mon,...,6=Sat
  const weekdayIndex = dayOfWeek === 0 ? 7 : dayOfWeek // Sun → 7
  const expectedByNow = Math.max(0, Math.min(weekdayIndex - REST_DAYS_ALLOWED, WEEKLY_TARGET))
  if (expectedByNow <= 0) return 100
  return Math.min(Math.round((workoutsThisWeek / expectedByNow) * 100), 100)
}

function getStreakBonus(streakDays: number): number {
  if (streakDays >= 30) return 20
  if (streakDays >= 14) return 10
  if (streakDays >= 7) return 5
  return 0
}

/**
 * @deprecated Snapshot weighted score — kept only for backfill / legacy callers.
 * Live writes go through `calculateAscendScoreGain` (additive lifetime model).
 */
export function calculateAscendScore(
  strengthScore: number,
  consistencyScore: number,
  socialScore: number,
  streakDays: number = 0
): number {
  // Normalize streakDays to 0–100 (30 days = 100) for the weighted component
  const streakScore = Math.min(Math.round(streakDays * (100 / 30)), 100)
  const weighted = Math.round(
    strengthScore    * SCORE_WEIGHTS.strength +
    consistencyScore * SCORE_WEIGHTS.consistency +
    socialScore      * SCORE_WEIGHTS.social +
    streakScore      * SCORE_WEIGHTS.streak
  )
  return weighted + getStreakBonus(streakDays)
}

/**
 * Per-entry Ascend Score gain — the additive model.
 * Each completed workout adds roughly 6–10 points to a user's lifetime Ascend
 * Score, with the breakdown skewed toward consistency, streak, and community
 * engagement (strength only contributes via PRs). Rest days earn a small flat
 * bump so honest logging is rewarded without incentivizing rest spam.
 *
 * Typical gains:
 *   Casual session  (3 wk, 4-day streak, social 20, 0 PR) → ~6
 *   Steady session  (5 wk, 10-day streak, social 40, 0 PR) → ~8
 *   PR + long streak (5 wk, 30-day streak, social 60, 1 PR) → ~11
 *   Rest day → 2
 */
export interface AscendScoreGain {
  total: number
  parts: {
    base: number
    streak: number
    consistency: number
    social: number
    pr: number
  }
}

export function calculateAscendScoreGain(params: {
  source: 'workout' | 'rest'
  workoutsThisWeek: number      // completed sessions Mon→now, including the current one
  streakDays: number            // streak length after this entry
  socialScore: number           // current social_score, 0–100
  newPRsCount?: number          // PRs hit in this session (default 0)
}): AscendScoreGain {
  const { source, workoutsThisWeek, streakDays, socialScore, newPRsCount = 0 } = params

  if (source === 'rest') {
    return { total: 2, parts: { base: 2, streak: 0, consistency: 0, social: 0, pr: 0 } }
  }

  const base = 4
  // Streak — caps at 30 days (3 pts)
  const streak = Math.min(Math.round(streakDays * 0.1 * 10) / 10, 3)
  // Consistency — partial credit at 3/week, full credit at 5/week
  const consistency = workoutsThisWeek >= 5 ? 2 : workoutsThisWeek >= 3 ? 1 : 0
  // Social — scales linearly with current social_score
  const social = Math.round(Math.min((socialScore / 100) * 2, 2) * 10) / 10
  // PR — strength's only per-workout contribution
  const pr = newPRsCount * 1.5

  const total = Math.round((base + streak + consistency + social + pr) * 10) / 10
  return { total, parts: { base, streak, consistency, social, pr } }
}

// ── Calorie estimation ───────────────────────────────────────────────────────
// Uses the ACSM formula (kcal/min = MET × kg × 3.5 / 200) on an "effective"
// time floor so the estimate stays sane when users click through quickly or
// log a workout after the fact.

const DEFAULT_BODYWEIGHT_KG = 75   // ~165 lb fallback when no profile data
const MINUTES_PER_SET = 1.5        // ~30s work + ~60s rest (incl. setup/warmup overhead)
const DEFAULT_MET = 5.5            // moderate resistance training

// Parse the freeform onboarding weight string ("165", "165 lbs", "75kg").
// Heuristic: if no unit and the number is ≥ 100, treat as lb; otherwise kg.
export function parseBodyWeightKg(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined
  const normalized = raw.toLowerCase().trim()
  const num = parseFloat(normalized.replace(/[^\d.]/g, ''))
  if (isNaN(num) || num <= 0) return undefined
  if (normalized.includes('kg')) return num
  if (normalized.includes('lb')) return num * 0.453592
  return num >= 100 ? num * 0.453592 : num
}

// Map a class workout's intensity tag → MET.
export function metFromClassIntensity(intensity: 'easy' | 'moderate' | 'intense' | string): number {
  if (intensity === 'easy')    return 4
  if (intensity === 'intense') return 7
  return 5.5
}

// Map an average RPE (1–10 scale) to a resistance-training MET.
// RPE 5 → ~4.5,  RPE 7 → ~5.5,  RPE 8 → ~6,  RPE 9+ → ~6.5+
export function metFromRpe(avgRpe: number): number {
  if (avgRpe <= 0) return DEFAULT_MET
  return Math.max(4, Math.min(7.5, 3 + avgRpe * 0.4))
}

export function estimateCalories(opts: {
  actualMinutes: number
  totalSets: number
  bodyWeightKg?: number
  met?: number           // explicit MET (e.g., from class intensity or RPE)
}): number {
  const bodyKg = opts.bodyWeightKg && opts.bodyWeightKg > 0 ? opts.bodyWeightKg : DEFAULT_BODYWEIGHT_KG
  const effectiveMinutes = Math.max(opts.actualMinutes || 0, opts.totalSets * MINUTES_PER_SET)
  const met = opts.met && opts.met > 0 ? opts.met : DEFAULT_MET
  return Math.round(effectiveMinutes * (met * bodyKg * 3.5) / 200)
}
