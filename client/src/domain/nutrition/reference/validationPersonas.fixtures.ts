import type { NutritionProfile } from '../../../types/nutrition'
import type { NutritionRange } from '../../../types/nutritionEnergy'
import type { Dri2023PalCategory } from '../../../types/nutritionEnergyValidation'
import type { TrainingActivityInput } from '../buildActivityProfile'

const maleProfile: NutritionProfile = {
  age: 30, heightCm: 175, weightKg: 75, rmrCalculationCategory: 'male',
  mode: 'simple', goal: 'maintenance', workActivity: 'mostly_seated',
  averageStepsPerDay: 3000, cardioMinutesPerWeek: 0,
  otherActivityMinutesPerWeek: 0, safetyFlags: [],
}
const noTraining: TrainingActivityInput = { strengthSessionsPerWeek: 0, estimatedStrengthMinutesPerWeek: 0 }
const regularTraining: TrainingActivityInput = { strengthSessionsPerWeek: 3, estimatedStrengthMinutesPerWeek: 180 }

type EnergyValidationPersona = {
  id: string
  nutritionProfile: NutritionProfile
  trainingActivity: TrainingActivityInput
  /** Test hypotheses only, not a steps/work-to-PAL classifier. */
  palScenarios: readonly Dri2023PalCategory[]
  scenarioRationale: string
  comparisonPurpose: 'diagnostic_population_benchmark_only'
  /** Recorded production output before this interpretation-only stage. Not DRI. */
  productionBaselineKcalPerDay: NutritionRange
}

// Engineering regression budgets for these six fixed profiles, not population
// kcal limits or reference-fit tolerances. Large production changes need review.
export const PERSONA_PRODUCTION_MAX_RELATIVE_CHANGE = 0.20

// These explicit scenario sets are deliberately uncertain and include adjacent
// categories. Do not export a production persona-to-PAL mapping from this file.
export const ENERGY_VALIDATION_PERSONAS: readonly EnergyValidationPersona[] = [
  {
    id: 'sedentary_male', nutritionProfile: { ...maleProfile }, trainingActivity: { ...noTraining },
    palScenarios: ['inactive', 'low_active'],
    scenarioRationale: 'Seated work and low reported steps motivate contrasting adjacent lower-activity scenarios; unreported daily activity prevents assigning actual PAL.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 1700, max: 2300 },
  },
  {
    id: 'moderate_steps_female',
    nutritionProfile: {
      ...maleProfile, heightCm: 165, weightKg: 60, rmrCalculationCategory: 'female', averageStepsPerDay: 7500,
    },
    trainingActivity: { ...noTraining }, palScenarios: ['inactive', 'low_active'],
    scenarioRationale: 'Moderate steps without training do not identify PAL; compare two lower-activity population scenarios without treating step count as a category rule.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 1400, max: 1950 },
  },
  {
    id: 'regular_lifter',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 8000, workActivity: 'mixed' },
    trainingActivity: { ...regularTraining }, palScenarios: ['low_active', 'active'],
    scenarioRationale: 'Regular lifting plus daily movement supports inspecting both adjacent scenarios; intensity, work duration and step overlap remain unknown.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 1850, max: 2650 },
  },
  {
    id: 'high_step_user',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 14000, cardioMinutesPerWeek: 120 },
    trainingActivity: { strengthSessionsPerWeek: 4, estimatedStrengthMinutesPerWeek: 240 },
    palScenarios: ['low_active', 'active', 'very_active'],
    scenarioRationale: 'High steps and multiple exercise modes justify a broad contrast; unknown intensity and overlap prevent choosing one measured PAL.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 2000, max: 3100 },
  },
  {
    id: 'physical_worker',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 12000, workActivity: 'physically_active' },
    trainingActivity: { strengthSessionsPerWeek: 4, estimatedStrengthMinutesPerWeek: 240 },
    palScenarios: ['active', 'very_active'],
    scenarioRationale: 'Inspect higher-activity population scenarios for a physical job plus training; work hours and whether steps describe the same work are unknown, so neither label is assigned to the user.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 1950, max: 2850 },
  },
  {
    id: 'missing_steps', nutritionProfile: { ...maleProfile, averageStepsPerDay: undefined, workActivity: 'mixed' },
    trainingActivity: { ...regularTraining }, palScenarios: ['inactive', 'low_active', 'active'],
    scenarioRationale: 'No step coverage means no reliable category assignment; contrast three scenarios and retain the insufficient-information diagnostic.',
    comparisonPurpose: 'diagnostic_population_benchmark_only',
    productionBaselineKcalPerDay: { min: 1750, max: 2600 },
  },
]
