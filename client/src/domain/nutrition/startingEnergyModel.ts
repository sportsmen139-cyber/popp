// Product beta assumptions, NOT validated physiological equations. All activity
// costs are NET of rest. Broad bounds represent scenarios, not probabilities.
// See startingEnergy.md for units, overlap policy and known sources of error.
export const STARTING_ENERGY_MODEL = {
  daysPerWeek: 7,
  minutesPerHour: 60,
  hoursPerDay: 24,
  roundingKcal: 50, // Presentation/product rounding, not model accuracy.
  lowStepsThreshold: 4000,
  // Illustrative uncertainty allowance; does not guarantee +/-10% RMR accuracy.
  rmrUncertaintyFraction: 0.10,
  // Population TEF is roughly 10%; the chosen 8-12% bounds are a product
  // scenario assumption, NOT a personal confidence interval. Diet is unknown.
  // Solve E = RMR + activity + TEF*E as E = (RMR + activity) / (1 - TEF).
  thermicEffectFraction: { min: 0.08, max: 0.12 },
  // Net walking cost proxy including unknown stride/pace: kcal / kg / step.
  stepKcalPerKg: { min: 0.0003, max: 0.0005 },
  // Whole-day work/activity proxies, kcal / kg / day. Include non-step daily
  // movement; without work duration they are deliberately broad fallback floors.
  workKcalPerKgPerDay: {
    mostly_seated: { min: 1, max: 2 },
    mixed: { min: 1.5, max: 3.5 },
    mostly_standing: { min: 2, max: 4.5 },
    physically_active: { min: 3, max: 6 },
  },
  // Net MET proxies (gross MET minus resting 1 MET): kcal / kg / hour.
  // Minutes alone cannot identify actual intensity or exercise modality.
  structuredNetMet: {
    strength: { min: 2, max: 4 },
    cardio: { min: 3, max: 7 },
    other: { min: 1, max: 4 },
  },
} as const
