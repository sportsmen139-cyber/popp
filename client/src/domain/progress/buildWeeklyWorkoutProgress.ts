import type { ProgressWindow, WeeklyWorkoutProgress } from '../../types/progressAnalytics'
import type { WorkoutSessionResult } from '../../types/workoutSession'
import { historyInProgressWindow, startOfProgressWeek } from './progressWindow'

export function buildWeeklyWorkoutProgress(input: {
  history: readonly WorkoutSessionResult[]
  window: ProgressWindow
  daysPerWeek?: number
}): WeeklyWorkoutProgress[] {
  const counts = new Map<number, number>()
  for (const session of historyInProgressWindow(input.history, input.window)) {
    const key = startOfProgressWeek(new Date(session.completedAt)).getTime()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const days = input.daysPerWeek
  const target = typeof days === 'number' && Number.isInteger(days) && days > 0 && days <= 7 ? days : undefined
  return Array.from({ length: input.window.weeks }, (_, index) => {
    const date = new Date(input.window.start)
    date.setDate(date.getDate() + index * 7)
    return {
      weekStart: date.toISOString(),
      label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      completed: counts.get(date.getTime()) ?? 0,
      currentPlanTarget: target,
      isCurrentWeek: date.getTime() === input.window.currentWeekStart.getTime(),
    }
  })
}
