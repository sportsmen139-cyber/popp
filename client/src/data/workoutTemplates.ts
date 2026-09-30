import type { WorkoutTemplate } from '../types/program'

export const workoutTemplates: WorkoutTemplate[] = [
{
  id: 'gym-fullbody-a',
  title: 'Full Body A',
  slots: [
    {
      id: 'a-squat',
      pattern: 'squat',
      role: 'primary',
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
      candidateExerciseIds: [
        'barbell-squat',
        'leg-press',
        'goblet-squat',
      ],
      tags: ['legs', 'quads', 'glutes'],
    },

    {
      id: 'a-horizontal-push',
      pattern: 'horizontal_push',
      role: 'primary',
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
      candidateExerciseIds: [
        'barbell-bench-press',
        'chest-press-machine',
        'push-up',
      ],
      tags: ['chest', 'triceps'],
    },

    {
      id: 'a-vertical-pull',
      pattern: 'vertical_pull',
      role: 'primary',
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
      candidateExerciseIds: [
        'lat-pulldown',
        'assisted-pull-up',
        'pull-up',
      ],
      tags: ['back', 'pullups'],
    },

    {
      id: 'a-hinge',
      pattern: 'hinge',
      role: 'secondary',
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
      candidateExerciseIds: [
        'romanian-deadlift',
        'hyperextension',
      ],
      tags: ['hamstrings', 'glutes'],
    },

    {
      id: 'a-arms',
      pattern: 'arms',
      role: 'accessory',
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
      candidateExerciseIds: [
        'dumbbell-biceps-curl',
        'triceps-pushdown',
      ],
      tags: ['arms'],
    },
  ],
},
  {
  id: 'gym-fullbody-b',
  title: 'Full Body B',
  slots: [
    {
      id: 'b-single-leg',
      pattern: 'single_leg',
      role: 'primary',
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
      candidateExerciseIds: [
        'bulgarian-split-squat',
        'single-leg-press',
        'step-up',
      ],
      tags: ['legs', 'glutes', 'quads'],
    },

    {
      id: 'b-horizontal-pull',
      pattern: 'horizontal_pull',
      role: 'primary',
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
      candidateExerciseIds: [
        'seated-cable-row',
        't-bar-row',
      ],
      tags: ['back'],
    },

    {
      id: 'b-horizontal-push',
      pattern: 'horizontal_push',
      role: 'primary',
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
      candidateExerciseIds: [
        'incline-bench-press',
        'incline-chest-press-machine',
        'elevated-push-up',
      ],
      tags: ['chest', 'triceps'],
    },

    {
      id: 'b-glutes',
      pattern: 'glute',
      role: 'secondary',
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
      candidateExerciseIds: [
        'hip-extension-machine',
        'cable-hip-extension',
        'hip-abduction-machine',
      ],
      tags: ['glutes'],
    },

    {
      id: 'b-core',
      pattern: 'core',
      role: 'accessory',
      sets: 3,
      target: {
        type: 'reps',
        mode: 'range',
        min: 8,
        max: 12,
      },
      restSeconds: {
        min: 30,
        max: 60,
      },
      candidateExerciseIds: [
        'crunch',
        'reverse-crunch',
      ],
      tags: ['core'],
    },
  ],
},
  {
  id: 'gym-fullbody-c',
  title: 'Full Body C',
  slots: [
    {
      id: 'c-hinge',
      pattern: 'hinge',
      role: 'primary',
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
      candidateExerciseIds: [
        'romanian-deadlift',
        'hyperextension',
      ],
      tags: ['hamstrings', 'glutes'],
    },

    {
      id: 'c-horizontal-push',
      pattern: 'horizontal_push',
      role: 'primary',
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
      candidateExerciseIds: [
        'barbell-bench-press',
        'chest-press-machine',
        'push-up',
      ],
      tags: ['chest', 'triceps'],
    },

    {
      id: 'c-vertical-pull',
      pattern: 'vertical_pull',
      role: 'primary',
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
      candidateExerciseIds: [
        'close-grip-lat-pulldown',
        'lat-pulldown',
        'assisted-pull-up',
        'pull-up',
      ],
      tags: ['back', 'pullups'],
    },

    {
      id: 'c-squat',
      pattern: 'squat',
      role: 'secondary',
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
      candidateExerciseIds: [
        'leg-press',
        'barbell-squat',
        'goblet-squat',
      ],
      tags: ['legs', 'quads', 'glutes'],
    },

    {
      id: 'c-calves',
      pattern: 'calves',
      role: 'accessory',
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
      candidateExerciseIds: [
        'standing-calf-raise',
        'calf-raise-machine',
      ],
      tags: ['calves'],
    },
  ],
},
]