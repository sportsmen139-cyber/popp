import type { TrainingGoal } from './goal'
import type { EquipmentId } from './equipment'
import type {
  TrainingEnvironment,
  UserLevel,
} from './program'

export type OnboardingProfile = {
  environment: TrainingEnvironment
  daysPerWeek: 2 | 3 | 4
  level: UserLevel
  goal: TrainingGoal
  availableEquipment?: EquipmentId[]
}
