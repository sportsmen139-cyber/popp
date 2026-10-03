import type { OnboardingProfile } from '../types/onboarding'

export const mockUserProfile: OnboardingProfile = {
  environment: 'gym',
  daysPerWeek: 3,
  level: 'intermediate',
  goal: {
    goalType: 'hypertrophy',
    target: {
      type: 'muscle_group',
      id: 'glutes',
    },
    priority: 'high',
  },
}