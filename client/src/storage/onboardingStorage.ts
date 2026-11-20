import type { OnboardingProfile } from '../types/onboarding'
import { readStored, removeStored, writeRaw } from './localStorage'
import { isProfile } from './validators'

export const ONBOARDING_PROFILE_KEY = 'fitness-onboarding-profile'

export function saveOnboardingProfile(
  profile: OnboardingProfile,
) {
  writeRaw(
    ONBOARDING_PROFILE_KEY,
    JSON.stringify(profile),
  )
}

export function loadOnboardingProfile():
  | OnboardingProfile
  | null {
  return readStored<OnboardingProfile | null>(ONBOARDING_PROFILE_KEY,
    (value): value is OnboardingProfile | null => value === null || isProfile(value), null)
}

export function clearOnboardingProfile() {
  removeStored(ONBOARDING_PROFILE_KEY)
}
