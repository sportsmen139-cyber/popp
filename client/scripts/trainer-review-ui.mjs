// Private review tool only. This module is never imported by the Mini App.
const $ = (id) => document.getElementById(id)
const statusNames = {
  pending: 'Ожидает проверки',
  approved: 'Утверждено',
  needs_correction: 'Требуется исправление',
  rejected: 'Отклонено',
  stale: 'Проверить повторно',
}
const kindNames = {
  program: 'Программа',
  exercise: 'Упражнение',
  alternative: 'Связь замены',
  equipment: 'Оборудование',
  muscle: 'Мышца',
  concept: 'Понятие',
  family: 'Семейство',
  pattern: 'Паттерн',
  evidence: 'Источник',
}
const blockerNames = {
  program_not_approved: 'Программа ещё не утверждена',
  mandatory_dependencies_not_approved: 'Не все обязательные зависимости проверены',
  structural_validation_failed: 'Есть структурные ошибки',
  equipment_contract_unresolved: 'Нужно явно разрешить неизвестные требования оборудования',
  typed_alternative_prescription_unresolved: 'Нужна явная дозировка замены с другой единицей',
  engine_support_not_verified: 'Поддержка Engine не подтверждена',
  publication_rights_not_confirmed: 'Права публикации не подтверждены',
}
let bundle,
  state,
  readiness,
  csrf,
  activeKey,
  busy = false
const selected = new Set()
const drafts = new Map()

function element(tag, text = '', parent) {
  const node = document.createElement(tag)
  node.textContent = text
  if (parent) parent.append(node)
  return node
}
function field(parent, title, value) {
  const block = element('div', '', parent)
  block.className = 'field'
  element('strong', title, block)
  element(
    'p',
    value === null || value === undefined || value === '' ? 'Не задано в источнике' : String(value),
    block,
  )
}
function disclosure(parent, title, value) {
  const details = element('details', '', parent)
  element('summary', title, details)
  element('pre', JSON.stringify(value, null, 2), details)
}
function titleFor(id, version = 1) {
  return bundle.units[`exercise:${id}@${version}`]?.title || id
}
function labelFor(key) {
  const unit = bundle.units[key]
  return `${kindNames[unit.kind]} · ${unit.id} · ${unit.title}`
}
function dateLabel(value) {
  if (!value) return ''
  return (
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)) + ' МСК'
  )
}
function depsApproved(key) {
  return bundle.units[key].dependencies.every((dep) => state.units[dep].status === 'approved')
}

async function api(path, options) {
  const response = await fetch(path, options)
  const data = await response.json()
  if (!response.ok)
    throw new Error(
      data.message || 'Не удалось подтвердить действие. Обнови журнал перед повтором.',
    )
  return data
}

