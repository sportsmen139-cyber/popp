/** Capabilities/configured equipment, never translated display labels. */
export const EQUIPMENT_IDS = [
  'barbell', 'dumbbells', 'kettlebell', 'bench', 'adjustable_bench', 'rack',
  'pull_up_bar', 'resistance_band', 'stable_support', 'step_platform',
  'lat_pulldown_machine', 'assisted_pull_up_machine', 'cable_row_machine',
  't_bar_row_station', 'cable_station', 'ankle_cuff',
  'chest_press_machine', 'incline_chest_press_machine', 'pec_deck_machine',
  'leg_press_machine', 'hyperextension_bench', 'hip_abduction_machine',
  'hip_extension_machine', 'leg_extension_machine', 'calf_raise_machine',
  'hip_adduction_machine',
] as const

export type EquipmentId = typeof EQUIPMENT_IDS[number]
export type EquipmentOption = readonly [EquipmentId, ...EquipmentId[]]

export type ExerciseEquipmentRequirements =
  | { kind: 'no_external_equipment' }
  | { kind: 'external'; equipmentOptions: readonly [EquipmentOption, ...EquipmentOption[]] }
  | { kind: 'needs_review'; reason: string }

export type EquipmentInventory =
  | { status: 'known'; items: readonly EquipmentId[] }
  | { status: 'not_collected' }
  | { status: 'invalid'; reason: 'not_an_array' | 'unknown_equipment_id' | 'duplicate_equipment_id' }

/** Provisional Gym content is not a claim about the user's actual inventory. */
export type EquipmentSelectionPolicy = 'verified_only' | 'provisional_gym'
