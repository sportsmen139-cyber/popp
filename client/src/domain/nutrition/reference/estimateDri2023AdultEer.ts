import type {
  Dri2023AdultEerInput,
  Dri2023AdultEerResult,
} from '../../../types/nutritionEnergyValidation'
import { DRI_2023_ADULT_EER_COEFFICIENTS, DRI_2023_MINIMUM_ADULT_AGE } from './dri2023Model'

/**
 * Mathematical 19+ reference for explicit PAL scenarios, not nutrition advice.
 * Pregnancy/lactation adjustments and paediatric equations are not implemented.
 * Use validateStartingEnergy for a comparison that also reports production safety.
 */
export function estimateDri2023AdultEer(input: Dri2023AdultEerInput): Dri2023AdultEerResult {
  const fields: Array<keyof Dri2023AdultEerInput | 'reference_energy'> = []
  for (const field of ['age', 'heightCm', 'weightKg'] as const) {
    if (!Number.isFinite(input[field]) || input[field] <= 0) fields.push(field)
  }
  if (input.calculationCategory !== 'male' && input.calculationCategory !== 'female') {
    fields.push('calculationCategory')
  }
  if (!['inactive', 'low_active', 'active', 'very_active'].includes(input.palCategory)) {
    fields.push('palCategory')
  }
  if (fields.length > 0) return { status: 'invalid_input', fields }
  if (input.age < DRI_2023_MINIMUM_ADULT_AGE) {
    return { status: 'unsupported_age', minimumAgeYears: DRI_2023_MINIMUM_ADULT_AGE }
  }
  const coefficients = DRI_2023_ADULT_EER_COEFFICIENTS[input.calculationCategory][input.palCategory]
  const kcalPerDay = coefficients.intercept + coefficients.age * input.age +
    coefficients.height * input.heightCm + coefficients.weight * input.weightKg
  if (!Number.isFinite(kcalPerDay) || kcalPerDay <= 0) {
    return { status: 'invalid_input', fields: ['reference_energy'] }
  }
  return {
    status: 'estimated', method: 'dri_2023_adult_eer', sourceDoi: '10.17226/26818',
    palCategory: input.palCategory, kcalPerDay,
  }
}
