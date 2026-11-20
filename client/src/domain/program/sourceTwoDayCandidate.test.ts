import { describe, expect, it } from 'vitest'
import { sourceTwoDayCandidate } from './sourceTwoDayCandidate'
import { resolveTrainingPlan } from './resolveTrainingPlan'
import type { TrainingGoal } from '../../types/goal'

const wholeBody: TrainingGoal = { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' }
const mass: TrainingGoal = { goalType: 'hypertrophy', target: { type: 'whole_body' }, priority: 'normal' }
const legs: TrainingGoal = { goalType: 'hypertrophy', target: { type: 'muscle_group', id: 'legs' }, priority: 'high' }
const profile = { environment: 'gym', daysPerWeek: 2, level: 'beginner', goal: wholeBody } as const

describe('real two-day source candidates', () => {
  it('distinguishes the three exact author programs without assigning a legacy template', () => {
    for (const [level, goal, expected] of [['beginner', wholeBody, 'PRG_000001'], ['intermediate', mass, 'PRG_000013'], ['intermediate', legs, 'PRG_000021']] as const) {
      const selection = { ...profile, level, goal }
      expect(sourceTwoDayCandidate(selection)).toEqual({ programId: expected, sourceVersion: 1, daysPerWeek: 2, status: 'preparation_required' })
      expect(resolveTrainingPlan(selection)).toBeNull()
    }
  })
  it('rejects incompatible environments, levels, frequency and goals', () => {
    expect(sourceTwoDayCandidate({ ...profile, level: 'advanced' })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, environment: 'home' })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, environment: 'outdoor' })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, daysPerWeek: 3 })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, goal: mass })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, level: 'intermediate', goal: wholeBody })).toBeNull()
    expect(sourceTwoDayCandidate({ ...profile, goal: legs })).toBeNull()
  })
})
