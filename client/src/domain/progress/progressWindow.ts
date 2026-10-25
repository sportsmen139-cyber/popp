import type { ProgressPeriodWeeks, ProgressWindow } from '../../types/progressAnalytics'
import type { WorkoutSessionResult } from '../../types/workoutSession'

/** Local calendar weeks start Monday. Calendar arithmetic also handles DST. */
export function startOfProgressWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - (result.getDay() + 6) % 7)
  return result
}

export function buildProgressWindow(weeks: ProgressPeriodWeeks, now: Date): ProgressWindow {
  if (![4, 8, 12].includes(weeks) || !Number.isFinite(now.getTime())) {
    throw new RangeError('Progress requires a valid date and a 4/8/12 week period')
  }
  const currentWeekStart = startOfProgressWeek(now)
  const start = new Date(currentWeekStart)
  start.setDate(start.getDate() - (weeks - 1) * 7)
  return { weeks, start, end: new Date(now), currentWeekStart }
}

export function validCompletedHistory(history: readonly WorkoutSessionResult[], end: Date): WorkoutSessionResult[] {
  if (!Array.isArray(history)) return []
  return history.filter(session => {
    const time = typeof session?.completedAt === 'string' ? Date.parse(session.completedAt) : NaN
    return Number.isFinite(time) && time <= end.getTime()
  }).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
}

export function historyInProgressWindow(history: readonly WorkoutSessionResult[], window: ProgressWindow): WorkoutSessionResult[] {
  return validCompletedHistory(history, window.end)
    .filter(session => Date.parse(session.completedAt) >= window.start.getTime())
}
