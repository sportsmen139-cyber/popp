import type { TrainingEmphasis } from '../types/program'

export const trainingEmphases: TrainingEmphasis[] = [
  {
    id: 'balanced',
    title: 'Сбалансированный',
    description:
      'Равномерное развитие основных мышечных групп без дополнительного акцента.',
    rules: [],
  },

  {
    id: 'glutes',
    title: 'Акцент на ягодицы',
    description:
      'Программа остаётся сбалансированной, но при выборе упражнений приоритет получают варианты с акцентом на ягодицы.',
    rules: [
      {
        type: 'prefer_exercises',
        slotTag: 'glutes',
        exerciseIds: [
          'romanian-deadlift',
          'bulgarian-split-squat',
          'single-leg-press',
          'step-up',
          'hip-extension-machine',
          'cable-hip-extension',
          'hip-abduction-machine',
          'leg-press',
        ],
      },
    ],
  },
  {
  id: 'pullups',
  title: 'Акцент на подтягивания',
  description:
    'Программа остаётся сбалансированной, но больше внимания получает развитие подтягиваний и связанных тяговых движений.',
  rules: [
    {
      type: 'prefer_exercises',
      slotTag: 'pullups',
      exerciseIds: [
        'pull-up',
        'assisted-pull-up',
        'lat-pulldown',
        'close-grip-lat-pulldown',
      ],
    },
  ],
},
]