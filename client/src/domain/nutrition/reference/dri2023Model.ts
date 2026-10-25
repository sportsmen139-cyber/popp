// Isolated reference, NEVER a source of production beta coefficients or PAL
// classification. NASEM, Dietary Reference Intakes for Energy (2023), adult
// EER equations (19+), reproduced by Health Canada in its energy reference table.
// https://doi.org/10.17226/26818
// https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-energy.html
// EER (kcal/day) = intercept + age*years + height*cm + weight*kg.
// These are the 2023 sex/PAL-specific regressions, NOT the 2005 PA equations.
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