function renderExercise(unit, card) {
  const { record: row, biomechanics, relations, equipment } = unit.payload
  for (const [key, label] of [
    ['minimum_level', 'Минимальный уровень'],
    ['measurement_unit', 'Единица результата'],
    ['load_type', 'Тип нагрузки'],
    ['assistance_mode', 'Помощь и отягощение'],
    ['setup', 'Подготовка'],
    ['execution_standard', 'Техника выполнения'],
    ['common_errors', 'Основные ошибки'],
    ['progression_options', 'Варианты прогрессии'],
    ['regression_options', 'Упрощения'],
    ['technical_prerequisites', 'Технические предпосылки'],
    ['strength_prerequisites', 'Силовые предпосылки'],
    ['balance_requirements', 'Равновесие'],
    ['limitations', 'Ограничения из источника'],
  ])
    field(card, label, row[key])
  field(
    card,
    'Оборудование',
    equipment.state === 'unknown'
      ? 'Требования неизвестны: отсутствие строк не считается пустым комплектом.'
      : equipment.options
          .map(
            (kit) =>
              `${kit.group}: ${kit.all_of.map((item) => Object.values(bundle.units).find((u) => u.kind === 'equipment' && u.id === item.equipment_id)?.title || item.equipment_id).join(' + ')}`,
          )
          .join('\nИЛИ\n'),
  )
  const muscles = relations.filter((r) => r.relation_type === 'MUSCLE')
  field(
    card,
    'Целевые мышцы и роли',
    muscles
      .map(
        (r) =>
          `${r.role} · ${r.value_ru} (${r.target_id}); ${r.volume_role}; коэффициент ${r.volume_coefficient ?? 'не назначен'}`,
      )
      .join('\n'),
  )
  field(
    card,
    'Среды и условия',
    relations
      .filter((r) => r.relation_type === 'LOCATION')
      .map((r) => `${r.target_id}: ${r.conditions || 'условия не указаны'}`)
      .join('\n'),
  )
  const bioLabels = {
    joint_actions: 'Суставные действия',
    body_position: 'Положение тела',
    support_configuration: 'Опоры',
    moving_segment: 'Движущийся сегмент',
    laterality: 'Стороны',
    grip: 'Хват',
    limb_position: 'Положение конечностей',
    resistance_direction: 'Направление сопротивления',
    resistance_profile: 'Профиль сопротивления',
    rom_start: 'Начало амплитуды',
    rom_end: 'Конец амплитуды',
    rom_adjustments: 'Изменения амплитуды',
    contraction_mode: 'Режим сокращения',
    stability_demand: 'Требования к устойчивости',
    local_fatigue_notes: 'Локальная усталость',
    systemic_fatigue_notes: 'Общая усталость',
    environment_requirements: 'Требования к среде',
  }
  const details = element('details', '', card)
  element('summary', 'Биомеханические особенности', details)
  for (const [key, label] of Object.entries(bioLabels)) field(details, label, biomechanics[0][key])
  field(card, 'Замечание в источнике', row.trainer_comment)
}

function renderProgram(unit, card) {
  const row = unit.payload.record
  field(
    card,
    'Параметры',
    `${row.primary_location} · ${row.level} · ${row.primary_goal}\n${row.days_per_week} дня в неделю · ${row.duration_weeks} недель · ${row.session_min_minutes}–${row.session_max_minutes} минут`,
  )
  for (const [key, label] of [
    ['prerequisites', 'Кому предназначена программа'],
    ['minimum_equipment', 'Минимальное оборудование'],
    ['progression_rule', 'Правило прогрессии из источника'],
    ['fatigue_management', 'Усталость и переход фаз'],
    ['missed_session_rule', 'Пропущенная тренировка'],
    ['adaptation_limits', 'Ограничения адаптации'],
  ])
    field(card, label, row[key])
  element('h3', `Все ${row.duration_weeks} номинальных недель`, card)
  element(
    'p',
    'Это план цикла, а не история выполнений. Переход фазы не выполняется автоматически по дате.',
    card,
  ).className = 'meta'
  for (const week of bundle.weeks) {
    const block = element('section', '', card)
    block.className = 'week'
    element('h3', `Неделя ${week.week} · ${week.phase_id}`, block)
    const phase = unit.payload.phases.find((p) => p.phase_id === week.phase_id)
    for (const session of phase.sessions) {
      const box = element('div', '', block)
      box.className = 'session'
      element(
        'strong',
        `День цикла ${session.record.cycle_day}: ${session.record.session_name}`,
        box,
      )
      element('p', `${session.record.session_id} · ${session.record.phase_name}`, box).className =
        'meta'
      const instructions = element('details', '', box)
      element('summary', 'Задача, разминка и полные назначения сессии', instructions)
      field(instructions, 'Основная задача', session.record.main_task)
      field(instructions, 'Разминка', session.record.warmup_rule)
      element('pre', JSON.stringify(session, null, 2), instructions)
      const list = element('ol', '', box)
      list.className = 'slot-list'
      for (const slot of session.slots) {
        const dose =
          slot.time_seconds !== null
            ? `${slot.time_seconds} сек.`
            : slot.distance_meters !== null
              ? `${slot.distance_meters} м`
              : `${slot.rep_min}–${slot.rep_max} повторений`
        element(
          'li',
          `${titleFor(slot.exercise_id, slot.exercise_version)} · ${slot.exercise_id} v${slot.exercise_version}\n${slot.sets} подх. × ${dose} · RIR ${slot.rir_min === null ? 'не задан' : `${slot.rir_min}–${slot.rir_max}`} · отдых ${slot.rest_min_seconds}–${slot.rest_max_seconds} сек.\n${slot.slot_id} · минимум ${slot.minimum_sets} подх. · пропуск ${slot.can_skip}`,
          list,
        )
      }
    }
  }
  disclosure(
    card,
    'Недельный объём по фазам: исходные поля, неизвестные коэффициенты и modelled_sets',
    unit.payload.weekly_volume_source,
  )
}

