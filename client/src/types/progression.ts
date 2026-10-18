export type ProgressionAction =
  | 'increase_weight'
  | 'keep_weight'
  | 'keep_and_retest'
  | 'reduce_weight'
  | 'warning'

export type ProgressionReason =
  | 'twelve_clean_reps'
  | 'eleven_clean_reps'
  | 'target_reps_met'
  | 'nine_clean_reps'
  | 'first_eight_rep_warning'
  | 'repeated_low_performance'
  | 'seven_or_fewer_clean_reps'
  | 'technique_breakdown'
  | 'difficulty_blocks_increase'
  | 'very_hard_effort'
  | 'failed_effort'

export type ProgressionDecision = {
  action: ProgressionAction
  reason: ProgressionReason
  message: string
}