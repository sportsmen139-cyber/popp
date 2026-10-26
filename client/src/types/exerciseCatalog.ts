// Independent of legacy WorkoutSlot.pattern (which also contains muscle groups).
// Only patterns that can be assigned to the existing 45 exercises are included.
export const EXERCISE_MOVEMENT_IDS = [
  'squat', 'lunge', 'step_up', 'hinge', 'calf',
  'horizontal_push', 'horizontal_pull', 'vertical_pull',
  'hip_extension', 'hip_abduction', 'hip_adduction', 'knee_extension',
  'elbow_flexion', 'elbow_extension', 'shoulder_abduction',
  'shoulder_horizontal_adduction', 'shoulder_extension', 'trunk_extension',
  'anti_lateral_flexion', 'trunk_flexion', 'grip_isometric',
  'locomotion', 'power', 'conditioning',
] as const

export type ExerciseMovementId = typeof EXERCISE_MOVEMENT_IDS[number]

export type ExerciseMovementMetadata =
  | { status: 'classified'; patterns: readonly [ExerciseMovementId, ...ExerciseMovementId[]] }
  | { status: 'needs_review'; reason: string }
