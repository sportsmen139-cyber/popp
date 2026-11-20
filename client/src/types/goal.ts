export type GoalType =
  | 'general_fitness'
  | 'hypertrophy'
  | 'strength'
  | 'exercise_performance'
  | 'endurance'
  | 'body_composition'
  | 'return_to_training'

export type MuscleGroupGoalTarget =
  | 'glutes'
  | 'back'
  | 'chest'
  | 'shoulders'
  | 'legs'
  | 'arms'
  | 'quads'
  | 'hamstrings'
  | 'shoulders_arms'

export type ExerciseGoalTarget =
  | 'pull_up'
  | 'bench_press'
  | 'squat'
  | 'dip'

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
