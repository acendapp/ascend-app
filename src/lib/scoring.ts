// All scoring logic lives here. Edit weights or formulas without touching other files.

export const SCORE_WEIGHTS = {
  strength: 0.40,
  consistency: 0.40,
  social: 0.20,
} as const

// Validate weights always sum to 1.0
const weightSum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)
if (Math.abs(weightSum - 1.0) > 0.001) {
  console.error(`SCORE_WEIGHTS must sum to 1.0, currently ${weightSum}`)
}

const DEFAULT_WEEKLY_TARGET = 4

// IPF GL formula constants
const IPF_GL_COEFFICIENTS = {
  male:   { a: 1236.25115, b: 1449.21864, c: 0.01644 },
  female: { a: 758.63878,  b: 949.31382,  c: 0.02098 },
}

/**
 * IPF GL points — normalizes lifted weight against bodyweight.
 * A lighter lifter lifting proportionally heavy scores the same as a heavier lifter.
 * @param totalLifted  Total weight lifted in kg (e.g. squat + bench + deadlift)
 * @param bodyweight   Lifter's bodyweight in kg
 * @param sex          'male' | 'female' (defaults to 'male' for now)
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
 * Consistency score: (workouts completed this week / target) * 100, capped at 100.
 * @param completedThisWeek  Number of workouts logged in the current 7-day window
 * @param weeklyTarget       Target workouts per week (default 4)
 */
export function calculateConsistencyScore(
  completedThisWeek: number,
  weeklyTarget: number = DEFAULT_WEEKLY_TARGET
): number {
  if (weeklyTarget <= 0) return 0
  return Math.min(Math.round((completedThisWeek / weeklyTarget) * 100), 100)
}

/**
 * Ascend Score: weighted combination of all three sub-scores (each 0–100).
 * Weights are read from SCORE_WEIGHTS above — change there, propagates everywhere.
 */
export function calculateAscendScore(
  strengthScore: number,
  consistencyScore: number,
  socialScore: number
): number {
  return Math.round(
    strengthScore  * SCORE_WEIGHTS.strength +
    consistencyScore * SCORE_WEIGHTS.consistency +
    socialScore    * SCORE_WEIGHTS.social
  )
}
