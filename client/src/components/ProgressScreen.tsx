import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { exercises } from '../data/exercises'
import { buildProgressSummary } from '../domain/progress/buildProgressSummary'
import type { TrainingGoal } from '../types/goal'
import type { ExerciseLoadPoint, ProgressPeriodWeeks, WeeklyWorkoutProgress } from '../types/progressAnalytics'
import type { WorkoutSessionResult } from '../types/workoutSession'
import './ProgressScreen.css'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const signedNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1, signDisplay: 'always' })
const shortDate = (timestamp: number) => new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const fullDate = (value: string | number) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

function LoadTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: ExerciseLoadPoint }[] }) {
  const point = payload?.[0]?.payload
  if (!active || !point || point.averageWeightKg === null || point.minWeightKg === null || point.maxWeightKg === null) return null
  return <div className="progress-tooltip">
    <strong>{fullDate(point.completedAt)}</strong>
    <p>{number.format(point.averageWeightKg)} кг · средний вес</p>
    <p>{number.format(point.minWeightKg)}–{number.format(point.maxWeightKg)} кг · диапазон подходов</p>
    <p>Подходов с записью: {point.recordedSets} из {point.totalSets}</p>
    {point.repsBySet.map(set => <p key={set.setNumber}>Подход {set.setNumber}: {set.reps === null ? 'повторения не записаны' : `${set.reps} повт.`}</p>)}
  </div>
}

function WeeklyTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: WeeklyWorkoutProgress }[] }) {
  const week = payload?.[0]?.payload
  if (!active || !week) return null
  return <div className="progress-tooltip">
    <strong>Неделя с {week.label}</strong>
    <p>{week.currentPlanTarget ? `${week.completed} из ${week.currentPlanTarget} по текущему плану` : `Завершено: ${week.completed}`}</p>
    {week.isCurrentWeek && <p>Неделя ещё продолжается</p>}
  </div>
}

