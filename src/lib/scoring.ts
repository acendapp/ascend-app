// All scoring logic lives here. Edit weights or formulas without touching other files.

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

const MONTHLY_TARGET = 16 // 4 sessions/week × 4 weeks

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
 * Consistency score: (workouts in last 30 days / 16 target) * 100, capped at 100.
 * @param completed30Days  Number of completed workouts in the last 30-day window
 * @param monthlyTarget    Target workouts per 30 days (default 16 = 4/week × 4 weeks)
 */
export function calculateConsistencyScore(
  completed30Days: number,
  monthlyTarget: number = MONTHLY_TARGET
): number {
  if (monthlyTarget <= 0) return 0
  return Math.min(Math.round((completed30Days / monthlyTarget) * 100), 100)
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
