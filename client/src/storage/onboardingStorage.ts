import type { OnboardingProfile } from '../types/onboarding'

const ONBOARDING_PROFILE_KEY = 'fitness-onboarding-profile'

export function saveOnboardingProfile(
  profile: OnboardingProfile,
) {
  localStorage.setItem(
    ONBOARDING_PROFILE_KEY,
    JSON.stringify(profile),
  )
}

export function loadOnboardingProfile():
  | OnboardingProfile
  | null {
  const savedProfile = localStorage.getItem(
    ONBOARDING_PROFILE_KEY,
  )

  if (!savedProfile) {
    return null
  }

  try {
    return JSON.parse(savedProfile) as OnboardingProfile
  } catch {
    return null
  }
}