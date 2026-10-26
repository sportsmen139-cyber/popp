import { describe, expect, it } from 'vitest'
import { exercises } from '../../data/exercises'
import { equipmentLabels } from '../../data/equipmentCatalog'
import { workoutTemplates } from '../../data/workoutTemplates'
import { workouts } from '../../data/workouts'
import { trainingEmphases } from '../../data/trainingEmphases'
import { basePrograms } from '../../data/basePrograms'
import { EQUIPMENT_IDS } from '../../types/equipment'
import { EXERCISE_MOVEMENT_IDS } from '../../types/exerciseCatalog'
import type { TrainingGoal } from '../../types/goal'
import { resolveCurrentWorkout } from './resolveCurrentWorkout'
import { resolveNextWorkout } from './resolveNextWorkout'
import { selectExerciseForSlot } from './selectExerciseForSlot'
import { createExerciseSelectionContext, isEquipmentId } from './resolveEquipment'
import { existingExerciseIds, gymChoiceBaselines, gymTemplateBaselines } from './catalogMigration.fixtures'

const balanced = trainingEmphases.find(emphasis => emphasis.id === 'balanced')!
const goalFor = (emphasis: string): TrainingGoal => emphasis === 'glutes'
  ? { goalType: 'hypertrophy', target: { type: 'muscle_group', id: 'glutes' }, priority: 'high' }
  : emphasis === 'pullups' ? { goalType: 'exercise_performance', target: { type: 'exercise', id: 'pull_up' }, priority: 'high' }
    : { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' }
const slotWith = (ids: string[]) => ({ ...workoutTemplates[0].slots[1], candidateExerciseIds: ids })

describe('existing catalog migration', () => {
  it('migrates 45 unique records, retaining levels and explicit metadata for every exercise', () => {
    expect(exercises).toHaveLength(45)
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(45)
    expect(exercises.map(exercise => exercise.id)).toEqual([...existingExerciseIds])
    expect(exercises.filter(exercise => exercise.difficulty === 'beginner')).toHaveLength(35)
    expect(exercises.filter(exercise => exercise.difficulty === 'intermediate')).toHaveLength(10)
    for (const exercise of exercises) {
      expect(exercise.environments.length).toBeGreaterThan(0)
      expect(new Set(exercise.environments).size).toBe(exercise.environments.length)
      expect(exercise.environments.every(environment => ['gym', 'home', 'outdoor'].includes(environment))).toBe(true)
      expect(exercise.supportedTargetTypes.length).toBeGreaterThan(0)
      if (exercise.movement.status === 'classified') {
        expect(exercise.movement.patterns.length).toBeGreaterThan(0)
        expect(new Set(exercise.movement.patterns).size).toBe(exercise.movement.patterns.length)
        expect(exercise.movement.patterns.every(pattern => EXERCISE_MOVEMENT_IDS.includes(pattern))).toBe(true)
      } else expect(exercise.movement.reason.length).toBeGreaterThan(0)
      if (exercise.equipment.kind === 'external') {
        expect(exercise.equipment.equipmentOptions.length).toBeGreaterThan(0)
        for (const option of exercise.equipment.equipmentOptions) {
          expect(option.length).toBeGreaterThan(0)
          expect(new Set(option).size).toBe(option.length)
          expect(option.every(isEquipmentId)).toBe(true)
        }
      } else expect(['no_external_equipment', 'needs_review']).toContain(exercise.equipment.kind)
    }
    expect(exercises.filter(exercise => exercise.movement.status === 'needs_review').map(exercise => exercise.id)).toEqual(['forward-knee-lean', 'ankle-flexion'])
  })

  it('has labels for all controlled IDs and no unused equipment or movement IDs', () => {
    const usedEquipment = new Set(exercises.flatMap(exercise => exercise.equipment.kind === 'external' ? exercise.equipment.equipmentOptions.flat() : []))
    const usedMovements = new Set(exercises.flatMap(exercise => exercise.movement.status === 'classified' ? exercise.movement.patterns : []))
    expect([...usedEquipment].sort()).toEqual([...EQUIPMENT_IDS].sort())
    expect(Object.keys(equipmentLabels).sort()).toEqual([...EQUIPMENT_IDS].sort())
    expect([...usedMovements].sort()).toEqual([...EXERCISE_MOVEMENT_IDS].sort())
  })

  it('retains active and legacy target semantics without activating legacy workouts', () => {
    for (const template of workoutTemplates) for (const slot of template.slots) for (const id of slot.candidateExerciseIds) {
      expect(exercises.find(exercise => exercise.id === id)?.supportedTargetTypes).toContain(slot.target.type)
    }
    for (const workout of workouts) for (const item of workout.exercises) {
      const targets = [{ id: item.exerciseId, type: item.target.type },
        ...(item.alternativeExerciseIds ?? []).map(id => ({ id, type: item.target.type })),
        ...(item.alternatives ?? []).map(alternative => ({ id: alternative.exerciseId, type: alternative.target?.type ?? item.target.type }))]
      for (const { id, type } of targets) expect(exercises.find(exercise => exercise.id === id)?.supportedTargetTypes).toContain(type)
    }
    expect(basePrograms.map(program => program.id)).toEqual(['gym-fullbody-3'])
  })

  it('checks environment membership even if the equipment is present', () => {
    const context = createExerciseSelectionContext({ level: 'intermediate', environment: 'home', availableEquipment: ['chest_press_machine'] })
    expect(selectExerciseForSlot(slotWith(['chest-press-machine']), balanced, context)).toBeNull()
  })

  it.each(['gym', 'home', 'outdoor'] as const)('uses the same shared exercise ID in %s with known requirements', environment => {
    const context = createExerciseSelectionContext({ level: 'intermediate', environment, availableEquipment: ['pull_up_bar'] })
    expect(selectExerciseForSlot({ ...slotWith(['pull-up']), target: { type: 'reps', mode: 'max' } }, balanced, context)).toBe('pull-up')
    expect(selectExerciseForSlot(slotWith(['push-up']), balanced, context)).toBe('push-up')
  })

  it('excludes unreviewed movements and unsupported target modalities', () => {
    const context = createExerciseSelectionContext({ level: 'intermediate', environment: 'gym' })
    expect(selectExerciseForSlot(slotWith(['forward-knee-lean', 'ankle-flexion']), balanced, context)).toBeNull()
    expect(selectExerciseForSlot(slotWith(['side-plank']), balanced, context)).toBeNull()
    expect(selectExerciseForSlot({ ...slotWith(['side-plank']), target: { type: 'time', mode: 'max' } }, balanced, context)).toBe('side-plank')
  })

  it.each(gymChoiceBaselines)('preserves complete Gym/3 prescriptions and A/B/C order for $level/$emphasis', baseline => {
    for (const [index, template] of gymTemplateBaselines.entries()) {
      const expected = {
        templateId: template.templateId, title: template.title, estimatedMinutes: template.estimatedMinutes,
        exercises: template.slots.map((slot, position) => ({ ...slot, exerciseId: baseline.exerciseIds[index][position] })),
      }
      for (const availableEquipment of [undefined, [...EQUIPMENT_IDS]]) {
        const result = resolveCurrentWorkout({ environment: 'gym', daysPerWeek: 3, level: baseline.level, goal: goalFor(baseline.emphasis), completedWorkoutsCount: index, availableEquipment })
        if (!result.ok) throw new Error(result.reason)
        expect(result.workout).toEqual(expected)
        expect(result.equipmentResolution).toEqual({
          inventoryStatus: availableEquipment ? 'known' : 'not_collected',
          policy: availableEquipment ? 'verified_only' : 'provisional_gym',
        })
      }
    }
    const cycle = resolveCurrentWorkout({ environment: 'gym', daysPerWeek: 3, level: baseline.level, goal: goalFor(baseline.emphasis), completedWorkoutsCount: 3 })
    if (!cycle.ok) throw new Error(cycle.reason)
    expect(cycle.workout.templateId).toBe('gym-fullbody-a')
  })

  it.each(['home', 'outdoor'] as const)('does not activate %s programs even with a full known inventory', environment => {
    for (const daysPerWeek of [2, 3, 4] as const) {
      expect(resolveCurrentWorkout({ environment, daysPerWeek, level: 'beginner', goal: goalFor('balanced'), completedWorkoutsCount: 0, availableEquipment: [...EQUIPMENT_IDS] })).toEqual({ ok: false, reason: 'training_plan_not_found' })
    }
    expect(resolveNextWorkout({ baseProgram: basePrograms[0], emphasisId: 'balanced', completedWorkoutsCount: 0,
      context: createExerciseSelectionContext({ environment, level: 'beginner', availableEquipment: [...EQUIPMENT_IDS] }) })).toBeNull()
  })

  it('rejects malformed persisted inventory instead of falling back to provisional Gym', () => {
    const result = resolveCurrentWorkout({ environment: 'gym', daysPerWeek: 3, level: 'beginner', goal: goalFor('balanced'), completedWorkoutsCount: 0,
      availableEquipment: ['тренажёр'] as unknown as typeof EQUIPMENT_IDS })
    expect(result).toEqual({ ok: false, reason: 'invalid_equipment_inventory' })
  })

  it('keeps unused/shadowed exercises while allowing a specifically available hip-abduction machine', () => {
    const known = (items: unknown) => createExerciseSelectionContext({ environment: 'gym', level: 'intermediate', availableEquipment: items })
    expect(selectExerciseForSlot(workoutTemplates[1].slots[3], balanced, known(['hip_abduction_machine']))).toBe('hip-abduction-machine')
    expect(selectExerciseForSlot(workoutTemplates[1].slots[4], balanced, known([]))).toBe('crunch')
    expect(selectExerciseForSlot(workoutTemplates[2].slots[4], balanced, known(['calf_raise_machine']))).toBe('standing-calf-raise')
    expect(exercises.find(exercise => exercise.id === 'pec-deck')?.movement.status).toBe('classified')
    expect(workoutTemplates.some(template => template.slots.some(slot => slot.candidateExerciseIds.includes('pec-deck')))).toBe(false)
  })
})