export function ProgressScreen({ history, daysPerWeek, goal, onBack }: {
  history: readonly WorkoutSessionResult[]
  daysPerWeek?: number
  goal: TrainingGoal
  onBack: () => void
}) {
  const [periodWeeks, setPeriodWeeks] = useState<ProgressPeriodWeeks>(12)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const view = buildProgressSummary({ history, daysPerWeek, goal, periodWeeks, now, selectedExerciseId, exerciseCatalog: exercises })
  const target = view.weekly[0]?.currentPlanTarget
  const change = view.loadTrend.comparableChange

  return <main className="app">
    <section className="progress-screen" aria-labelledby="progress-title">
      <button className="progress-back" type="button" onClick={onBack}>← К тренировке</button>
      <header className="progress-header">
        <div>
          <p className="program-label">Твоя история</p>
          <h1 id="progress-title">Мой прогресс</h1>
          <p className="subtitle">Смотри, как складываются тренировки и меняется записанный вес.</p>
        </div>
        <div className="progress-period" role="group" aria-label="Период прогресса">
          {([4, 8, 12] as const).map(weeks => <button key={weeks} type="button" aria-pressed={periodWeeks === weeks} onClick={() => setPeriodWeeks(weeks)}>
            {weeks} {weeks === 4 ? 'недели' : 'недель'}
          </button>)}
        </div>
      </header>
      <p className="progress-period-caption">С {fullDate(view.window.start.toISOString())} · включая текущую неделю</p>

      <div className="progress-summary" aria-label="Краткие итоги">
        <article className="progress-card progress-stat">
          <h2>Тренировок за период</h2>
          <strong className="progress-stat-number">{view.workoutCount}</strong>
          <p>Завершено и сохранено</p>
        </article>
        <article className="progress-card progress-stat">
          <h2>Последняя тренировка</h2>
          <strong>{view.lastWorkoutAt ? <time dateTime={view.lastWorkoutAt}>{fullDate(view.lastWorkoutAt)}</time> : 'Пока нет тренировок'}</strong>
          <p>Последняя запись за всё время</p>
        </article>
        <article className="progress-card progress-stat">
          <h2>Текущая цель</h2><strong>{view.goalLabel}</strong><p>Из твоего профиля</p>
        </article>
        <article className="progress-card progress-stat">
          <h2>Упражнение на графике</h2><strong>{view.selectedExerciseName ?? 'Пока нет записей'}</strong>
          <p>{change ? `${signedNumber.format(change.deltaKg)} кг к среднему весу подхода при тех же повторениях` : 'Изменение веса появится при сопоставимых записях'}</p>
        </article>
      </div>

      <div className="progress-charts">
        <section className="progress-card" aria-labelledby="load-title">
          <div className="progress-card-heading"><span className="progress-marker" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4v16h16M7 15l5-5 4 3 5-7" /></svg></span><div>
            <h2 id="load-title">История рабочего веса</h2>
            <p>Средний записанный вес подхода · кг</p>
          </div></div>
          <label className="progress-exercise-label" htmlFor="progress-exercise">Упражнение</label>
          <select id="progress-exercise" className="progress-select" value={view.selectedExerciseId ?? ''} disabled={view.exerciseOptions.length === 0} onChange={event => setSelectedExerciseId(event.target.value)}>
            {view.exerciseOptions.length === 0 && <option value="">Нет упражнений за период</option>}
            {view.exerciseOptions.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
          </select>
          {view.loadTrend.status === 'ready' ? <>
            <div className="progress-chart" role="img" aria-label={`Средний записанный вес: ${view.selectedExerciseName}. Данные доступны в таблице ниже.`}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={view.loadTrend.points} margin={{ top: 16, right: 16, bottom: 4, left: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#EEEAE2" vertical={false} />
                  <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={shortDate} tick={{ fill: '#656B61', fontSize: 11 }} minTickGap={32} axisLine={false} tickLine={false} />
                  <YAxis width={44} tick={{ fill: '#656B61', fontSize: 11 }} tickFormatter={value => number.format(value)} axisLine={false} tickLine={false} />
                  <Tooltip content={<LoadTooltip />} />
                  <Line dataKey="averageWeightKg" name="Средний вес" type="linear" stroke="#2F604A" strokeWidth={2.5} dot={{ r: 4, fill: '#2F604A', stroke: '#FFFFFF', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="progress-note">Учитываются все записанные подходы. Неполные или некорректные записи оставляют разрыв на графике. Записанный вес сам по себе не оценивает силу.</p>
            <details className="progress-records"><summary>Записи нагрузки</summary>
              <table><caption className="progress-sr-only">Записи выбранного упражнения</caption><thead><tr><th>Дата</th><th>Средний вес</th><th>Подходы</th></tr></thead>
                <tbody>{view.loadTrend.points.map((point, index) => <tr key={`${point.completedAt}-${index}`}><td>{shortDate(point.timestamp)}</td><td>{point.averageWeightKg === null ? 'Неполная запись' : `${number.format(point.averageWeightKg)} кг`}</td><td>{point.recordedSets} из {point.totalSets}</td></tr>)}</tbody>
              </table>
            </details>
          </> : <div className="progress-empty" role="status">
            <span className="progress-empty-symbol" aria-hidden="true">—</span>
            <h3>{view.loadTrend.status === 'no_exercise' ? 'История нагрузки ещё впереди' : 'Нужны хотя бы две записи'}</h3>
            <p>Заверши тренировки и запиши вес и повторения во всех подходах выбранного упражнения. Здесь появится его динамика.</p>
          </div>}
        </section>

        <section className="progress-card" aria-labelledby="weekly-title">
          <div className="progress-card-heading"><span className="progress-marker" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16M8 13v3m4-3v3m4-3v3" /></svg></span><div>
            <h2 id="weekly-title">Тренировки по неделям</h2><p>Каждый столбец — одна календарная неделя</p>
          </div></div>
          {view.workoutCount > 0 ? <>
            <div className="progress-chart progress-weekly-chart" role="img" aria-label="Количество сохранённых тренировок по неделям. Данные доступны в таблице ниже.">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={view.weekly} margin={{ top: 16, right: 12, bottom: 4, left: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#EEEAE2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#656B61', fontSize: 11 }} minTickGap={24} axisLine={false} tickLine={false} />
                  <YAxis width={28} allowDecimals={false} tick={{ fill: '#656B61', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<WeeklyTooltip />} cursor={{ fill: '#E7EFE8' }} />
                  {target && <ReferenceLine y={target} stroke="#8A9085" strokeDasharray="4 4" label={{ value: `План ${target}`, fill: '#656B61', fontSize: 11, position: 'insideTopRight' }} ifOverflow="extendDomain" />}
                  <Bar dataKey="completed" name="Завершено" fill="#2F604A" radius={[5, 5, 0, 0]} maxBarSize={32} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <details className="progress-records"><summary>Записи по неделям</summary>
              <table><caption className="progress-sr-only">Тренировки по неделям</caption><thead><tr><th>Неделя с</th><th>{target ? 'По текущему плану' : 'Завершено'}</th></tr></thead>
                <tbody>{view.weekly.map(week => <tr key={week.weekStart}><td>{week.label}{week.isCurrentWeek && ' · сейчас'}</td><td>{target ? `${week.completed} из ${target}` : week.completed}</td></tr>)}</tbody>
              </table>
            </details>
          </> : <div className="progress-empty" role="status"><span className="progress-empty-symbol" aria-hidden="true">—</span><h3>Пока нет тренировок за период</h3><p>После первой завершённой тренировки здесь появятся реальные записи по неделям.</p></div>}
          <p className="progress-note">{target ? `Пунктир — текущий план: ${target} в неделю. История изменений плана не сохранена. ` : ''}Текущая неделя ещё продолжается.</p>
        </section>
      </div>

      <div className="progress-bottom-grid">
        <section className="progress-card progress-weight" aria-labelledby="weight-title">
          <span className="progress-badge">Нет данных</span><h2 id="weight-title">Вес тела</h2>
          {view.weightHistory.status === 'not_available' && <p>История веса появится после начала Nutrition Tracking.</p>}
        </section>
        <section className="progress-card" aria-labelledby="insights-title">
          <h2 id="insights-title">Выводы</h2><p className="progress-note">Только наблюдения по записям выбранного периода.</p>
          {view.insights.length > 0 ? <ul className="progress-insights">{view.insights.map(insight => <li key={insight.id}><h3>{insight.title}</h3><p>{insight.message}</p></li>)}</ul>
            : <div className="progress-insights-empty"><h3>Пока рано делать выводы</h3><p>Нужно больше сохранённых тренировок и сопоставимых записей. Продолжай в своём темпе.</p></div>}
        </section>
      </div>
    </section>
  </main>
}
