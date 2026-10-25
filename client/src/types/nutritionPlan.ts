import type { NutritionGoal, NutritionMode } from './nutrition'
import type { NutritionRange, StartingEnergyEstimate } from './nutritionEnergy'

// Preserve existing import paths while energy estimation has its own domain types.
export type { NutritionRange, StartingEnergyEstimate } from './nutritionEnergy'

export type NutritionConfidence = 'low' | 'medium' | 'high'

export type EnergyTarget =
  | { kind: 'target'; kcalPerDay: number }
  | { kind: 'range'; kcalPerDay: NutritionRange }

/** Contract only; no automatic plan generator or calibration implemented yet. */
export type StartingNutritionPlan = {
  mode: NutritionMode
  goal: NutritionGoal
  estimatedMaintenance: StartingEnergyEstimate
  calorieTarget: EnergyTarget
  proteinGramsPerDay: NutritionRange
  fatGramsPerDay: NutritionRange
  /** Remaining energy after compatible protein/fat choices, not independent maxima. */
  carbohydrateGramsPerDay: NutritionRange
  confidence: 'low'
  reasons: string[]
}

// Later calibration can use NutritionConfidence; formula-only starting plans
// stay low-confidence in both simple and tracking modes.
