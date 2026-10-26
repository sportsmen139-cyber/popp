import { EQUIPMENT_IDS } from '../../types/equipment'
import type { EquipmentId, EquipmentInventory, ExerciseEquipmentRequirements } from '../../types/equipment'
import type { ExerciseSelectionContext, TrainingEnvironment, UserLevel } from '../../types/program'

const equipmentIds = new Set<string>(EQUIPMENT_IDS)
export function isEquipmentId(value: unknown): value is EquipmentId {
  return typeof value === 'string' && equipmentIds.has(value)
}

/** Storage/API boundary. Unknown labels are not guessed into machine capabilities. */
export function parseEquipmentInventory(value: unknown): EquipmentInventory {
  if (value === undefined) return { status: 'not_collected' }
  if (!Array.isArray(value)) return { status: 'invalid', reason: 'not_an_array' }
  if (!value.every(isEquipmentId)) return { status: 'invalid', reason: 'unknown_equipment_id' }
  if (new Set(value).size !== value.length) return { status: 'invalid', reason: 'duplicate_equipment_id' }
  return { status: 'known', items: [...value] }
}

export function createExerciseSelectionContext(input: {
  level: UserLevel
  environment: TrainingEnvironment
  availableEquipment?: unknown
}): ExerciseSelectionContext {
  const inventory = parseEquipmentInventory(input.availableEquipment)
  return {
    level: input.level, environment: input.environment, inventory,
    equipmentPolicy: inventory.status === 'not_collected' && input.environment === 'gym'
      ? 'provisional_gym' : 'verified_only',
  }
}

export function resolveEquipmentEligibility(
  requirements: ExerciseEquipmentRequirements | undefined,
  context: ExerciseSelectionContext,
): 'matched' | 'unconfirmed_gym' | 'unavailable' {
  if (!requirements || context.inventory.status === 'invalid') return 'unavailable'
  if (context.inventory.status === 'known' &&
    (!Array.isArray(context.inventory.items) || !context.inventory.items.every(isEquipmentId) ||
      new Set(context.inventory.items).size !== context.inventory.items.length)) return 'unavailable'
  if (requirements.kind === 'no_external_equipment') return 'matched'
  if (requirements.kind !== 'external') return 'unavailable'
  // Empty/missing options are NOT implicitly bodyweight. Reject bad metadata.
  const options = requirements.equipmentOptions
  if (!Array.isArray(options) || options.length === 0 || options.some(option =>
    !Array.isArray(option) || option.length === 0 || !option.every(isEquipmentId) || new Set(option).size !== option.length)) {
    return 'unavailable'
  }
  if (context.inventory.status === 'known') {
    const items = context.inventory.items
    return options.some(option => option.every(item => items.includes(item))) ? 'matched' : 'unavailable'
  }
  return context.environment === 'gym' && context.equipmentPolicy === 'provisional_gym'
    ? 'unconfirmed_gym' : 'unavailable'
}
