// All scoring logic lives here. Edit weights or formulas without touching other files.

// ── Rank system ───────────────────────────────────────────────────────────────

export interface RankInfo {
  name: string
  tier: number
  color: string
  minScore: number
  nextScore: number | null
}

export const RANKS: RankInfo[] = [
  { tier: 1,  name: 'Unranked',   color: '#6B7280', minScore: 0,   nextScore: 30  },
  { tier: 2,  name: 'Initiate',   color: '#B45309', minScore: 30,  nextScore: 42  },
  { tier: 3,  name: 'Contender',  color: '#D97706', minScore: 42,  nextScore: 52  },
  { tier: 4,  name: 'Competitor', color: '#9CA3AF', minScore: 52,  nextScore: 61  },
  { tier: 5,  name: 'Proven',     color: '#D1D5DB', minScore: 61,  nextScore: 68  },
  { tier: 6,  name: 'Elite',      color: '#FBBF24', minScore: 68,  nextScore: 74  },
  { tier: 7,  name: 'Vanguard',   color: '#F59E0B', minScore: 74,  nextScore: 80  },
  { tier: 8,  name: 'Titan',      color: '#FDE68A', minScore: 80,  nextScore: 85  },
  { tier: 9,  name: 'Apex',       color: '#E2E8F0', minScore: 85,  nextScore: 90  },
  { tier: 10, name: 'Immortal',   color: '#F472B6', minScore: 90,  nextScore: 95  },
  { tier: 11, name: 'Ascendant',  color: '#A78BFA', minScore: 95,  nextScore: 100 },
  { tier: 12, name: 'Sovereign',  color: 'accent',  minScore: 100, nextScore: null },
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
 * Ascend Score: weighted combination of all four sub-scores plus a streak bonus.
 * Streak contributes both as a weighted component (0–100 normalized) and a flat bonus.
 * The bonus can push the final score above 100.
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
