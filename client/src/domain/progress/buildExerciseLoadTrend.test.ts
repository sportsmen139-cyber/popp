import { describe, expect, it } from 'vitest'
import { buildExerciseLoadTrend } from './buildExerciseLoadTrend'
import { buildProgressWindow } from './progressWindow'
import { progressDate, progressNow, recordedSession } from './progress.fixtures'

const window = buildProgressWindow(4, progressNow)
const set = (setNumber: number, weightKg?: number, reps = 10) => ({ setNumber, weightKg, reps })

describe('exercise load trend', () => {
  it('has explicit empty/insufficient states without invented points', () => {
    expect(buildExerciseLoadTrend({ history: [], window, exerciseId: null })).toEqual({ exerciseId: null, status: 'no_exercise', points: [], comparableChange: null })
    expect(buildExerciseLoadTrend({ history: [], window, exerciseId: 'squat' })).toMatchObject({ status: 'insufficient_history', points: [], comparableChange: null })
  })

  it('uses all set weights for a single exercise, sorted by completion date, not the last/max set', () => {
    const history = [recordedSession(progressDate(10, 15), 'squat', [set(2, 70), set(1, 80)]), recordedSession(progressDate(10, 8), 'squat', [set(1, 60), set(2, 50)])]
    const before = structuredClone(history)
    const result = buildExerciseLoadTrend({ history, window, exerciseId: 'squat' })
    expect(result.status).toBe('ready')
    expect(result.points.map(point => point.averageWeightKg)).toEqual([55, 75])
    expect(result.points[0]).toMatchObject({ minWeightKg: 50, maxWeightKg: 60, totalSets: 2, recordedSets: 2 })
    expect(result.comparableChange).toEqual({ fromKg: 55, toKg: 75, deltaKg: 20 })
    expect(history).toEqual(before)
  })

  it('never mixes different exercises, even within the same workout', () => {
    const first = recordedSession(progressDate(10, 8), 'squat', [set(1, 60)])
    first.exercises.push({ exerciseId: 'bench', sets: [set(1, 200)] })
    const history = [first, recordedSession(progressDate(10, 15), 'bench', [set(1, 300)]), recordedSession(progressDate(10, 20), 'squat', [set(1, 65)])]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' }).points.map(point => point.averageWeightKg)).toEqual([60, 65])
  })

  it('keeps missing/partial weight records as null gaps and never substitutes zero', () => {
    const history = [recordedSession(progressDate(10, 1)), recordedSession(progressDate(10, 8), 'squat', [set(1, 60), set(2)]), recordedSession(progressDate(10, 15))]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' }).points.map(point => point.averageWeightKg)).toEqual([60, null, 60])
  })

  it('does not draw a trend for bodyweight/weightless logs without recorded weights', () => {
    const history = [recordedSession(progressDate(10, 8), 'squat', [set(1)]), recordedSession(progressDate(10, 15), 'squat', [set(1)])]
    const result = buildExerciseLoadTrend({ history, window, exerciseId: 'squat' })
    expect(result.status).toBe('insufficient_history')
    expect(result.points.every(point => point.averageWeightKg === null)).toBe(true)
  })

  it('accepts explicit zero weight as a real value', () => {
    const history = [recordedSession(progressDate(10, 8), 'squat', [set(1, 0)]), recordedSession(progressDate(10, 15), 'squat', [set(1, 0)])]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' }).points.map(point => point.averageWeightKg)).toEqual([0, 0])
  })

  it.each([NaN, Infinity, -1])('rejects invalid weight %s as missing data', weight => {
    const result = buildExerciseLoadTrend({ history: [recordedSession(progressDate(10, 8), 'squat', [set(1, weight)])], window, exerciseId: 'squat' })
    expect(result.points[0].averageWeightKg).toBeNull()
  })

  it('rejects missing reps, zero reps and duplicate set numbers without creating performance', () => {
    const history = [recordedSession(progressDate(10, 1), 'squat', [{ setNumber: 1, weightKg: 60 }]),
      recordedSession(progressDate(10, 8), 'squat', [set(1, 60, 0)]),
      recordedSession(progressDate(10, 15), 'squat', [set(1, 60), set(1, 60)])]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' }).points.every(point => point.averageWeightKg === null)).toBe(true)
  })

  it.each([
    [set(1, 65, 8), set(2, 65, 8)],
    [set(1, 65)],
    [set(1, 70), set(2, 50)],
  ])('does not assert comparable load change when sets/reps/directions differ: %j', (...sets) => {
    const history = [recordedSession(progressDate(10, 8)), recordedSession(progressDate(10, 15), 'squat', sets)]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' }).comparableChange).toBeNull()
  })

  it('does not report stale change if the latest exercise record is incomplete', () => {
    const history = [recordedSession(progressDate(10, 1)), recordedSession(progressDate(10, 8)), recordedSession(progressDate(10, 15), 'squat', [set(1)])]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' })).toMatchObject({ status: 'ready', comparableChange: null })
  })

  it('filters old, invalid and future sessions and requires distinct timestamps', () => {
    const history = [recordedSession(progressDate(8, 1)), recordedSession('invalid'), recordedSession(progressDate(10, 26)), recordedSession(progressDate(10, 8)), recordedSession(progressDate(10, 8))]
    expect(buildExerciseLoadTrend({ history, window, exerciseId: 'squat' })).toMatchObject({ status: 'insufficient_history', points: [{ averageWeightKg: 60 }, { averageWeightKg: 60 }] })
  })
})
