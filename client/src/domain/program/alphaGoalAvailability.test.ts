import { afterEach, describe, expect, it, vi } from 'vitest'
import { alphaGoalDirections } from '../../data/alphaGoalChoices'
import { loadOnboardingProfile, ONBOARDING_PROFILE_KEY } from '../../storage/onboardingStorage'
import { resolveCurrentWorkout } from './resolveCurrentWorkout'
import { resolveTrainingPlan } from './resolveTrainingPlan'

const choices = alphaGoalDirections.flatMap((direction) => direction.choices)
const supported = new Set(['Общая физическая подготовка', 'Ягодицы', 'Подтягивания'])
const settings = { environment: 'gym', daysPerWeek: 3, level: 'beginner' } as const

afterEach(() => vi.unstubAllGlobals())

describe('Alpha goal assignment boundary', () => {
  it.each(choices)('$label: назначает только существующие варианты, без ложного fallback', (choice) => {
    const input = { ...settings, goal: choice.goal }
    expect(resolveTrainingPlan(input) !== null).toBe(supported.has(choice.label))
    const current = resolveCurrentWorkout({ ...input, completedWorkoutsCount: 0 })
    expect(current.ok).toBe(supported.has(choice.label))
    if (current.ok) expect(current.trainingPlan.baseProgram.id).toBe('gym-fullbody-3')
    else expect(current.reason).toBe('training_plan_not_found')
  })

  it.each(['home', 'outdoor'] as const)('не выдаёт программу для %s ни под одной целью', (environment) => {
    for (const choice of choices) expect(resolveTrainingPlan({ ...settings, environment, goal: choice.goal })).toBeNull()
  })

  it.each([2, 4] as const)('не выдаёт программу на %i дня ни под одной целью', (daysPerWeek) => {
    for (const choice of choices) expect(resolveTrainingPlan({ ...settings, daysPerWeek, goal: choice.goal })).toBeNull()
  })

  it.each(['beginner', 'intermediate', 'advanced'] as const)('сохраняет старые профили и акценты для %s', (level) => {
    const oldGoals = [
      { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' },
      { goalType: 'hypertrophy', target: { type: 'muscle_group', id: 'glutes' }, priority: 'high' },
      { goalType: 'exercise_performance', target: { type: 'exercise', id: 'pull_up' }, priority: 'high' },
    ] as const
    for (const [index, goal] of oldGoals.entries()) {
      const raw = JSON.stringify({ ...settings, level, goal, legacyField: 'preserved' })
      const getItem = vi.fn((key: string) => key === ONBOARDING_PROFILE_KEY ? raw : null)
      const setItem = vi.fn()
      vi.stubGlobal('localStorage', { getItem, setItem })
      const loaded = loadOnboardingProfile()!
      expect(resolveTrainingPlan(loaded)?.emphasisId).toBe(['balanced', 'glutes', 'pullups'][index])
      expect(JSON.stringify(loaded)).toBe(raw)
      expect(setItem).not.toHaveBeenCalled()
    }
  })
})
