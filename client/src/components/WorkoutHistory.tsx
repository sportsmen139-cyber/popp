import { useState } from 'react'
import { exercises } from '../data/exercises'
import { workoutTemplates } from '../data/workoutTemplates'
import type { WorkoutSessionResult } from '../types/workoutSession'
import { ActionButton } from './ui/Primitives'

export function WorkoutHistory({ history }: { history: readonly WorkoutSessionResult[] }) {
  const [visibleCount, setVisibleCount] = useState(20)
  const records = history.map((session, index) => ({ session, index })).reverse().slice(0, visibleCount)
  return (
    <section className="progress-card workout-history" aria-labelledby="workout-history-title">
      <h2 id="workout-history-title">История тренировок</h2>
      <p className="progress-note">Все сохранённые тренировки. Открой запись, чтобы посмотреть подходы.</p>
      {records.length === 0 ? <p>Пока нет завершённых тренировок.</p> : <>
        <div className="workout-history-list">
          {records.map(({ session, index }) => {
            const validDate = Number.isFinite(Date.parse(session.completedAt))
            const title = workoutTemplates.find((item) => item.id === session.workoutTemplateId)?.title ?? 'Сохранённая тренировка'
            return <details className="workout-history-record" key={`${session.completedAt}-${index}`}>
              <summary>
                <strong>{title}</strong>
                {validDate ? <time dateTime={session.completedAt}>{new Date(session.completedAt).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}</time> : <span className="workout-history-date">Дата не указана</span>}
              </summary>
              <div className="workout-history-exercises">
                {session.exercises.map((exercise, exerciseIndex) => <article className="workout-history-exercise" key={`${exercise.exerciseId}-${exerciseIndex}`}>
                  <h3>{exercises.find((item) => item.id === exercise.exerciseId)?.name ?? 'Упражнение из предыдущей версии'}</h3>
                  {exercise.sets.length === 0 ? <p>Подходы не записаны.</p> : <ul>
                    {[...exercise.sets].sort((a, b) => a.setNumber - b.setNumber).map((set, setIndex) => <li key={`${set.setNumber}-${setIndex}`}>
                      Подход {set.setNumber}: {set.weightKg === undefined ? 'вес не указан' : `${String(set.weightKg).replace('.', ',')} кг`}
                      {' · '}{set.reps === undefined ? 'повторения не указаны' : `${set.reps} повт.`}
                    </li>)}
                  </ul>}
                </article>)}
              </div>
            </details>
          })}
        </div>
        <p className="progress-note">Показано {records.length} из {history.length}</p>
        {visibleCount < history.length && <ActionButton variant="secondary" onClick={() => setVisibleCount((count) => count + 20)}>Показать ещё</ActionButton>}
      </>}
    </section>
  )
}
