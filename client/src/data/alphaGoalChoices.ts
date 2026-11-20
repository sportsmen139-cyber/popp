import type { GoalType, TrainingGoal } from '../types/goal'

export type GoalChoice = { label: string; hint: string; goal: TrainingGoal }
type GoalDirection = {
  id: GoalType
  label: string
  hint: string
  choices: readonly GoalChoice[]
}

// Navigation metadata only, not imported prescriptions or permission to use a PRG.
// Source: 16_Программы I5:I112 (primary_goal), S5:S112 (specialization).
// Existing saved goal IDs and the three legacy variants remain unchanged.
const muscle = (label: string, id: Extract<TrainingGoal['target'], { type: 'muscle_group' }>['id']): GoalChoice => ({
  label, hint: 'Отдельная программа пока не подключена.',
  goal: { goalType: 'hypertrophy', target: { type: 'muscle_group', id }, priority: 'high' },
})

export const alphaGoalDirections: readonly GoalDirection[] = [
  {
    id: 'general_fitness', label: 'Общая физическая подготовка',
    hint: 'Поддерживать форму и развивать всё тело.',
    choices: [{ label: 'Общая физическая подготовка', hint: 'Сбалансированная программа без узкого акцента.',
      goal: { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' } }],
  },
  {
    id: 'hypertrophy', label: 'Набор мышечной массы', hint: 'Выбрать мышечную специализацию.',
    choices: [
      { label: 'Всё тело без специализации', hint: 'Программа общего набора массы пока не подключена.',
        goal: { goalType: 'hypertrophy', target: { type: 'whole_body' }, priority: 'normal' } },
      { ...muscle('Ягодицы', 'glutes'), hint: 'Увеличить ягодицы: существующая общая программа с акцентом на ягодицы.' },
      muscle('Спина', 'back'), muscle('Грудь', 'chest'), muscle('Плечи', 'shoulders'),
      muscle('Руки', 'arms'), muscle('Ноги', 'legs'), muscle('Передняя поверхность бедра', 'quads'),
      muscle('Задняя поверхность бедра', 'hamstrings'), muscle('Плечи и руки', 'shoulders_arms'),
    ],
  },
  {
    id: 'strength', label: 'Развитие силы', hint: 'Программа для роста силовых результатов.',
    choices: [{ label: 'Развитие силы', hint: 'Силовые программы источника пока не подключены.',
      goal: { goalType: 'strength', target: { type: 'whole_body' }, priority: 'normal' } }],
  },
  {
    // MUSCULAR_ENDURANCE in the source; keep the existing stored endurance ID.
    id: 'endurance', label: 'Мышечная выносливость', hint: 'Дольше выполнять мышечную работу.',
    choices: [{ label: 'Мышечная выносливость', hint: 'Программы мышечной выносливости пока не подключены.',
      goal: { goalType: 'endurance', target: { type: 'whole_body' }, priority: 'normal' } }],
  },
  {
    id: 'exercise_performance', label: 'Улучшение конкретного упражнения', hint: 'Выбрать движение, над которым хочешь работать.',
    choices: [
      { label: 'Подтягивания', hint: 'Лучше подтягиваться: существующая общая программа с приоритетом тяговых движений.',
        goal: { goalType: 'exercise_performance', target: { type: 'exercise', id: 'pull_up' }, priority: 'high' } },
      // Source PRG_000106, row 110. This option is not assignable in Alpha.
      { label: 'Отжимания на брусьях', hint: 'Отдельная программа пока не подключена.',
        goal: { goalType: 'exercise_performance', target: { type: 'exercise', id: 'dip' }, priority: 'high' } },
    ],
  },
]