function renderAlternative(unit, card) {
  const row = unit.payload.record
  field(
    card,
    'Направленная замена',
    `${titleFor(row.source_exercise_id, row.source_version)} → ${titleFor(row.target_exercise_id, row.target_version)}`,
  )
  field(
    card,
    'Категория',
    row.equivalence === 'C'
      ? 'C — изменение программы, не обычная автоматическая замена'
      : `${row.equivalence} — требуется проверка контекста и дозировки`,
  )
  for (const [key, label] of [
    ['goal', 'Цель контекста'],
    ['program_role', 'Роль в программе'],
    ['level', 'Уровень'],
    ['preserved_features', 'Что сохраняется'],
    ['differences', 'Что отличается'],
    ['eligibility_conditions', 'Условия допустимости'],
    ['prescription_adjustment', 'Изменение назначения'],
    ['load_history_policy', 'Правило истории нагрузки'],
    ['reason', 'Обоснование'],
    ['trainer_comment', 'Исходное замечание'],
  ])
    field(card, label, row[key])
  disclosure(card, 'Привязки к конкретным позициям пилота', unit.payload.slot_links)
}

function renderDefinition(unit, card) {
  const row = unit.payload.record
  if (row.columns) {
    const labels =
      unit.kind === 'pattern'
        ? ['Категория', 'Код', 'Смысл', 'Граница категории', 'Статус', 'Комментарий']
        : unit.kind === 'family'
          ? [
              'ID',
              'Паттерн',
              'Семейство',
              'Критерий',
              'Правило замены',
              'Вопрос тренеру',
              'Статус',
              'Комментарий',
            ]
          : [
              'ID',
              'Цитирование',
              'Название',
              'URL источника',
              'Содержание',
              'Ограничения',
              'Статус',
              'Комментарий',
            ]
    for (const [index, label] of labels.entries())
      field(card, label, row.columns[String(index + 1)])
  } else {
    field(card, 'Определение', row.value_ru)
    field(card, 'Название EN', row.value_en)
    field(card, 'Условия и требования', row.conditions)
    field(card, 'Замечание в источнике', row.trainer_comment)
  }
}

function renderDependencies(unit) {
  const root = $('dependencies')
  root.replaceChildren()
  element('h2', 'Обязательные зависимости', root)
  const remaining = unit.dependencies.filter((key) => state.units[key].status !== 'approved')
  element(
    'p',
    unit.dependencies.length
      ? `Проверено ${unit.dependencies.length - remaining.length} из ${unit.dependencies.length}. Утверждение родительской записи требует отдельного действия после зависимостей.`
      : 'Самостоятельная карточка: обязательных зависимостей нет.',
    root,
  )
  if (!unit.dependencies.length) return
  const box = element('details', '', root)
  element('summary', `Показать зависимости (${unit.dependencies.length})`, box)
  const mark = element('button', 'Отметить доступные зависимости', box)
  mark.type = 'button'
  mark.className = 'secondary'
  mark.addEventListener('click', () => {
    for (const key of unit.dependencies)
      if (depsApproved(key) && state.units[key].status !== 'approved') selected.add(key)
    renderDependencies(unit)
    updateActions()
    $('dependencies').querySelector('details').open = true
  })
  for (const key of unit.dependencies) {
    const dep = bundle.units[key]
    const row = element('div', '', box)
    row.className = 'dependency'
    const label = element('label', '', row)
    label.className = 'check'
    const checkbox = element('input', '', label)
    checkbox.type = 'checkbox'
    checkbox.checked = selected.has(key)
    checkbox.disabled = busy || !depsApproved(key) || state.units[key].status === 'approved'
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(key)
      else selected.delete(key)
      updateActions()
    })
    element('span', `${labelFor(key)} · ${statusNames[state.units[key].status]}`, label)
    const open = element('button', `Открыть ${dep.id}`, row)
    open.type = 'button'
    open.className = 'secondary'
    open.addEventListener('click', () => {
      $('filter').value = 'all'
      fillEntities(key)
      selectEntity(key)
    })
    disclosure(row, `Полный состав зависимости: ${dep.covers.length} исходных записей`, dep.payload)
  }
}

