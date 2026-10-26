import { describe, expect, it } from 'vitest'
import { exercises } from '../../data/exercises'
import type { ExerciseEquipmentRequirements } from '../../types/equipment'
import { createExerciseSelectionContext, parseEquipmentInventory, resolveEquipmentEligibility } from './resolveEquipment'

const requirements = (id: string) => {
  const exercise = exercises.find(exercise => exercise.id === id)
  if (!exercise) throw new Error(id)
  return exercise.equipment
}
const context = (availableEquipment?: unknown) => createExerciseSelectionContext({ level: 'intermediate', environment: 'gym', availableEquipment })

describe('controlled equipment inventory', () => {
  it('distinguishes known empty inventory from inventory not collected', () => {
    expect(parseEquipmentInventory([])).toEqual({ status: 'known', items: [] })
    expect(parseEquipmentInventory(undefined)).toEqual({ status: 'not_collected' })
  })

  it('copies known IDs without inventing capabilities', () => {
    const items = ['barbell', 'dumbbells']
    const result = parseEquipmentInventory(items)
    expect(result).toEqual({ status: 'known', items })
    items.push('kettlebell')
    expect(result).toEqual({ status: 'known', items: ['barbell', 'dumbbells'] })
  })

  it.each([null, {}, 'barbell'])('rejects a malformed inventory: %j', value => {
    expect(parseEquipmentInventory(value)).toEqual({ status: 'invalid', reason: 'not_an_array' })
  })

  it.each([['machine'], ['тренажёр'], ['штанга или гантели'], ['barbell', 1]])('rejects unknown IDs instead of guessing: %j', (...items) => {
    expect(parseEquipmentInventory(items)).toEqual({ status: 'invalid', reason: 'unknown_equipment_id' })
  })

  it('rejects duplicate IDs', () => {
    expect(parseEquipmentInventory(['barbell', 'barbell'])).toEqual({ status: 'invalid', reason: 'duplicate_equipment_id' })
  })
})

describe('equipment requirements: OR of AND sets', () => {
  it('matches explicit no-external-equipment independently of collection status', () => {
    expect(resolveEquipmentEligibility(requirements('push-up'), context([]))).toBe('matched')
    expect(resolveEquipmentEligibility(requirements('push-up'), { ...context(), equipmentPolicy: 'verified_only' })).toBe('matched')
    expect(resolveEquipmentEligibility(undefined, context([]))).toBe('unavailable')
  })

  it('matches a single equipment requirement, not an unrelated machine', () => {
    expect(resolveEquipmentEligibility(requirements('leg-extension'), context(['leg_extension_machine']))).toBe('matched')
    expect(resolveEquipmentEligibility(requirements('leg-extension'), context(['hip_extension_machine']))).toBe('unavailable')
  })

  it('requires all items in an AND option, including load and appropriate bench', () => {
    const exercise = requirements('incline-bench-press')
    expect(resolveEquipmentEligibility(exercise, context(['barbell', 'adjustable_bench', 'rack']))).toBe('matched')
    expect(resolveEquipmentEligibility(exercise, context(['barbell', 'rack']))).toBe('unavailable')
    expect(resolveEquipmentEligibility(exercise, context(['adjustable_bench']))).toBe('unavailable')
    expect(resolveEquipmentEligibility(exercise, context(['barbell', 'adjustable_bench']))).toBe('unavailable')
  })

  it('accepts either complete OR option, including several options satisfied at once', () => {
    const exercise = requirements('incline-bench-press')
    expect(resolveEquipmentEligibility(exercise, context(['dumbbells', 'adjustable_bench']))).toBe('matched')
    expect(resolveEquipmentEligibility(exercise, context(['dumbbells', 'barbell', 'rack', 'adjustable_bench']))).toBe('matched')
  })

  it('fixes the barbell OR dumbbells RDL case without a Russian pseudo-item', () => {
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), context(['barbell']))).toBe('matched')
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), context(['dumbbells']))).toBe('matched')
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), context([]))).toBe('unavailable')
  })

  it('requires the separate cable leg attachment rather than any generic machine', () => {
    expect(resolveEquipmentEligibility(requirements('cable-hip-extension'), context(['cable_station']))).toBe('unavailable')
    expect(resolveEquipmentEligibility(requirements('cable-hip-extension'), context(['cable_station', 'ankle_cuff']))).toBe('matched')
  })

  it('does not infer a step platform from a bench', () => {
    expect(resolveEquipmentEligibility(requirements('step-up'), context(['bench']))).toBe('unavailable')
    expect(resolveEquipmentEligibility(requirements('step-up'), context(['step_platform']))).toBe('matched')
  })

  it('makes provisional Gym requirements explicitly unconfirmed, not a fake known inventory', () => {
    const gym = context()
    expect(gym.inventory).toEqual({ status: 'not_collected' })
    expect(gym.equipmentPolicy).toBe('provisional_gym')
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), gym)).toBe('unconfirmed_gym')
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), { ...gym, equipmentPolicy: 'verified_only' })).toBe('unavailable')
  })

  it('never uses the provisional fallback for known insufficient or invalid inventory', () => {
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), { ...context([]), equipmentPolicy: 'provisional_gym' })).toBe('unavailable')
    expect(resolveEquipmentEligibility(requirements('push-up'), context(['machine']))).toBe('unavailable')
  })

  it.each(['home', 'outdoor'] as const)('does not assume external inventory for %s', environment => {
    const other = createExerciseSelectionContext({ level: 'intermediate', environment })
    expect(other.equipmentPolicy).toBe('verified_only')
    expect(resolveEquipmentEligibility(requirements('romanian-deadlift'), { ...other, equipmentPolicy: 'provisional_gym' })).toBe('unavailable')
    expect(resolveEquipmentEligibility(requirements('push-up'), other)).toBe('matched')
  })

  it('does not convert missing/empty/duplicate requirements into bodyweight', () => {
    const malformed = [
      { kind: 'external', equipmentOptions: [] },
      { kind: 'external', equipmentOptions: [[]] },
      { kind: 'external', equipmentOptions: [['barbell', 'barbell']] },
      { kind: 'external', equipmentOptions: [['machine']] },
    ] as unknown as ExerciseEquipmentRequirements[]
    for (const metadata of malformed) expect(resolveEquipmentEligibility(metadata, context())).toBe('unavailable')
    expect(resolveEquipmentEligibility(requirements('forward-knee-lean'), context())).toBe('unavailable')
  })
})
