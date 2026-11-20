// Private, same-origin preview only. No assignments or browser-storage writes.
const $ = (id) => document.getElementById(id)
let catalog
let requestVersion = 0
const levels = { intermediate: 'Средний', advanced: 'Продвинутый' }
const targets = { legs: 'Ноги', shoulders: 'Плечи', arms: 'Руки', quads: 'Квадрицепсы', hamstrings: 'Задняя поверхность бедра', shoulders_arms: 'Плечи и руки' }
function node(tag, text, parent, className) {
  const item = document.createElement(tag)
  if (text !== undefined) item.textContent = text
  if (className) item.className = className
  parent?.append(item)
  return item
}
function profile(program) {
  return { environment: 'gym', daysPerWeek: $('days').value, level: $('level').value,
    goalType: 'hypertrophy', targetType: 'muscle_group', targetId: program.targetId }
}
async function api(path, data) {
  const response = await fetch(path, data ? { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Review-CSRF': catalog.csrf }, body: JSON.stringify(data) } : undefined)
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Не удалось загрузить проверенные данные.')
  return result
}
function renderPrograms() {
  requestVersion++
  $('preview').replaceChildren()
  $('preview').hidden = true
  $('programs').replaceChildren()
  let matches = 0
  for (const program of catalog.programs) {
    const matchesProfile = program.level === $('level').value && String(program.daysPerWeek) === $('days').value
    if (matchesProfile) matches++
    const card = node('section', undefined, $('programs'), 'exercise')
    card.dataset.program = program.programId
    node('h3', targets[program.targetId], card)
    node('p', `${program.programId} · версия ${program.programVersion} · ${levels[program.level]} · ${program.daysPerWeek} дня · ${program.weeks} недель`, card, 'meta')
    node('p', 'Назначение заблокировано до технического допуска.', card)
    const button = node('button', 'Посмотреть программу', card)
    button.disabled = !matchesProfile
    button.addEventListener('click', () => loadPreview(program))
  }
  $('selection-note').textContent = matches ? `Подходящих программ в этой группе: ${matches}. Доступен только просмотр.` : 'В этой группе нет программ для выбранного сочетания. Другая программа автоматически не назначается.'
  $('message').textContent = ''
}
function range(low, high) {
  return low === null || high === null ? 'не указан' : low === high ? String(low) : `${low}–${high}`
}
function renderPreview(data) {
  const root = $('preview')
  root.replaceChildren()
  root.hidden = false
  node('h2', data.title, root)
  node('p', `${data.programId}@${data.programVersion} · исходные ID и версии сохранены`, root, 'meta')
  const notice = node('section', undefined, root, 'notice')
  node('strong', 'Смотреть можно. Начать тренировку пока нельзя.', notice)
  const list = node('ul', undefined, notice)
  data.blockers.forEach((b) => node('li', b.message, list))
  const start = node('button', 'Тренировка недоступна', notice)
  start.disabled = true
  const correction = data.corrections[0]
  if (correction) {
    const info = node('section', undefined, root, 'panel')
    node('h3', 'Dead Bug: решение тренера', info)
    node('p', correction.decision.rep_definition_ru, info)
    node('p', `${correction.decision.technique_rule_ru} Следующую дозировку применяют только после согласованного перехода фазы, не по календарю.`, info)
    node('p', 'Исходные 15 → 20 → 25 секунд сохранены. Дозировка в повторениях — отдельное методическое решение, а не пересчёт времени.', info)
  }
  for (const phase of data.phases) {
    const section = node('section', undefined, root, 'panel')
    section.dataset.phase = phase.phase_id
    const first = phase.sessions[0].record
    node('h3', `${first.phase_name} · недели ${first.phase_week_start}–${first.phase_week_end}`, section)
    node('p', 'Недели показывают структуру источника. Они не разрешают автоматический переход фазы.', section, 'meta')
    for (const session of phase.sessions) {
      const detail = node('details', undefined, section)
      node('summary', `День ${session.record.cycle_day}: ${session.record.session_name}`, detail)
      for (const slot of session.slots) {
        const exercise = data.exercises[slot.exercise_id]
        const card = node('article', undefined, detail, 'exercise')
        card.dataset.slot = slot.slot_id
        node('h3', exercise.name, card)
        node('p', `${exercise.id}@${exercise.version} · ${slot.slot_id}`, card, 'meta')
        const change = correction?.changes.find((c) => c.slot_id === slot.slot_id)
        const dose = change ? `${slot.sets} подхода по ${slot.rep_min} повторений на каждую сторону`
          : slot.time_seconds !== null ? `${slot.sets} подхода по ${slot.time_seconds} секунд`
          : slot.distance_meters !== null ? `${slot.sets} подхода по ${slot.distance_meters} метров`
          : `${slot.sets} подхода по ${range(slot.rep_min, slot.rep_max)} повторений`
        node('p', dose, card)
        node('p', `Отдых: ${range(slot.rest_min_seconds, slot.rest_max_seconds)} сек. · RIR: ${range(slot.rir_min, slot.rir_max)} · минимум подходов: ${slot.minimum_sets}`, card, 'meta')
        if (change) {
          node('p', `Исходник: ${change.original.sets} подхода по ${change.original.time_seconds} секунд. Назначение в повторениях утверждено владельцем отдельно.`, card, 'meta')
          node('p', correction.decision.technique_rule_ru, card)
        } else if (slot.difficulty_target) node('p', slot.difficulty_target, card)
        if (exercise.equipment.state !== 'declared') node('p', 'Оборудование: неизвестно, требуется уточнение.', card)
        else node('p', `Оборудование: ${exercise.equipment.options.map((kit) => kit.all_of.map((e) => data.equipmentNames[e.equipment_id] || e.equipment_id).join(' + ')).join(' или ')}`, card)
      }
    }
  }
  node('p', 'Альтернативы не включены. Неизвестные значения RIR и недельного объёма не заменяются нулём. Исходная программа и история Alpha не меняются.', root, 'meta')
}
async function loadPreview(program) {
  const version = ++requestVersion
  $('preview').hidden = true
  $('message').textContent = 'Загрузка проверенного состава…'
  try {
    const data = await api('/api/author-programs/preview', { programId: program.programId, profile: profile(program) })
    if (version !== requestVersion) return
    renderPreview(data)
    $('message').textContent = 'Загружен предварительный просмотр. Назначение не создано.'
    $('preview').scrollIntoView({ block: 'start' })
  } catch (error) {
    if (version === requestVersion) $('message').textContent = error.message
  }
}
try {
  catalog = await api('/api/author-programs')
  renderPrograms()
  $('level').addEventListener('change', renderPrograms)
  $('days').addEventListener('change', renderPrograms)
} catch (error) {
  $('message').textContent = error.message
}
