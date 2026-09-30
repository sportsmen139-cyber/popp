import type { BaseProgram } from '../types/program'

export const basePrograms: BaseProgram[] = [
  {
    id: 'gym-fullbody-3',
    title: 'Зал — Full Body 3 раза в неделю',

    environments: ['gym'],

    daysPerWeek: 3,

    split: 'full_body',

    supportedLevels: [
      'beginner',
      'intermediate',
      'advanced',
    ],

    workoutTemplateIds: [
      'gym-fullbody-a',
      'gym-fullbody-b',
      'gym-fullbody-c',
    ],

    version: 1,
  },
]