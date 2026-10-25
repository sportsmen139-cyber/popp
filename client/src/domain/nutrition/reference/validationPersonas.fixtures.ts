import type { NutritionProfile } from '../../../types/nutrition'
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
}

// These explicit scenario sets are deliberately uncertain and include adjacent
// categories. Do not export a production persona-to-PAL mapping from this file.
export const ENERGY_VALIDATION_PERSONAS: readonly EnergyValidationPersona[] = [
  {
    id: 'sedentary_male', nutritionProfile: { ...maleProfile }, trainingActivity: { ...noTraining },
    palScenarios: ['inactive', 'low_active'],
  },
  {
    id: 'moderate_steps_female',
    nutritionProfile: {
      ...maleProfile, heightCm: 165, weightKg: 60, rmrCalculationCategory: 'female', averageStepsPerDay: 7500,
    },
    trainingActivity: { ...noTraining }, palScenarios: ['inactive', 'low_active'],
  },
  {
    id: 'regular_lifter',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 8000, workActivity: 'mixed' },
    trainingActivity: { ...regularTraining }, palScenarios: ['low_active', 'active'],
  },
  {
    id: 'high_step_user',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 14000, cardioMinutesPerWeek: 120 },
    trainingActivity: { strengthSessionsPerWeek: 4, estimatedStrengthMinutesPerWeek: 240 },
    palScenarios: ['low_active', 'active', 'very_active'],
  },
  {
    id: 'physical_worker',
    nutritionProfile: { ...maleProfile, averageStepsPerDay: 12000, workActivity: 'physically_active' },
    trainingActivity: { strengthSessionsPerWeek: 4, estimatedStrengthMinutesPerWeek: 240 },
    palScenarios: ['active', 'very_active'],
  },
  {
    id: 'missing_steps', nutritionProfile: { ...maleProfile, averageStepsPerDay: undefined, workActivity: 'mixed' },
    trainingActivity: { ...regularTraining }, palScenarios: ['inactive', 'low_active', 'active'],
  },
]
