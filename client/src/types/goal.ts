export type GoalType =
  | 'general_fitness'
  | 'hypertrophy'
  | 'strength'
  | 'exercise_performance'
  | 'endurance'
  | 'body_composition'

export type MuscleGroupGoalTarget =
  | 'glutes'
  | 'back'
  | 'chest'
  | 'shoulders'
  | 'legs'

export type ExerciseGoalTarget =
  | 'pull_up'
  | 'bench_press'
  | 'squat'

export type GoalTarget =
  | {
      type: 'whole_body'
    }
  | {
      type: 'muscle_group'
      id: MuscleGroupGoalTarget
    }
  | {
      type: 'exercise'
      id: ExerciseGoalTarget
    }

export type GoalPriority =
  | 'normal'
  | 'high'

export type TrainingGoal = {
  goalType: GoalType
  target: GoalTarget
  priority: GoalPriority
}