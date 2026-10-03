import type { TrainingGoal } from '../types/goal'
import type {
  TrainingEnvironment,
  UserLevel,
} from '../types/program'

type MockUserProfile = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel
  goal: TrainingGoal
  completedWorkoutsCount: number
  availableEquipment?: string[]
}

export const mockUserProfile: MockUserProfile = {
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
  completedWorkoutsCount: 0,
}