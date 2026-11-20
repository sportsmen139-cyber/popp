import { useState } from 'react'
import type { TrainingGoal } from '../types/goal'
import type { OnboardingProfile } from '../types/onboarding'
import { alphaGoalDirections } from '../data/alphaGoalChoices'
import type { GoalChoice } from '../data/alphaGoalChoices'
import { resolveTrainingPlan } from '../domain/program/resolveTrainingPlan'
import { resolveCurrentWorkout } from '../domain/program/resolveCurrentWorkout'
import { sourceTwoDayCandidate } from '../domain/program/sourceTwoDayCandidate'
import { ActionButton, OnboardingShell } from './ui/Primitives'
import { useScreenFocus } from './ui/useScreenFocus'
import './OnboardingGoal.css'

export function OnboardingGoal({
  onSelect,
  onBack,
  selection,
}: {
  onSelect: (goal: TrainingGoal) => void
  onBack: () => void
  selection: Omit<OnboardingProfile, 'goal'> & { completedWorkoutsCount: number }
}) {
  const [directionId, setDirectionId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState<GoalChoice | null>(null)
  const direction = alphaGoalDirections.find((item) => item.id === directionId)
  const hasBaseProgram = resolveTrainingPlan({ ...selection, goal: alphaGoalDirections[0].choices[0].goal }) !== null
  const availability = (choice: GoalChoice) => resolveCurrentWorkout({ ...selection, goal: choice.goal })
  const supports = (choice: GoalChoice) => availability(choice).ok
  useScreenFocus(`goal:${directionId}:${unavailable?.label ?? ''}`)

  function choose(choice: GoalChoice) {
    if (supports(choice)) onSelect(choice.goal)
    else setUnavailable(choice)
  }

  function back() {
    if (unavailable) {
      setUnavailable(null)
      if (direction?.choices.length === 1) setDirectionId(null)
    } else if (direction) setDirectionId(null)
    else onBack()
  }

  const sourceCandidate = unavailable ? sourceTwoDayCandidate({ ...selection, goal: unavailable.goal }) : null
  const title = unavailable ? sourceCandidate ? 'Программа готовится к подключению' : 'Для этой цели пока нет программы'
    : direction?.id === 'hypertrophy' ? 'На каких мышцах сделать акцент?'
    : direction ? 'Какое упражнение хочешь улучшить?' : 'Какая у тебя главная цель?'
  const description = unavailable ? unavailable.label
    : direction?.id === 'hypertrophy' ? 'Набор мышечной массы. Выбери специализацию.'
    : direction ? 'Улучшение конкретного упражнения. Выбери движение.'
    : 'Сначала направление. Затем — специализация, если она нужна.'
  const unavailableResult = unavailable ? availability(unavailable) : null
  const unavailableReason = unavailableResult && !unavailableResult.ok ? unavailableResult.reason : null

  return (
    <OnboardingShell
      step={4}
      title={title}
      description={description}
      onBack={back}
    >
      {unavailable ? <div className="goal-unavailable" role="status">
        <p>{sourceCandidate ? 'Для выбранной цели и уровня есть авторская программа на два занятия. Она ещё готовится к подключению: проверка оборудования и условий старта не завершена. Программа на три дня вместо неё не назначается.'
          : !hasBaseProgram ? 'Для выбранных условий программа не подключена. В Alpha доступен зал — 3 раза в неделю.'
          : unavailableReason === 'invalid_equipment_inventory' ? 'Сохранённый список оборудования не распознан. Проверь настройки оборудования перед подбором.'
          : unavailableReason === 'workout_unavailable' ? 'Не удалось собрать тренировку с указанным оборудованием. Программа не будет назначена без подходящего инвентаря.'
          : unavailable.hint}</p>
        <p>Тренировка для этой цели не назначена. Можно выбрать другое направление или вернуться к настройкам.</p>
        <ActionButton onClick={() => { setUnavailable(null); setDirectionId(null) }}>Выбрать другую цель</ActionButton>
      </div> : <>
        <aside className="goal-alpha-note" aria-label="Доступность программ">
          <strong>Сейчас в Alpha</strong>
          <p>{!hasBaseProgram ? 'Программа доступна для зала на 3 дня в неделю. Для выбранных условий назначения пока нет.'
            : direction?.id === 'hypertrophy' ? 'Доступен акцент на ягодицы в общей программе для зала на 3 дня. Отдельные программы набора массы из таблицы пока не подключены.'
            : direction ? 'Доступен акцент на подтягивания в общей программе для зала на 3 дня. Отдельные программы обучения упражнениям пока не подключены.'
            : 'Одна программа для зала на 3 дня: общая подготовка, акцент на ягодицы или подтягивания. Другие программы пока не подключены.'}</p>
        </aside>
        <div className="goal-choices">
          {direction ? direction.choices.map((choice) => <button type="button" className="goal-choice" key={choice.label}
            aria-label={choice.label} onClick={() => choose(choice)}>
            <strong>{choice.label}</strong><span>{choice.hint}</span>
            <span className={`goal-status ${supports(choice) ? 'is-available' : ''}`}>{supports(choice) ? 'Доступно в Alpha' : 'Пока недоступно в Alpha'}</span>
          </button>) : alphaGoalDirections.map((item) => {
            const available = item.choices.some(supports)
            return <button type="button" className="goal-choice" key={item.id} aria-label={item.label}
              onClick={() => { setDirectionId(item.id); if (item.choices.length === 1) choose(item.choices[0]) }}>
              <strong>{item.label}</strong><span>{item.hint}</span>
              <span className={`goal-status ${available ? 'is-available' : ''}`}>{available
                ? item.id === 'hypertrophy' ? 'Доступен акцент на ягодицы' : item.id === 'exercise_performance' ? 'Доступен акцент на подтягивания' : 'Доступно в Alpha'
                : 'Пока недоступно в Alpha'}</span>
            </button>
          })}
        </div>
      </>}
    </OnboardingShell>
  )
}
