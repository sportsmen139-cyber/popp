import { describe, expect, it } from 'vitest'
import type { WorkoutSessionResult } from '../../types/workoutSession'
import { buildProgressSummary } from './buildProgressSummary'
import { progressDate, progressNow, recordedSession } from './progress.fixtures'

const base = { now: progressNow, periodWeeks: 4 as const, exerciseCatalog: [{ id: 'squat', name: 'Приседания' }, { id: 'bench', name: 'Жим' }] }

describe('progress summary', () => {
  it('returns honest empty states and no coach/load/weight inventions', () => {
    expect(buildProgressSummary({ ...base, history: [] })).toMatchObject({
      workoutCount: 0, lastWorkoutAt: null, goalLabel: 'Цель не выбрана', exerciseOptions: [],
      selectedExerciseId: null, loadTrend: { status: 'no_exercise' }, insights: [], weightHistory: { status: 'not_available', entries: [] },
    })
  })

  it('uses period counts but the actual latest recorded workout across all history', () => {
    const result = buildProgressSummary({ ...base, history: [recordedSession(progressDate(8, 10))], goal: { goalType: 'hypertrophy', target: { type: 'muscle_group', id: 'glutes' }, priority: 'high' } })
    expect(result.workoutCount).toBe(0)
    expect(result.lastWorkoutAt).toBe(progressDate(8, 10))
    expect(result.goalLabel).toBe('Рост мышц · ягодицы')
    expect(result.insights).toEqual([])
  })

  it('defaults to an exercise with usable history and respects an explicit different selection', () => {
    const history = [recordedSession(progressDate(10, 1)), recordedSession(progressDate(10, 8)), recordedSession(progressDate(10, 15), 'bench')]
    expect(buildProgressSummary({ ...base, history }).selectedExerciseId).toBe('squat')
    const selected = buildProgressSummary({ ...base, history, selectedExerciseId: 'bench' })
    expect(selected.selectedExerciseName).toBe('Жим')
    expect(selected.loadTrend.status).toBe('insufficient_history')
  })

  it('does not infer gaps/consistency from weeks before a first record or the ongoing week', () => {
    const result = buildProgressSummary({ ...base, periodWeeks: 12, history: [recordedSession(progressDate(10, 20))] })
    expect(result.insights).toEqual([])
  })

  it('describes recorded full-week consistency without a strength score or invented schedule', () => {
    const history = [progressDate(8, 10), progressDate(10, 1), progressDate(10, 8), progressDate(10, 15)].map(date => recordedSession(date))
    const result = buildProgressSummary({ ...base, history })
    expect(result.insights.some(insight => insight.id === 'consistent_records')).toBe(true)
    expect(result).not.toHaveProperty('strengthScore')
  })

  it('describes weeks without records without claiming confirmed skipped workouts', () => {
    const result = buildProgressSummary({ ...base, history: [recordedSession(progressDate(8, 10)), recordedSession(progressDate(10, 20))], daysPerWeek: 3 })
    const gaps = result.insights.find(insight => insight.id === 'weeks_without_records')
    expect(gaps?.message).toContain('нет сохранённых тренировок')
    expect(gaps?.message).toContain('не подтверждённые пропуски')
  })

  it('reuses existing Coach Memory only from sorted records in the selected period', () => {
    const history = [1, 5, 8, 12, 15].map<WorkoutSessionResult>(day => ({
      ...recordedSession(progressDate(10, day)),
      sessionContext: {
        checkIn: { feeling: 'tired', hasTrainingIssue: false, symptoms: [], sleepQuality: 'poor' },
        adaptation: { offered: false, accepted: false, actions: [] },
      },
    })).reverse()
    const before = structuredClone(history)
    const result = buildProgressSummary({ ...base, history })
    expect(result.insights.some(insight => insight.id === 'coach_frequent_fatigue')).toBe(true)
    expect(result.insights.some(insight => insight.id === 'coach_frequent_poor_sleep')).toBe(true)
    expect(buildProgressSummary({ ...base, now: new Date(2027, 3, 10), history }).insights).toEqual([])
    expect(history).toEqual(before)
  })

  it('falls back from an exercise outside the selected period and ignores invalid/future dates', () => {
    const result = buildProgressSummary({ ...base, selectedExerciseId: 'bench', history: [
      recordedSession(progressDate(8, 10), 'bench'), recordedSession(progressDate(10, 8)), recordedSession('bad-date'), recordedSession(progressDate(10, 26)),
    ] })
    expect(result.workoutCount).toBe(1)
    expect(result.lastWorkoutAt).toBe(progressDate(10, 8))
    expect(result.selectedExerciseId).toBe('squat')
    expect(result.exerciseOptions).toEqual([{ id: 'squat', name: 'Приседания' }])
  })
})
