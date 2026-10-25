import { describe, expect, it } from 'vitest'
import { buildProgressWindow } from './progressWindow'
import { buildWeeklyWorkoutProgress } from './buildWeeklyWorkoutProgress'
import { progressDate, progressNow, recordedSession } from './progress.fixtures'

describe('weekly workout progress', () => {
  it('returns empty recorded weeks without fabricating completed workouts or a target', () => {
    const weeks = buildWeeklyWorkoutProgress({ history: [], window: buildProgressWindow(12, progressNow) })
    expect(weeks).toHaveLength(12)
    expect(weeks.every(week => week.completed === 0 && week.currentPlanTarget === undefined)).toBe(true)
    expect(weeks.at(-1)?.isCurrentWeek).toBe(true)
  })

  it('groups by local Monday boundaries, preserves zero weeks and sorts chronologically', () => {
    const history = [recordedSession(progressDate(10, 20)), recordedSession(progressDate(10, 12, 0)), recordedSession(progressDate(10, 11, 23))]
    const weeks = buildWeeklyWorkoutProgress({ history, window: buildProgressWindow(4, progressNow), daysPerWeek: 3 })
    expect(weeks.map(week => week.completed)).toEqual([0, 1, 1, 1])
    expect(weeks.map(week => new Date(week.weekStart).getDate())).toEqual([28, 5, 12, 19])
    expect(weeks.every(week => new Date(week.weekStart).getDay() === 1)).toBe(true)
    expect(weeks.every(week => week.currentPlanTarget === 3)).toBe(true)
  })

  it.each([[4, 2], [8, 3], [12, 4]] as const)('filters the %s week period without changing history', (period, expected) => {
    const history = [8, 9, 10].map(month => recordedSession(progressDate(month, month === 8 ? 10 : 7)))
    history.push(recordedSession(progressDate(10, 20)))
    const before = structuredClone(history)
    const weeks = buildWeeklyWorkoutProgress({ history, window: buildProgressWindow(period, progressNow) })
    expect(weeks).toHaveLength(period)
    expect(weeks.reduce((sum, week) => sum + week.completed, 0)).toBe(expected)
    expect(history).toEqual(before)
  })

  it('includes exact period start/now, excluding earlier, future and invalid dates', () => {
    const window = buildProgressWindow(4, progressNow)
    const history = [window.start.toISOString(), window.end.toISOString(),
      new Date(window.start.getTime() - 1).toISOString(), new Date(window.end.getTime() + 1).toISOString(), 'bad-date']
      .map(date => recordedSession(date))
    expect(buildWeeklyWorkoutProgress({ history, window }).map(week => week.completed)).toEqual([1, 0, 0, 1])
  })

  it('counts completed session records even without set details and does not cap at the current target', () => {
    const history = Array.from({ length: 4 }, (_, i) => ({ ...recordedSession(progressDate(10, 19 + i)), exercises: [] }))
    expect(buildWeeklyWorkoutProgress({ history, window: buildProgressWindow(4, progressNow), daysPerWeek: 3 }).at(-1)).toMatchObject({ completed: 4, currentPlanTarget: 3 })
  })

  it('ignores an invalid target rather than inventing a weekly plan', () => {
    expect(buildWeeklyWorkoutProgress({ history: [], window: buildProgressWindow(4, progressNow), daysPerWeek: 0 })[0].currentPlanTarget).toBeUndefined()
  })

  it('does not mutate now and rejects invalid window inputs', () => {
    const before = progressNow.getTime()
    buildProgressWindow(12, progressNow)
    expect(progressNow.getTime()).toBe(before)
    expect(() => buildProgressWindow(4, new Date('invalid'))).toThrow(RangeError)
  })
})
