export type ProgressionAggressiveness =
  | 'low'
  | 'normal'
  | 'high'

export type TrainingStrategy = {
  progressionAggressiveness: ProgressionAggressiveness
}