// Private local service only. No imports from the working Mini App or its storage.
const $ = (id) => document.getElementById(id)
const apiRoot = document.body.dataset.pilotApiRoot || '/api/pilot-engine'
if (apiRoot !== '/api/pilot-engine' && !/^\/api\/author-pilot\/[a-f0-9]{32}$/.test(apiRoot)) throw new Error('Invalid local program context')
function apiPath(path) {
  if (apiRoot === '/api/pilot-engine') return path
  if (path === '/api/owner-statement') return apiRoot + '/owner-statement'
  if (path.startsWith('/api/pilot-engine')) return apiRoot + path.slice('/api/pilot-engine'.length)
  return path
}
for (const link of document.querySelectorAll('a[href="/api/pilot-engine/export"]')) link.href = apiPath('/api/pilot-engine/export')
let model, csrf, busy = false
const drafts = new Map()
const blockerLabels = {
  author_declaration_missing: 'Заявление владельца ещё не записано',
  technical_policy_unconfirmed: 'Техническая политика для этого scope не подтверждена',
  cycle_policy_unresolved: 'Нужно согласовать переход недель, фаз и переносы',
  progression_policy_unresolved: 'Нужны согласованные параметры прогрессии',
  engine_support_not_verified: 'Нет подтверждения совместимости точной версии Engine',
  publication_rights_not_confirmed: 'Права распространения не подтверждены',
  structural_validation_failed: 'Есть ошибки структуры назначений',
}
const diagnosticLabels = {
  PRESCRIPTION_UNIT_MISMATCH: 'Позиции с расхождением единиц во всём источнике',
  UNKNOWN_EQUIPMENT_REQUIREMENTS: 'Упражнения без явного required kit во всём источнике',
  LOCATION_OVERVIEW_COVERAGE_MISMATCH: 'Расхождения состава обзора Home',
  VOLUME_FREQUENCY_REVIEW: 'Расхождения частоты в расчёте объёма: требуется уточнение',
  VOLUME_ROLE_RECOMPUTATION_REVIEW: 'Отличия учёта мышечных ролей: не означают автоматически ошибку методики',
}
function node(tag, text, parent) {
  const result = document.createElement(tag)
  if (text) result.textContent = text
  if (parent) parent.append(result)
  return result
}
function button(text, parent, click, disabled = false) {
  const result = node('button', text, parent)
  result.type = 'button'
  result.disabled = disabled || busy
  result.dataset.constraint = String(disabled)
  result.addEventListener('click', click)
  return result
}
function field(parent, label, value) { node('p', `${label}: ${value ?? 'не задано'}`, parent) }
function input(parent, id, title, value = '', type = 'text') {
  const label = node('label', title, parent)
  label.htmlFor = id
  const result = node('input', '', parent)
  result.id = id
  result.type = type
  result.value = value
  return result
}
function choice(parent, id, title, entries, value) {
  const label = node('label', title, parent)
  label.htmlFor = id
  const result = node('select', '', parent)
  result.id = id
  for (const [key, title] of entries) {
    const option = node('option', title, result)
    option.value = key
  }
  if (value != null) result.value = value
  return result
}
function current() { return model.state.assignments[model.state.active_assignment_id] }
function unit(id, version) { return model.scope.units[`exercise:${id}@${version}`] }
function doseText(dose) { return `${dose.sets} подх. × ${dose.rep_min}–${dose.rep_max} повт. · RIR ${dose.rir_min === null ? 'не задан' : `${dose.rir_min}–${dose.rir_max}`} · отдых ${dose.rest_min_seconds}–${dose.rest_max_seconds} сек.` }
async function api(path, body) {
  const response = await fetch(apiPath(path), body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Review-CSRF': csrf }, body: JSON.stringify(body) } : undefined)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Действие не подтверждено. Обнови состояние перед повтором.')
  return data
}
function lock() {
  for (const control of document.querySelectorAll('button,input,select')) {
    if (busy) { control.dataset.wasDisabled = String(control.disabled); control.disabled = true }
    else if ('constraint' in control.dataset) { control.disabled = control.dataset.constraint === 'true'; delete control.dataset.wasDisabled }
    else if ('wasDisabled' in control.dataset) { control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled }
  }
}
async function send(action, extra = {}, draftKey) {
  if (busy) return
  busy = true
  lock()
  $('message').textContent = 'Сохраняем действие…'
  try {
    const command = { operation_id: crypto.randomUUID(), action, assignment_id: current()?.id || crypto.randomUUID(), ...extra }
    model = await api('/api/pilot-engine/command', { expected_head: model.engine_head, command })
    if (draftKey) drafts.delete(draftKey)
    render()
    $('message').textContent = 'Действие записано в отдельный журнал пилота.'
  } catch (error) { $('message').textContent = error.message }
  finally { busy = false; lock(); updateButtons() }
}
function renderPlan() {
  const week = model.scope.weeks.find((w) => w.week === Number($('plan-week').value))
  const phases = model.scope.units[model.scope.program_key].payload.phases
  const phase = phases.find((p) => p.phase_id === week.phase_id)
  const previousDay = $('plan-day').value
  $('plan-day').replaceChildren()
  for (const session of phase.sessions) {
    const option = node('option', `День ${session.record.cycle_day} · ${session.record.session_name}`, $('plan-day'))
    option.value = String(session.record.cycle_day)
  }
  if (phase.sessions.some((s) => String(s.record.cycle_day) === previousDay)) $('plan-day').value = previousDay
  const source = phase.sessions.find((s) => String(s.record.cycle_day) === $('plan-day').value)
  $('plan').replaceChildren()
  node('h3', `${source.record.phase_name} · ${source.record.session_id}`, $('plan'))
  field($('plan'), 'Разминка', source.record.warmup_rule)
  const list = node('ol', '', $('plan'))
  for (const slot of source.slots) node('li', `${unit(slot.exercise_id, slot.exercise_version).title} · ${doseText(slot)} · ${slot.slot_id}`, list)
}
function renderAuthor() {
  const root = $('source-facts')
  root.replaceChildren()
  field(root, 'Точный SHA256 исходника', model.overview.source_sha256)
  field(root, 'Состав источника', `${model.overview.counts.programs} программ · ${model.overview.counts.exercises} упражнений · ${model.overview.counts.eligible_exercises} неисключённых`)
  field(root, 'Остаются исключёнными', model.overview.excluded_exercises.join(', '))
  if (!model.overview.registered_source) node('p', 'Тестовый или незарегистрированный источник; эти числа не описывают авторский XLSX.', root).className = 'notice'
  $('source-issues').replaceChildren()
  for (const [code, count] of Object.entries(model.overview.known_technical_diagnostics)) field($('source-issues'), diagnosticLabels[code] || code, count)
  const bounds = node('ul', '', $('source-issues'))
  for (const value of model.overview.bounds) node('li', value, bounds)
  $('statement-text').textContent = model.statement_text
  $('declaration-form').hidden = !!model.declaration
  $('declaration-status').textContent = model.declaration
    ? `Заявление сохранено: ${model.declaration.command.reviewer} · ${model.declaration.timestamp}. Индивидуальные approvals карточек не создавались.`
    : 'Заявление ещё не сохранено. Исходные статусы NEEDS_REVIEW остаются без изменений.'
}
function renderReadiness() {
  $('scope-facts').replaceChildren()
  field($('scope-facts'), 'Основной пилот', `${model.scope.program_id} v${model.scope.program_version} · ${model.scope.scope.core_exercises.length} основных упражнений · ${model.scope.weeks.length} недель`)
  field($('scope-facts'), 'Включённых альтернатив', model.scope.scope.alternatives.length)
  field($('scope-facts'), 'Идентичность scope', model.scope.bundle_hash)
  $('blockers').replaceChildren()
  for (const code of model.readiness.blockers) {
    const text = code.startsWith('equipment_contract_unresolved:') ? `${code.split(':')[1]}: нужно явно определить оборудование` : blockerLabels[code] || code
    node('li', text, $('blockers'))
  }
  if (!model.readiness.blockers.length) node('li', 'Технические gates изолированного назначения пройдены. Production activation отсутствует.', $('blockers'))
}
function renderAssignment() {
  const assignment = current()
  $('assignment-form').hidden = !!assignment && assignment.status !== 'cycle_completed'
  $('assignment-summary').replaceChildren()
  if (!assignment) { node('p', 'Назначение ещё не создано. История Mini App не загружается и не изменяется.', $('assignment-summary')); return }
  field($('assignment-summary'), 'Участник', assignment.user_id)
  field($('assignment-summary'), 'Назначение', assignment.id)
  field($('assignment-summary'), 'Версия', `${assignment.program_id} v${assignment.program_version} · личная редакция ${assignment.personal_revision}`)
  field($('assignment-summary'), 'Ход цикла', `Неделя ${assignment.week} · подтверждённых сессий ${assignment.completed_sessions} · ${assignment.status === 'cycle_completed' ? 'цикл завершён' : assignment.held ? 'сохранена переносимая фаза' : 'активно'}`)
}
function renderExercise(slot, parent) {
  const source = slot.source_slot, actual = slot.effective
  const card = node('article', '', parent)
  card.className = 'exercise'
  card.dataset.slot = source.slot_id
  node('h3', unit(actual.exercise_id, actual.exercise_version).title, card)
  field(card, 'Исходное → фактическое', `${source.exercise_id} v${source.exercise_version} → ${actual.exercise_id} v${actual.exercise_version}`)
  field(card, 'Назначение', doseText(actual.prescription))
  if (slot.skipped) node('p', `Пропущено сегодня: ${slot.reason}. Пропуск не добавляет выполненные подходы.`, card).className = 'notice'
  if (actual.alternative_id) node('p', 'Новая нагрузка подбирается отдельно. Старые килограммы и результаты не скопированы.', card).className = 'notice'
  const technique = node('details', '', card)
  node('summary', 'Оборудование, техника и ограничения', technique)
  const payload = unit(actual.exercise_id, actual.exercise_version).payload
  for (const key of ['setup', 'execution_standard', 'common_errors', 'limitations']) field(technique, { setup: 'Подготовка', execution_standard: 'Техника', common_errors: 'Ошибки', limitations: 'Ограничения' }[key], payload.record[key])
  field(technique, 'Оборудование', payload.equipment.state === 'unknown' ? 'Требуется явный контракт' : payload.equipment.options.map((kit) => kit.all_of.map((i) => Object.values(model.scope.units).find((u) => u.kind === 'equipment' && u.id === i.equipment_id)?.title || i.equipment_id).join(' + ')).join(' ИЛИ '))
  const key = slot.slot_instance_id
  const draft = drafts.get(key) || { sets: Array.from({ length: actual.prescription.sets }, (_, n) => ({ set_number: n + 1, reps: null, resistance: null, rir: null, quality: 'unknown', ...slot.sets.find((r) => r.set_number === n + 1) })), context: slot.load_context, calibrated: slot.calibrated }
  const context = input(card, `${key}-context`, 'Устройство, настройки, помощь и стороны', draft.context)
  const calibratedLabel = node('label', '', card); calibratedLabel.className = 'check'
  const calibrated = node('input', '', calibratedLabel); calibrated.type = 'checkbox'; calibrated.checked = draft.calibrated
  node('span', 'Нагрузка подобрана для этого варианта и устройства', calibratedLabel)
  const rows = []
  for (const result of draft.sets) {
    const row = node('div', '', card); row.className = 'set-row'
    node('strong', `Рабочий подход ${result.set_number}`, row)
    const grid = node('div', '', row); grid.className = 'set-grid'
    const reps = input(grid, `${key}-reps-${result.set_number}`, 'Повторения', result.reps ?? '', 'number'); reps.min = '0'; reps.step = '1'
    const resistance = input(grid, `${key}-load-${result.set_number}`, 'Сопротивление, кг', result.resistance ?? '', 'number'); resistance.min = '0'; resistance.step = 'any'
    const rir = input(grid, `${key}-rir-${result.set_number}`, 'RIR — пусто, если неизвестен', result.rir ?? '', 'number'); rir.min = '0'; rir.max = '10'; rir.step = 'any'
    const quality = choice(grid, `${key}-quality-${result.set_number}`, 'Техника', [['unknown', 'Не оценена'], ['good', 'Стабильная'], ['poor', 'Нарушена']], result.quality)
    rows.push({ set_number: result.set_number, reps, resistance, rir, quality })
  }
  const gather = () => ({ context: context.value, calibrated: calibrated.checked, sets: rows.map((r) => ({ set_number: r.set_number, reps: r.reps.value === '' ? null : Number(r.reps.value), resistance: r.resistance.value === '' ? null : Number(r.resistance.value), rir: r.rir.value === '' ? null : Number(r.rir.value), quality: r.quality.value })) })
  for (const control of card.querySelectorAll('input,select')) control.addEventListener('input', () => drafts.set(key, gather()))
  button('Сохранить фактические подходы', card, () => void send('save_exercise', { slot_id: source.slot_id, ...gather() }, key), slot.skipped).dataset.action = 'save'
  const why = input(card, `${key}-reason`, 'Причина пропуска или изменения')
  button('Пропустить сегодня', card, () => void send('skip_today', { slot_id: source.slot_id, reason: why.value }, key)).dataset.action = 'skip'
  button('Отменить изменение сегодня', card, () => void send('undo_today', { slot_id: source.slot_id, reason: why.value }, key)).dataset.action = 'undo-today'
  const candidates = model.choices[source.slot_id] || []
  const alternatives = choice(card, `${key}-alternative`, 'Подготовленная замена сегодня', [['', 'Выбери допустимый вариант'], ...candidates.map((c) => [c.alternative_id, unit(c.exercise_id, c.exercise_version).title])])
  alternatives.disabled = !candidates.length
  const description = node('div', '', card)
  alternatives.addEventListener('change', () => {
    description.replaceChildren()
    const selected = candidates.find((c) => c.alternative_id === alternatives.value)
    if (selected) {
      field(description, 'Отличия', selected.differences); field(description, 'Техника', selected.execution_standard)
      field(description, 'Новое назначение', doseText(selected.prescription))
      field(description, 'Оборудование', unit(selected.exercise_id, selected.exercise_version).payload.equipment.options?.map((k) => k.all_of.map((i) => i.equipment_id).join(' + ')).join(' ИЛИ ') || 'См. явный контракт')
    }
  })
  button('Заменить сегодня', card, () => void send('replace_today', { slot_id: source.slot_id, alternative_id: alternatives.value, reason: why.value }, key), !candidates.length).dataset.action = 'replace'
  if (!candidates.length) node('p', 'Нет подготовленных допустимых замен для этой позиции. Случайные, обратные и транзитивные варианты не предлагаются.', card).className = 'meta'
  const permanent = node('details', '', card)
  node('summary', 'Изменить только мою программу на будущее', permanent)
  const report = model.impacts[source.exercise_id]
  if (report) field(permanent, 'Изменение объёма', `Номинальные рабочие подходы по фазам: ${JSON.stringify(report.nominal_weekly_sets_by_phase)}. Нужна отдельная оценка мышечных ролей и структуры.`)
  if (report?.mandatory_slots.length) node('p', 'Удаление затрагивает обязательные позиции. Автоматическое удаление недоступно без пересмотра структуры.', permanent)
  button('Убрать из моей программы', permanent, () => void send('personal_change', { exercise_id: source.exercise_id, exercise_version: source.exercise_version, mode: 'remove', alternative_id: null, reason: why.value }), !!report?.mandatory_slots.length).dataset.action = 'remove-permanent'
  const personalCandidates = model.personal_choices[source.slot_id] || []
  const permanentChoice = choice(permanent, `${key}-permanent-choice`, 'Согласованный вариант на будущее', [['', 'Выбери согласованное изменение'], ...personalCandidates.map((c) => [c.alternative_id, `${c.equivalence}: ${unit(c.exercise_id, c.exercise_version).title}`])])
  permanentChoice.disabled = !personalCandidates.length
  const permanentDescription = node('div', '', permanent)
  permanentChoice.addEventListener('change', () => {
    permanentDescription.replaceChildren()
    const selected = personalCandidates.find((c) => c.alternative_id === permanentChoice.value)
    if (selected) {
      field(permanentDescription, 'Изменение программы', selected.equivalence === 'C' ? 'C — отдельное согласованное назначение, с пересмотром дозы и объёма' : 'Согласованная направленная замена на будущее')
      field(permanentDescription, 'Отличия', selected.differences)
      field(permanentDescription, 'Подготовка', selected.setup)
      field(permanentDescription, 'Техника', selected.execution_standard)
      field(permanentDescription, 'Новое назначение', doseText(selected.prescription))
    }
  })
  button('Заменить в моей программе', permanent, () => void send('personal_change', { exercise_id: source.exercise_id, exercise_version: source.exercise_version, mode: 'replace', alternative_id: permanentChoice.value, reason: why.value }), !personalCandidates.length).dataset.action = 'replace-permanent'
  const suggestion = model.suggestions[actual.exercise_id]
  if (suggestion) field(card, 'Прогрессия', suggestion.reason + (suggestion.action === 'increase_suggestion' ? ` Предложение сопротивления: ${suggestion.resistance} кг; ${suggestion.rep_target} повт., ${suggestion.sets} подх.` : ''))
}
function renderSession() {
  const root = $('session'); root.replaceChildren()
  const assignment = current()
  if (!assignment) { node('p', 'После технической готовности здесь появятся назначение, ввод подходов, пропуск и допустимые замены.', root); return }
  if (assignment.status === 'cycle_completed') { node('p', 'Восемь недель завершены. Повтор возможен только новым назначением; прежняя история сохранена.', root); return }
  if (assignment.session) {
    const session = assignment.session
    node('h3', `Неделя ${session.week} · ${session.phase_id} · день ${session.cycle_day}`, root)
    for (const slot of session.slots) renderExercise(slot, root)
    button('Сохранить завершение тренировки', root, () => void send('finish_session')).id = 'finish-session'
    const stopReason = input(root, 'stop-reason', 'Причина остановки / самочувствие')
    button('Остановить и сохранить факты', root, () => void send('stop_session', { reason: stopReason.value }))
  } else {
    if (assignment.transition_pending) node('p', `Переход к неделе ${assignment.transition_pending} ожидает решения тренера. Можно сохранить предыдущую переносимую фазу.`, root).className = 'notice'
    button('Начать текущую тренировку', root, () => void send('start_session', { session_id: crypto.randomUUID() })).id = 'start-session'
    const why = input(root, 'schedule-reason', 'Причина переноса или изменения фазы')
    const when = input(root, 'schedule-at', 'Новое время на этом Mac', '', 'datetime-local')
    const schedule = (action) => {
      if (!when.value) { $('message').textContent = 'Укажи новое время.'; return }
      void send(action, { reason: why.value, scheduled_at: new Date(when.value).toISOString() })
    }
    button('Перенести занятие', root, () => schedule('postpone'))
    button('Записать пропуск занятия', root, () => schedule('missed'))
    const reviewer = input(root, 'phase-reviewer', 'Тренер, подтверждающий фазу')
    const ackLabel = node('label', '', root); ackLabel.className = 'check'
    const ack = node('input', '', ackLabel); ack.type = 'checkbox'; ack.id = 'phase-ack'
    node('span', 'Проверены техника, настройки и восстановление; решение по фазе принято явно', ackLabel)
    button('Сохранить переносимую фазу', root, () => void send('hold_phase', { reason: why.value, reviewer: reviewer.value, acknowledged: ack.checked }))
    button('Разрешить переход / продолжение', root, () => void send('resume_phase', { reason: why.value, reviewer: reviewer.value, acknowledged: ack.checked }))
  }
}
function renderHistory() {
  $('personal-changes').replaceChildren(); $('history').replaceChildren()
  const assignments = Object.values(model.state.assignments)
  for (const assignment of assignments) {
    for (const change of Object.values(assignment.personal_changes)) {
      const row = node('div', '', $('personal-changes'))
      field(row, 'Личное изменение', `${change.original_exercise_id} v${change.original_version} · ${change.action} · ${change.reason}`)
      const why = input(row, `undo-${change.change_id}`, 'Причина возврата к исходному варианту')
      button('Вернуть исходный вариант на будущее', row, () => void send('undo_personal_change', { exercise_id: change.original_exercise_id, exercise_version: change.original_version, reason: why.value }))
    }
    for (const session of [...assignment.history].reverse()) {
      const details = node('details', '', $('history')); details.className = 'history-item'
      node('summary', `${session.ended_at} · неделя ${session.week} / день ${session.cycle_day} · ${session.status} · фактических подходов ${session.performed_sets}`, details)
      field(details, 'Идентичность', `${session.assignment_id} · ${session.id} · ${session.program_id} v${session.program_version} · личная редакция ${session.personal_revision}`)
      for (const slot of session.slots) field(details, `${slot.source_slot.exercise_id} → ${slot.effective.exercise_id}`, `${slot.skipped ? 'Пропущено: ' + slot.reason : 'Фактический вариант'}; ${JSON.stringify(slot.sets)}`)
    }
  }
  $('paths').textContent = `Заявления: ${model.storage.author_file}\nНазначения и факты: ${model.storage.engine_file}`
  if (model.last_save) $('save-status').textContent = model.last_save.backup_confirmed ? 'Запись на диск и резервная копия подтверждены.' : 'Запись на диск подтверждена, резервная копия не подтверждена. Скачай JSON и проверь доступ к диску.'
}
function updateButtons() {
  $('declare').disabled = busy || !$('owner-reviewer').value.trim() || !$('statement-ack').checked || !!model.declaration
  $('assign').disabled = busy || !model.readiness.isolated_assignment_ready || !$('participant').value.trim() || !$('prerequisites-ack').checked
}
function render() { renderAuthor(); renderReadiness(); renderAssignment(); renderSession(); renderHistory(); updateButtons() }
async function initialize() {
  try {
    model = await api('/api/pilot-engine'); csrf = model.csrf
    for (const week of model.scope.weeks) { const option = node('option', `Неделя ${week.week}`, $('plan-week')); option.value = String(week.week) }
    $('plan-week').addEventListener('change', renderPlan); $('plan-day').addEventListener('change', renderPlan)
    renderPlan()
    $('prerequisites').textContent = model.scope.units[model.scope.program_key].payload.record.prerequisites
    for (const equipment of Object.values(model.scope.units).filter((u) => u.kind === 'equipment')) {
      const label = node('label', '', $('inventory')); label.className = 'check'
      const checkbox = node('input', '', label); checkbox.type = 'checkbox'; checkbox.value = equipment.id
      node('span', `${equipment.title} · ${equipment.id}`, label)
    }
    for (const id of ['owner-reviewer', 'statement-ack', 'participant', 'prerequisites-ack']) $(id).addEventListener('input', updateButtons)
    $('declare').addEventListener('click', async () => {
      if (busy) return
      busy = true; lock(); $('message').textContent = 'Сохраняем заявление…'
      try {
        model = await api('/api/owner-statement', { expected_head: model.declaration_head, command: { operation_id: crypto.randomUUID(), source_sha256: model.overview.source_sha256, overview_hash: model.overview.overview_hash, reviewer: $('owner-reviewer').value, statement: model.statement_text, acknowledged: $('statement-ack').checked } })
        render(); $('message').textContent = 'Заявление владельца записано отдельно. Технические approvals не создавались.'
      } catch (error) { $('message').textContent = error.message }
      finally { busy = false; lock(); updateButtons() }
    })
    $('assign').addEventListener('click', () => void send('assign', { assignment_id: crypto.randomUUID(), user_id: $('participant').value, inventory: [...$('inventory').querySelectorAll('input:checked')].map((i) => i.value), timezone: $('timezone').value, prerequisites_acknowledged: $('prerequisites-ack').checked }))
    $('refresh').addEventListener('click', async () => {
      if (busy) return
      try { model = await api('/api/pilot-engine'); csrf = model.csrf; render(); $('message').textContent = 'Состояние обновлено. История сохранена.' }
      catch (error) { $('message').textContent = error.message }
    })
    render()
  } catch (error) { $('message').textContent = 'Пилот недоступен: ' + error.message; for (const b of document.querySelectorAll('button')) b.disabled = true }
}
void initialize()
