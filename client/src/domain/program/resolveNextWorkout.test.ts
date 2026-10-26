import { describe, expect, it } from 'vitest'

import { basePrograms } from '../../data/basePrograms'

import { resolveNextWorkout } from './resolveNextWorkout'
import { createExerciseSelectionContext } from './resolveEquipment'

describe('resolveNextWorkout', () => {
  it('выдаёт тренировки по порядку A → B → C → A', () => {
    const baseProgram = basePrograms.find(
      (program) => program.id === 'gym-fullbody-3',
    )

    if (!baseProgram) {
      throw new Error('Не найдена программа gym-fullbody-3')
    }

    const context = createExerciseSelectionContext({ level: 'intermediate', environment: 'gym' })

    const workout0 = resolveNextWorkout({
      baseProgram,
      emphasisId: 'balanced',
      completedWorkoutsCount: 0,
      context,
    })

    const workout1 = resolveNextWorkout({
      baseProgram,
      emphasisId: 'balanced',
      completedWorkoutsCount: 1,
      context,
    })

    const workout2 = resolveNextWorkout({
      baseProgram,
      emphasisId: 'balanced',
      completedWorkoutsCount: 2,
      context,
    })

    const workout3 = resolveNextWorkout({
      baseProgram,
      emphasisId: 'balanced',
      completedWorkoutsCount: 3,
      context,
    })

    expect(workout0?.templateId).toBe('gym-fullbody-a')
    expect(workout1?.templateId).toBe('gym-fullbody-b')
    expect(workout2?.templateId).toBe('gym-fullbody-c')
    expect(workout3?.templateId).toBe('gym-fullbody-a')
  })
})