// Canonical display names for stored enum values.
// Edit here — renders everywhere automatically.

export const GOAL_LABELS: Record<string, string> = {
  muscle:   'Build Muscle & Size',
  strength: 'Get Stronger',
  lean:     'Get Lean',
  athletic: 'Build Athleticism',
}

export const EXPERIENCE_LABELS: Record<string, string> = {
  beginner:    'Brand New',
  some:        'On and Off',
  consistent:  'Consistent',
  experienced: 'Experienced',
}

export const EQUIPMENT_LABELS: Record<string, string> = {
  gym:        'Full Gym',
  bodyweight: 'Bodyweight',
  both:       'Both',
}

export const SCHOOL_YEAR_OPTIONS = [
  { value: 'Freshman',  label: 'Freshman' },
  { value: 'Sophomore', label: 'Sophomore' },
  { value: 'Junior',    label: 'Junior' },
  { value: 'Senior',    label: 'Senior' },
]

export const GOAL_OPTIONS = Object.entries(GOAL_LABELS).map(([value, label]) => ({ value, label }))
export const EXPERIENCE_OPTIONS = Object.entries(EXPERIENCE_LABELS).map(([value, label]) => ({ value, label }))
export const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_LABELS).map(([value, label]) => ({ value, label }))

export function displayGoal(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return GOAL_LABELS[value] ?? value
}

export function displayExperience(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return EXPERIENCE_LABELS[value] ?? value
}

export function displayEquipment(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return EQUIPMENT_LABELS[value] ?? value
}
