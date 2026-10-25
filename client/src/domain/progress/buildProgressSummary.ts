import type { TrainingGoal } from '../../types/goal'
import type { ProgressPeriodWeeks, ProgressView } from '../../types/progressAnalytics'
import type { WorkoutSessionResult } from '../../types/workoutSession'
import { buildCoachMemory } from '../coach/buildCoachMemory'
import { resolveCoachInsights } from '../coach/resolveCoachInsight'
import { buildExerciseLoadTrend } from './buildExerciseLoadTrend'
import { buildWeeklyWorkoutProgress } from './buildWeeklyWorkoutProgress'
import { buildProgressWindow, historyInProgressWindow, startOfProgressWeek, validCompletedHistory } from './progressWindow'

function formatGoal(goal?: TrainingGoal | null): string {
  if (!goal) return 'Цель не выбрана'
  const labels: Record<TrainingGoal['goalType'], string> = {
    general_fitness: 'Поддерживать форму', hypertrophy: 'Рост мышц', strength: 'Развитие силы',
    exercise_performance: 'Улучшить упражнение', endurance: 'Выносливость',
    body_composition: 'Композиция тела', return_to_training: 'Вернуться к тренировкам',
  }
  const targets: Record<string, string> = {
    glutes: 'ягодицы', back: 'спина', chest: 'грудь', shoulders: 'плечи', legs: 'ноги',
    pull_up: 'подтягивания', bench_press: 'жим лёжа', squat: 'приседания',
  }
  return goal.target.type === 'whole_body' ? labels[goal.goalType]
    : `${labels[goal.goalType]} · ${targets[goal.target.id] ?? goal.target.id}`
}

/** Raw recorded sessions -> a single, chart-library-independent view model. */
export function buildProgressSummary(input: {
  history: readonly WorkoutSessionResult[]
  periodWeeks: ProgressPeriodWeeks
  now: Date
  daysPerWeek?: number
  goal?: TrainingGoal | null
  selectedExerciseId?: string | null
  exerciseCatalog: readonly { id: string; name: string }[]
}): ProgressView {
  const window = buildProgressWindow(input.periodWeeks, input.now)
  const allHistory = validCompletedHistory(input.history, window.end)
  const history = historyInProgressWindow(allHistory, window)
  const weekly = buildWeeklyWorkoutProgress({ history, window, daysPerWeek: input.daysPerWeek })
  const exerciseIds = new Set(history.flatMap(session => Array.isArray(session.exercises)
    ? session.exercises.map(exercise => exercise.exerciseId).filter(id => typeof id === 'string' && id.length > 0) : []))
  const exerciseOptions = [...exerciseIds].map(id => ({
    id, name: input.exerciseCatalog.find(exercise => exercise.id === id)?.name ?? id,
  })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const trends = new Map(exerciseOptions.map(exercise => [exercise.id, buildExerciseLoadTrend({ history, window, exerciseId: exercise.id })]))
  const requestedId = input.selectedExerciseId
  const selectedExerciseId = requestedId && exerciseIds.has(requestedId) ? requestedId
    : exerciseOptions.find(exercise => trends.get(exercise.id)?.status === 'ready')?.id ?? exerciseOptions[0]?.id ?? null
  const loadTrend = (selectedExerciseId ? trends.get(selectedExerciseId) : undefined) ?? buildExerciseLoadTrend({ history, window, exerciseId: null })
  const selectedExerciseName = exerciseOptions.find(exercise => exercise.id === selectedExerciseId)?.name ?? null
  const insights: ProgressView['insights'] = []

  // No schedule snapshots or onboarding date exist. Only describe recorded
  // weeks after the first known log, excluding that partial week and this week.
  const firstKnownWeek = allHistory[0] ? startOfProgressWeek(new Date(allHistory[0].completedAt)).getTime() : Infinity
  const observedFullWeeks = weekly.filter(week => !week.isCurrentWeek && Date.parse(week.weekStart) > firstKnownWeek)
  if (history.length > 0 && observedFullWeeks.length >= 3) {
    const emptyWeeks = observedFullWeeks.filter(week => week.completed === 0).length
    if (emptyWeeks === 0) {
      insights.push({
        id: 'consistent_records', title: 'Тренировки каждую неделю',
        message: `В каждой из ${observedFullWeeks.length} полных недель после первой записи есть хотя бы одна завершённая тренировка.`,
      })
    } else if (emptyWeeks >= 2) {
      insights.push({
        id: 'weeks_without_records', title: 'Есть недели без записей',
        message: `В ${emptyWeeks} из ${observedFullWeeks.length} полных недель после первой записи нет сохранённых тренировок. Это отсутствие записей, а не подтверждённые пропуски.`,
      })
    }
  }
  const change = loadTrend.comparableChange
  if (change && change.deltaKg !== 0) {
    const delta = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, signDisplay: 'always' }).format(change.deltaKg)
    insights.push({
      id: 'recorded_load_change', title: 'Изменение записанного веса',
      message: `${selectedExerciseName}: средний вес подхода изменился на ${delta} кг при том же числе подходов и повторений. Это сравнение записей, а не оценка силы.`,
    })
  }
  const coachHistory = history.filter(session => session.sessionContext?.checkIn && session.sessionContext?.adaptation)
  insights.push(...resolveCoachInsights(buildCoachMemory(coachHistory)).map(insight => ({ ...insight, id: `coach_${insight.id}` })))

  return {
    window, workoutCount: history.length,
    lastWorkoutAt: allHistory.at(-1)?.completedAt ?? null,
    goalLabel: formatGoal(input.goal), exerciseOptions, selectedExerciseId, selectedExerciseName,
    weekly, loadTrend, insights,
    weightHistory: { status: 'not_available', entries: [] },
  }
}
