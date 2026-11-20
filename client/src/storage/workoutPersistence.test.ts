import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkoutSessionResult } from '../types/workoutSession'
import { loadOnboardingProfile, ONBOARDING_PROFILE_KEY } from './onboardingStorage'
import { loadUserProgress, USER_PROGRESS_KEY } from './progressStorage'
import { loadWorkoutHistory, WORKOUT_HISTORY_KEY } from './workoutHistoryStorage'
import { commitCompletion, loadApplicationState, prepareCompletion, saveWorkoutDraft, WORKOUT_DRAFT_KEY } from './workoutPersistence'
import type { WorkoutDraft } from './workoutPersistence'

let values: Map<string, string>

function draft(count = 0): WorkoutDraft {
  return {
    formatVersion: 1, stage: 'active', id: 'synthetic-draft', startedAt: '2026-11-20T09:00:00Z',
    profile: { environment: 'gym', daysPerWeek: 3, level: 'beginner',
      goal: { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' } },
    progress: { completedWorkoutsCount: count },
    workout: { templateId: 'synthetic-a', title: 'Тестовая тренировка', estimatedMinutes: 30,
      exercises: [{ slotId: 'synthetic-slot', exerciseId: 'synthetic-exercise', role: 'primary', sets: 2,
        target: { type: 'reps', mode: 'range', min: 8, max: 12 }, restSeconds: { max: 120 } }] },
    results: { 'synthetic-exercise': [{ setNumber: 1, weightKg: 21.25, reps: 10 }, { setNumber: 2 }] },
    difficulty: { 'synthetic-exercise': 'normal' },
    sessionContext: { checkIn: { feeling: 'normal', hasTrainingIssue: false, symptoms: [] },
      adaptation: { offered: false, accepted: false, actions: ['keep_as_planned'] } },
  }
}

function session(value = draft()): WorkoutSessionResult {
  return { workoutTemplateId: value.workout.templateId, completedAt: '2026-11-20T10:00:00Z',
    exercises: Object.entries(value.results).map(([exerciseId, sets]) => ({ exerciseId, sets,
      difficulty: value.difficulty[exerciseId] })), sessionContext: value.sessionContext }
}

function prepare(value = draft()) {
  values.set(ONBOARDING_PROFILE_KEY, JSON.stringify(value.profile))
  saveWorkoutDraft(value)
  return prepareCompletion(value, session(value))
}

function failOneWrite(keyToFail: string) {
  let failed = false
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
    if (key === keyToFail && !failed) { failed = true; throw new Error('Synthetic quota failure') }
    values.set(key, value)
  })
}

beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('local alpha workout persistence', () => {
  it('keeps old keys, existing counter offsets and unknown legacy fields', () => {
    const old = { ...session(), legacyNote: 'keep' }
    values.set(WORKOUT_HISTORY_KEY, JSON.stringify([old]))
    values.set(USER_PROGRESS_KEY, JSON.stringify({ completedWorkoutsCount: 7, legacyNote: 'keep' }))
    const pending = prepare(draft(7))
    const saved = commitCompletion(pending)
    expect(saved.history).toEqual([old, session()])
    expect(loadUserProgress()).toEqual({ completedWorkoutsCount: 8, legacyNote: 'keep' })
    expect(values.has(WORKOUT_DRAFT_KEY)).toBe(false)
    expect(Object.keys(saved.history[1])).toEqual(Object.keys(session()))
  })

  it('restores the exact exercise snapshot, partial entries, difficulty and accepted adaptation', () => {
    const value = draft()
    value.sessionContext!.adaptation = { offered: true, accepted: true,
      actions: ['hold_load'], reason: 'Synthetic adaptation' }
    prepare(value)
    expect(loadApplicationState().draft).toEqual(value)
    expect(loadWorkoutHistory()).toEqual([])
    expect(loadUserProgress().completedWorkoutsCount).toBe(0)
  })

  it.each([WORKOUT_HISTORY_KEY, USER_PROGRESS_KEY])('recovers once after a failure writing %s', (key) => {
    const pending = prepare()
    failOneWrite(key)
    expect(() => commitCompletion(pending)).toThrow('Не удалось сохранить')
    expect(JSON.parse(values.get(WORKOUT_DRAFT_KEY)!).stage).toBe('completing')
    const recovered = loadApplicationState()
    expect(recovered.draft).toBeNull()
    expect(recovered.history).toEqual([session()])
    expect(recovered.progress.completedWorkoutsCount).toBe(1)
    expect(loadApplicationState().history).toHaveLength(1)
    expect(commitCompletion(pending).history).toHaveLength(1)
  })

  it('retains the recovery record when cleanup fails after both writes', () => {
    const pending = prepare()
    vi.mocked(localStorage.removeItem).mockImplementationOnce(() => { throw new Error('Synthetic failure') })
    expect(() => commitCompletion(pending)).toThrow('Сохранение ещё не завершено')
    expect(loadWorkoutHistory()).toHaveLength(1)
    expect(loadUserProgress().completedWorkoutsCount).toBe(1)
    expect(loadApplicationState().history).toHaveLength(1)
    expect(values.has(WORKOUT_DRAFT_KEY)).toBe(false)
  })

  it('does not change history or progress when saving the recovery record fails', () => {
    const pending = prepare()
    const before = new Map(values)
    failOneWrite(WORKOUT_DRAFT_KEY)
    expect(() => commitCompletion(pending)).toThrow()
    expect(values).toEqual(before)
    expect(commitCompletion(pending).history).toHaveLength(1)
  })

  it('does not overwrite conflicting data during recovery', () => {
    const pending = prepare()
    failOneWrite(USER_PROGRESS_KEY)
    expect(() => commitCompletion(pending)).toThrow()
    values.set(USER_PROGRESS_KEY, JSON.stringify({ completedWorkoutsCount: 99 }))
    const before = new Map(values)
    expect(() => loadApplicationState()).toThrow('другом окне')
    expect(values).toEqual(before)
  })

  it('rejects a stale workout before creating a completion record', () => {
    const value = draft()
    prepare(value)
    values.set(USER_PROGRESS_KEY, JSON.stringify({ completedWorkoutsCount: 1 }))
    const before = new Map(values)
    expect(() => prepareCompletion(value, session(value))).toThrow('другом окне')
    expect(values).toEqual(before)
  })

  it('preserves another draft and refuses to replace a pending completion with active input', () => {
    const value = draft()
    const pending = prepare(value)
    expect(() => saveWorkoutDraft({ ...value, id: 'another-window' })).toThrow()
    failOneWrite(USER_PROGRESS_KEY)
    expect(() => commitCompletion(pending)).toThrow()
    const before = new Map(values)
    expect(() => saveWorkoutDraft(value)).toThrow()
    expect(values).toEqual(before)
  })

  it('reports inaccessible storage instead of starting an empty session', () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => { throw new Error('Synthetic security error') })
    expect(() => loadApplicationState()).toThrow('Разреши сохранение данных')
  })

  it.each(['{broken', '{}', 'null', '[{"exercises":null}]'])('preserves unreadable history: %s', (raw) => {
    values.set(WORKOUT_HISTORY_KEY, raw)
    expect(() => loadApplicationState()).toThrow('не удалены')
    expect(values.get(WORKOUT_HISTORY_KEY)).toBe(raw)
  })

  it('validates stored profile and progress without silently resetting them', () => {
    values.set(ONBOARDING_PROFILE_KEY, '{}')
    expect(() => loadOnboardingProfile()).toThrow()
    values.set(ONBOARDING_PROFILE_KEY, 'null')
    expect(loadOnboardingProfile()).toBeNull()
    values.set(USER_PROGRESS_KEY, '{"completedWorkoutsCount":-1}')
    expect(() => loadUserProgress()).toThrow()
    expect(values.get(USER_PROGRESS_KEY)).toContain('-1')
  })

  it('rejects invalid numbers while keeping the last valid draft', () => {
    const value = draft()
    prepare(value)
    const before = values.get(WORKOUT_DRAFT_KEY)
    for (const patch of [{ reps: -1 }, { reps: 1.5 }, { weightKg: Number.NaN }]) {
      const invalid = structuredClone(value)
      Object.assign(invalid.results['synthetic-exercise'][0], patch)
      expect(() => saveWorkoutDraft(invalid)).toThrow()
      expect(values.get(WORKOUT_DRAFT_KEY)).toBe(before)
    }
  })
})