function renderHistory() {
  const history = $('history')
  history.replaceChildren()
  element('h2', 'Журнал решений по карточке', history)
  const events = state.events.filter((e) => e.entity_key === activeKey)
  if (!events.length) element('p', 'Решений пока нет.', history)
  for (const event of events.slice(-12).reverse()) {
    const block = element('div', '', history)
    block.className = 'journal-item'
    element('strong', `${event.action} · ${event.reviewer} · ${dateLabel(event.timestamp)}`, block)
    element('p', event.comment || 'Без комментария', block)
    element(
      'p',
      `Версия: ${event.entity_version ?? 'не задана в исходнике'} · snapshot ${event.source_sha256}\nПакет ${event.bundle_hash}`,
      block,
    ).className = 'meta'
  }
}

function render() {
  const unit = bundle.units[activeKey]
  const card = $('card')
  card.replaceChildren()
  element('h2', unit.title, card)
  element(
    'p',
    `${kindNames[unit.kind]} · ${unit.id} · ${unit.version === null ? 'нет отдельной версии в исходнике; привязано к snapshot' : `v${unit.version}`}`,
    card,
  ).className = 'meta'
  element(
    'span',
    `Исходник: ${[...new Set(unit.covers.map((r) => r.review_status))].join(', ')}`,
    card,
  ).className = 'badge'
  element('span', `Решение: ${statusNames[state.units[activeKey].status]}`, card).className =
    `badge ${state.units[activeKey].status}`
  const first = unit.covers[0]
  field(
    card,
    'Источник',
    `${first.source.sheet} · строка ${first.source.row} · ${unit.version_scope}`,
  )
  if (unit.kind === 'exercise') renderExercise(unit, card)
  else if (unit.kind === 'program') renderProgram(unit, card)
  else if (unit.kind === 'alternative') renderAlternative(unit, card)
  else renderDefinition(unit, card)
  disclosure(card, 'Все исходные поля карточки без изменений', unit.payload)
  disclosure(card, `Явный состав решения (${unit.covers.length} исходных записей)`, unit.covers)
  renderDependencies(unit)
  renderHistory()
  renderMetrics()
  updateActions()
}

function renderMetrics() {
  $('metrics').replaceChildren()
  for (const [value, label] of [
    [bundle.scope.core_exercises.length, 'основных упражнений'],
    [bundle.scope.alternative_exercises.length, 'упражнений для замен'],
    [`${state.approved}/${state.total}`, 'карточек утверждено'],
    [state.events.length, 'записей журнала'],
  ]) {
    const block = element('div', '', $('metrics'))
    block.className = 'metric'
    element('strong', String(value), block)
    element('span', label, block)
  }
  $('readiness').replaceChildren()
  element('strong', 'Готовность будущего релиза', $('readiness'))
  const list = element('ul', '', $('readiness'))
  for (const code of readiness.blockers) element('li', blockerNames[code] || code, list)
  element('p', 'Публикация и подключение к Engine здесь отсутствуют.', $('readiness'))
}

function fillEntities(preferred) {
  const filter = $('filter').value
  const units = Object.values(bundle.units).filter(
    (u) =>
      filter === 'all' ||
      (filter === 'core' || filter === 'alternative_target'
        ? u.kind === 'exercise' && u.role === filter
        : filter === 'definitions'
          ? !['exercise', 'alternative', 'program'].includes(u.kind)
          : u.kind === filter),
  )
  $('entity').replaceChildren()
  for (const unit of units) {
    const option = element('option', `${unit.id} · ${unit.title}`, $('entity'))
    option.value = unit.key
  }
  if (preferred && units.some((u) => u.key === preferred)) $('entity').value = preferred
}

