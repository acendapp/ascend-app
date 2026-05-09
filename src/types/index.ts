export type Goal = 'muscle' | 'strength' | 'lean' | 'athletic'
export type Experience = 'beginner' | 'some' | 'consistent' | 'experienced'
export type Equipment = 'gym' | 'bodyweight' | 'both'

export interface OnboardingData {
  goal: Goal | null
  experience: Experience | null
  equipment: Equipment | null
}

export interface UserProfile {
  id: string
  email: string
  username: string
  name: string
  school: string
  goal: Goal | null
  experience_level: Experience | null
  equipment: Equipment | null
  school_year: string | null
  affiliation: string | null
  avatar_url: string | null
  gym_checkin_at: string | null
  created_at: string
  sex?: string
}

export interface UserScores {
  id: string
  user_id: string
  ascend_score: number
  strength_score: number
  consistency_score: number
  social_score: number
  xp: number
  level: number
  streak_days: number
}

export interface Exercise {
  name: string
  muscleGroup: string
  sets: number
  reps: number
  weight: number
  weightUnit: string
}

export interface Friendship {
  id: string
  requester_id: string
  recipient_id: string
  status: 'pending' | 'accepted'
  created_at: string
}

export interface FriendProfile {
  id: string
  name: string
  username: string
  avatar_url: string | null
  affiliation: string | null
}

export interface FriendshipWithProfile {
  id: string
  status: 'pending' | 'accepted'
  isRequester: boolean
  friend: FriendProfile
}

export interface PersonalRecord {
  id: string
  user_id: string
  exercise_name: string
  weight: number
  logged_at: string
}

export interface ActivityItem {
  id: string
  userId: string
  userName: string
  initials: string
  description: string
  time: string
  workoutId: string
  kudosCount: number
  userGaveKudos: boolean
  gymVerified?: boolean
}
