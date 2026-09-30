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
]