function selectEntity(key) {
  if (activeKey) drafts.set(activeKey, $('comment').value)
  activeKey = key
  $('entity').value = key
  $('comment').value = drafts.get(key) || ''
  $('ack').checked = false
  selected.clear()
  $('status').textContent = ''
  render()
  $('card').scrollIntoView({ block: 'start' })
}

function updateActions() {
  const manual = !busy && $('reviewer').value.trim() && $('ack').checked
  const comment = $('comment').value.trim()
  $('approve').disabled = !manual || !depsApproved(activeKey)
  for (const id of ['correction', 'reject', 'note']) $(id).disabled = !manual || !comment
  $('approve-selected').disabled = !manual || selected.size === 0
  $('approve-selected').textContent = `Утвердить отмеченные зависимости (${selected.size})`
  $('refresh').disabled = busy
  $('filter').disabled = busy
  $('entity').disabled = busy
  $('action-hint').textContent = !depsApproved(activeKey)
    ? 'Утверждение карточки заблокировано: сначала нужно проверить её зависимости.'
    : 'Укажи проверяющего и явно подтверди просмотр состава карточки. Предварительных утверждений нет.'
}

async function save(action, items = [activeKey]) {
  if (busy) return
  busy = true
  $('status').textContent = 'Сохраняем решение…'
  updateActions()
  try {
    const data = await api('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-CSRF': csrf },
      body: JSON.stringify({
        items,
        action,
        reviewer: $('reviewer').value,
        comment: $('comment').value,
        acknowledged: $('ack').checked,
        expected_head: state.head,
        source_sha256: bundle.source_sha256,
        bundle_hash: bundle.bundle_hash,
      }),
    })
    state = data.state
    readiness = data.release_readiness
    $('comment').value = ''
    drafts.delete(activeKey)
    $('ack').checked = false
    selected.clear()
    render()
    $('status').textContent =
      'Решение записано в отдельный локальный журнал. Исходный статус не изменён.'
  } catch (error) {
    $('status').textContent =
      error.message || 'Сохранение не подтверждено. Обнови журнал перед повтором.'
  } finally {
    busy = false
    updateActions()
  }
}

async function initialize() {
  try {
    const data = await api('/api/pilot')
    bundle = data.bundle
    state = data.state
    readiness = data.release_readiness
    csrf = data.csrf
    $('pilot-title').textContent =
      `${bundle.program_id} v${bundle.program_version} · ${bundle.units[bundle.program_key].title}`
    $('snapshot').textContent =
      `Snapshot SHA256: ${bundle.source_sha256}\nReview bundle: ${bundle.bundle_hash}`
    fillEntities(bundle.program_key)
    selectEntity(bundle.program_key)
    $('filter').addEventListener('change', () => {
      fillEntities()
      selectEntity($('entity').value)
    })
    $('entity').addEventListener('change', () => selectEntity($('entity').value))
    for (const id of ['reviewer', 'comment', 'ack']) $(id).addEventListener('input', updateActions)
    for (const [id, action] of [
      ['approve', 'approve'],
      ['correction', 'needs_correction'],
      ['reject', 'reject'],
      ['note', 'comment'],
    ])
      $(id).addEventListener('click', () => void save(action))
    $('approve-selected').addEventListener('click', () => void save('approve', [...selected]))
    $('refresh').addEventListener('click', async () => {
      try {
        const data = await api('/api/state')
        state = data.state
        readiness = data.release_readiness
        selected.clear()
        $('ack').checked = false
        render()
        $('status').textContent = 'Состояние журнала обновлено.'
      } catch {
        $('status').textContent = 'Не удалось обновить журнал. Новые решения не подтверждены.'
      }
    })
  } catch {
    $('status').textContent =
      'Не удалось открыть локальный review. Проверь запуск сервера и доступность snapshot.'
    for (const button of document.querySelectorAll('button')) button.disabled = true
  }
}
void initialize()
