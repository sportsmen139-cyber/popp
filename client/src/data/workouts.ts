import type { Workout } from '../types/training'

export const workouts: Workout[] = [
  {
    id: 'gym-upper-back',
    title: 'Верх тела — акцент на спину',
    exercises: [
      {
        exerciseId: 'lat-pulldown',
        alternativeExerciseIds: [
          'pull-up',
          'assisted-pull-up',
        ],
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'dumbbell-lateral-raise',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'seated-cable-row',
        alternativeExerciseIds: [
          't-bar-row',
        ],
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'triceps-pushdown',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'close-grip-lat-pulldown',
        order: 5,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },

  {
    id: 'gym-upper-chest',
    title: 'Верх тела — акцент на грудные',
    exercises: [
      {
        exerciseId: 'barbell-bench-press',
        alternativeExerciseIds: [
          'chest-press-machine',
          'push-up',
        ],
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'dumbbell-lateral-raise',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'incline-bench-press',
        alternativeExerciseIds: [
          'incline-chest-press-machine',
          'elevated-push-up',
        ],
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'dumbbell-biceps-curl',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },
    {
    id: 'gym-legs-glutes',
    title: 'Ноги — акцент на ягодицы',
    exercises: [
      {
        exerciseId: 'romanian-deadlift',
        alternativeExerciseIds: [
          'bulgarian-split-squat',
          'single-leg-press',
          'step-up',
        ],
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'hyperextension',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'hip-abduction-machine',
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'hip-extension-machine',
        alternativeExerciseIds: [
          'cable-hip-extension',
        ],
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },

  {
    id: 'gym-legs-quads',
    title: 'Ноги — акцент на квадрицепс',
    exercises: [
      {
        exerciseId: 'barbell-squat',
        alternativeExerciseIds: [
          'leg-press',
        ],
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'leg-extension',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'forward-knee-lean',
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'standing-calf-raise',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },

  {
    id: 'gym-legs-general',
    title: 'Общая тренировка ног',
    exercises: [
      {
        exerciseId: 'barbell-squat',
        alternativeExerciseIds: [
          'leg-press',
          'goblet-squat',
        ],
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'hyperextension',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'standing-calf-raise',
        alternativeExerciseIds: [
          'calf-raise-machine',
        ],
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'hip-adduction-machine',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'leg-extension',
        order: 5,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },
  {
    id: 'home-outdoor-legs',
    title: 'Дом / улица — ноги',
    exercises: [
      {
        exerciseId: 'bodyweight-squat',
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'jump-squat',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'glute-bridge',
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'ankle-flexion',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'lunge',
        order: 5,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
     },
       {
    id: 'home-outdoor-upper',
    title: 'Дом / улица — верх тела',
    exercises: [
      {
        exerciseId: 'push-up',
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'pull-up',
        order: 2,
        optional: true,
        alternatives: [
          {
            exerciseId: 'dead-hang',
            target: {
              type: 'time',
              mode: 'max',
            },
          },
        ],
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
        notes: 'Выполнять только при наличии турника.',
      },
      {
        exerciseId: 'prone-trunk-raise',
        order: 3,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'prone-leg-raise',
        order: 4,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
      {
        exerciseId: 'prone-band-shoulder-extension',
        order: 5,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'range',
          min: 8,
          max: 12,
        },
        restSeconds: {
          min: 90,
          max: 120,
        },
      },
    ],
  },
    {
    id: 'home-outdoor-core',
    title: 'Дом / улица — пресс',
    exercises: [
      {
        exerciseId: 'crunch',
        order: 1,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'max',
        },
        restSeconds: {
          min: 30,
          max: 60,
        },
      },
      {
        exerciseId: 'reverse-crunch',
        order: 2,
        sets: 3,
        target: {
          type: 'reps',
          mode: 'max',
        },
        restSeconds: {
          min: 30,
          max: 60,
        },
      },
      {
        exerciseId: 'side-plank',
        order: 3,
        sets: 3,
        target: {
          type: 'time',
          mode: 'max',
        },
        restSeconds: {
          min: 30,
          max: 60,
        },
      },
    ],
  },
    {
    id: 'home-outdoor-functional',
    title: 'Дом / улица — функциональная',
    estimatedMinutes: 30,
    format: 'circuit',
    timeLimitMinutes: 30,
    exercises: [
      {
        exerciseId: 'bodyweight-squat',
        alternativeExerciseIds: [
          'jump-squat',
        ],
        order: 1,
        sets: 1,
        target: {
          type: 'time',
          mode: 'fixed',
          value: 60,
        },
        restSeconds: {
          min: 60,
          max: 60,
        },
      },
      {
        exerciseId: 'push-up',
        order: 2,
        sets: 1,
        target: {
          type: 'time',
          mode: 'fixed',
          value: 60,
        },
        restSeconds: {
          min: 60,
          max: 60,
        },
      },
      {
        exerciseId: 'crunch',
        order: 3,
        sets: 1,
        target: {
          type: 'time',
          mode: 'fixed',
          value: 60,
        },
        restSeconds: {
          min: 60,
          max: 60,
        },
      },
      {
        exerciseId: 'prone-trunk-raise',
        alternativeExerciseIds: [
          'pull-up',
        ],
        order: 4,
        sets: 1,
        target: {
          type: 'time',
          mode: 'fixed',
          value: 60,
        },
        restSeconds: {
          min: 60,
          max: 60,
        },
      },
      {
        exerciseId: 'run-in-place',
        order: 5,
        sets: 1,
        target: {
          type: 'time',
          mode: 'fixed',
          value: 60,
        },
        restSeconds: {
          min: 60,
          max: 60,
        },
      },
    ],
  },
     ]
