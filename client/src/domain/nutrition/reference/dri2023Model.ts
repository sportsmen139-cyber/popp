// Isolated reference, NEVER a source of production beta coefficients or PAL
// classification. NASEM, Dietary Reference Intakes for Energy (2023), adult
// EER equations (19+), reproduced by Health Canada in its energy reference table.
// https://doi.org/10.17226/26818
// Health Canada official adult table verified 2026-10-25; all eight rows match.
// https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html#a4
// EER (kcal/day) = intercept + age*years + height*cm + weight*kg.
// These are the 2023 sex/PAL-specific regressions, NOT the 2005 PA equations.
// Each is a population prediction for a PA category, not that category's lower
// or upper kcal boundary and not an individual measurement. Weight-stable EER=TEE.
export const DRI_2023_ADULT_EER_COEFFICIENTS = {
  male: {
    inactive: { intercept: 753.07, age: -10.83, height: 6.50, weight: 14.10 },
    low_active: { intercept: 581.47, age: -10.83, height: 8.30, weight: 14.94 },
    active: { intercept: 1004.82, age: -10.83, height: 6.52, weight: 15.91 },
    very_active: { intercept: -517.88, age: -10.83, height: 15.61, weight: 19.11 },
  },
  female: {
    inactive: { intercept: 584.90, age: -7.01, height: 5.72, weight: 11.71 },
    low_active: { intercept: 575.77, age: -7.01, height: 6.60, weight: 12.14 },
    active: { intercept: 710.25, age: -7.01, height: 6.54, weight: 12.34 },
    very_active: { intercept: 511.83, age: -7.01, height: 9.07, weight: 12.56 },
  },
} as const

export const DRI_2023_MINIMUM_ADULT_AGE = 19

export const DRI_2023_REFERENCE_SOURCE = {
  reportDoi: '10.17226/26818',
  reportTitle: 'Dietary Reference Intakes for Energy (2023)',
  reportChapter: 5,
  reportTable: '5-16',
  coefficientSourceUrl: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html#a4',
  coefficientSourceSection: 'Adults 19 years and older',
  palDefinitionSourceUrl: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/equations-estimate-energy-requirement.html#a1',
  coefficientsVerifiedOn: '2026-10-25',
  verifiedAgainst: 'health_canada_official_equations',
} as const

// Official 19+ PAL membership ranges. They are metadata for explicit scenarios,
// not a function mapping activity signals (or predicted energy) to actual PAL.
export const DRI_2023_ADULT_PAL_RANGES = {
  inactive: { minInclusive: 1.00, maxExclusive: 1.53 },
  low_active: { minInclusive: 1.53, maxExclusive: 1.68 },
  active: { minInclusive: 1.68, maxExclusive: 1.85 },
  very_active: { minInclusive: 1.85, maxExclusive: 2.50 },
} as const
