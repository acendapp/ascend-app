import { supabase } from './supabase'
import { getRankInfo } from './scoring'

export type EventType = 'workout' | 'pr' | 'checkin' | 'streak' | 'rank'

export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 90, 100, 180, 365]

export function isStreakMilestone(days: number): boolean {
  return STREAK_MILESTONES.includes(days)
}

export async function logActivity(opts: {
  userId: string
  eventType: EventType
  title: string
  subtitle?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.from('activity_events').insert({
      user_id:    opts.userId,
      event_type: opts.eventType,
      title:      opts.title,
      subtitle:   opts.subtitle ?? null,
      metadata:   opts.metadata ?? {},
    })
  } catch (err) {
    console.error('logActivity failed:', err)
  }
}

// Records the ascend-score delta a workout produced, so weekly-gain
// leaderboards can sum score_change over a time window.
export async function recordScoreChange(workoutId: string, delta: number): Promise<void> {
  try {
    await supabase.from('workouts').update({ score_change: delta }).eq('id', workoutId)
  } catch (err) {
    console.error('recordScoreChange failed:', err)
  }
}

export async function logCheckin(userId: string, gymName: string): Promise<void> {
  await Promise.all([
    logActivity({ userId, eventType: 'checkin', title: 'checked in', subtitle: gymName }),
    supabase.from('gym_checkins').insert({ user_id: userId, gym_name: gymName }),
  ])
}

// Call after score update — logs rank-up event if rank tier changed.
export async function maybeLogRankUp(
  userId: string,
  previousScore: number,
  newScore: number,
): Promise<void> {
  const prevTier = getRankInfo(previousScore).tier
  const newRank  = getRankInfo(newScore)
  if (newRank.tier > prevTier) {
    await logActivity({
      userId,
      eventType: 'rank',
      title: `reached ${newRank.name}`,
      subtitle: 'New rank achieved',
      metadata: { tier: newRank.tier, rank: newRank.name },
    })
  }
}
