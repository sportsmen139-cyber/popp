// Portable owner-local review only. Never calls a server or edits a source card.
const $ = (id) => document.getElementById(id)
const library = JSON.parse($('library-data').textContent)
const entries = library.entries
const byKey = new Map(entries.map((e) => [e.key, e]))
const selected = new Set()
const pageSize = 10
let pageIndex = 0, events = [], ready = false, writable = true, damaged = null
const storageKey = `popp-private-content-review-v1:${library.source_sha256}:${library.manifest_sha256}`
const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',')}}`
const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value) + '\n')))]
  .map((n) => n.toString(16).padStart(2, '0')).join('')
const textFields = ['name_ru', 'equipment', 'start', 'steps', 'errors', 'safety', 'counting', 'conditions']
const body = (card) => Object.fromEntries(textFields.filter((k) => Object.hasOwn(card, k)).map((k) => [k, card[k]]))
const identity = (entry) => ({ key: entry.key, content_revision: entry.card.content_revision,
  text_sha256: entry.text_sha256, source_record_hash: entry.card.source_record_hash })
const genesis = library.manifest_sha256
const head = () => events.at(-1)?.event_hash || genesis
const flags = {
  SOURCE_EQUIPMENT_UNKNOWN: 'Комплект оборудования в источнике не оформлен',
  EQUIPMENT_DETAILS_REQUIRE_CONFIRMATION: 'Нужно уточнить полный комплект; текст пока неполный',
  PROGRAM_UNIT_CONFLICT: 'Единицы карточки конфликтуют с частью программ; назначения не изменены',
  SOURCE_WORDING_MATCH_REQUIRES_EDITORIAL_REVIEW: 'Найдено совпадение с исходным текстом; нужна редакционная сверка',
  SOURCE_NARRATIVE_EQUIPMENT_CONFLICT: 'Описание упоминает дополнительный вес, отсутствующий в комплекте',
}
function node(tag, text, parent, className) {
  const element = document.createElement(tag)
  if (text !== undefined) element.textContent = text
  if (className) element.className = className
  parent?.append(element)
  return element
}
function notify(message) { $('message').textContent = message }
function review(entry) {
  for (const event of [...events].reverse()) {
    if (event.items.some((item) => item.key === entry.key && item.text_sha256 === entry.text_sha256)) return event
  }
  return null
}
function status(entry) {
  const action = review(entry)?.action
  return action === 'APPROVE_TEXT' ? 'approved' : action === 'REQUEST_CHANGES' ? 'changes' : 'draft'
}
function statusText(entry) {
  return { approved: 'Текст утверждён локально', changes: 'Запрошены правки', draft: entry.protected_first_packet
    ? 'Пакет 0.3: текст сохранён · утверждение не записано' : 'Черновик · ожидает проверки' }[status(entry)]
}
const decisionFlags = (entry) => entry.flags.filter((flag) => flag !== 'SOURCE_EQUIPMENT_UNKNOWN')
function options(id, values, first) {
  node('option', first, $(id)).value = 'all'
  for (const value of [...new Set(values)].sort((a, b) => a.localeCompare(b, 'ru'))) node('option', value, $(id)).value = value
}
function filtered() {
  const query = $('search').value.trim().toLocaleLowerCase('ru')
  return entries.filter((entry) => {
    const matchStatus = $('status').value
    return (!query || `${entry.key} ${entry.card.name_ru}`.toLocaleLowerCase('ru').includes(query))
      && ($('muscle').value === 'all' || entry.muscle_filters.includes($('muscle').value))
      && ($('equipment').value === 'all' || entry.equipment_filters.includes($('equipment').value))
      && ($('priority').value === 'all' || $('priority').value === '0' && entry.needed_for_two_day
        || $('priority').value === '1' && entry.needed_for_three_day
        || $('priority').value === '2' && !entry.needed_for_two_day && !entry.needed_for_three_day)
      && ($('group').value === 'all' || String(entry.review_group) === $('group').value)
      && (matchStatus === 'all' || matchStatus === status(entry)
        || matchStatus === 'decision' && decisionFlags(entry).length > 0
        || matchStatus === 'protected' && entry.protected_first_packet)
  })
}
function selection() {
  $('review-summary').textContent = selected.size ? `Выбрано ${selected.size} · записать решение или скачать копию` : 'Решения тренера и резервная копия'
  $('selected').textContent = selected.size ? `Выбрано ${selected.size}: ${[...selected].join(', ')}` : 'Карточки не выбраны.'
  const permitted = ready && writable && selected.size > 0 && selected.size <= 10
  $('approve').disabled = !permitted || !$('ack').checked || !$('reviewer').value.trim()
    || [...selected].some((key) => !byKey.get(key).content_complete)
  $('request-changes').disabled = !permitted || !$('reviewer').value.trim() || !$('comment').value.trim()
}
function render() {
  const found = filtered(), pages = Math.max(1, Math.ceil(found.length / pageSize))
  pageIndex = Math.min(pageIndex, pages - 1)
  $('cards').replaceChildren()
  $('page-label').textContent = `Найдено ${found.length} · страница ${pageIndex + 1} из ${pages}`
  $('previous').disabled = pageIndex === 0
  $('next').disabled = pageIndex + 1 >= pages
  for (const entry of found.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)) {
    const card = entry.card
    const article = node('article', undefined, $('cards')); article.dataset.key = entry.key
    const label = node('label', undefined, article, 'check')
    const checkbox = node('input', undefined, label); checkbox.type = 'checkbox'; checkbox.checked = selected.has(entry.key)
    checkbox.setAttribute('aria-label', 'Выбрать ' + entry.key)
    node('span', 'Выбрать для решения', label)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked && selected.size >= 10) { checkbox.checked = false; notify('За один раз выбирай не больше десяти карточек.'); return }
      if (checkbox.checked) selected.add(entry.key); else selected.delete(entry.key)
      selection()
    })
    const details = node('details', undefined, article)
    const summary = node('summary', undefined, details)
    node('h2', card.name_ru, summary)
    node('small', `${entry.key} · ${card.content_revision}`, summary)
    node('p', statusText(entry), summary, 'tag')
    if (decisionFlags(entry).length) node('p', 'Есть замечания к данным: ' + decisionFlags(entry).length, summary, 'warning')
    const paragraph = (label, text) => { const p = node('p', undefined, details); node('strong', label + ' ', p); node('span', text, p) }
    paragraph('Оборудование.', card.equipment)
    paragraph('Исходное положение.', card.start)
    node('strong', 'Выполнение', details)
    const steps = node('ol', undefined, details)
    card.steps.forEach((s) => node('li', s, steps))
    node('strong', 'Основные ошибки', details)
    const mistakes = node('ul', undefined, details)
    card.errors.forEach((s) => node('li', s, mistakes))
    paragraph('Безопасность.', card.safety)
    paragraph('Как считать.', card.counting)
    if (card.conditions) paragraph('Особые условия.', card.conditions)
    paragraph('Основные мышцы по источнику.', entry.primary_muscles.join(', ') || 'Не указаны')
    const audit = node('details', undefined, details, 'audit')
    node('summary', 'Данные и ограничения проверки', audit)
    node('p', 'Единица: ' + entry.measurement_unit + '. Назначенные подходы, повторения, отдых и RIR не менялись.', audit)
    node('p', 'Технические проверки программы и права на сторонние материалы этим решением не подтверждаются.', audit)
    node('p', `SHA текста: ${entry.text_sha256}`, audit, 'hash')
    if (entry.protected_first_packet) node('p', 'Первые десять скопированы точно из пакета 0.3. Этот каталог не создал за тебя событие утверждения.', audit)
    const problems = node('ul', undefined, audit)
    entry.flags.forEach((flag) => node('li', flags[flag] || flag, problems))
    const last = review(entry)
    if (last) node('p', `Последнее решение: ${last.reviewer} · ${last.created_at} · ${last.note || 'без комментария'}`, audit)
  }
  const approved = entries.filter((e) => status(e) === 'approved').length
  $('summary').textContent = `${entries.length} карточек: 190 новых черновиков и 10 сохранённых текстов. Локально утверждено ${approved}. Без автоматических замечаний к данным: ${library.summary.no_data_review_flags}. Это не технический допуск.`
  selection()
}
async function validateHistory(list) {
  if (!Array.isArray(list) || list.length > 10000) throw new Error('Неверный формат журнала.')
  let previous = genesis
  const seen = new Set()
  for (const event of list) {
    const keys = ['format_version', 'operation_id', 'created_at', 'reviewer', 'note', 'action', 'acknowledged', 'previous_hash', 'items', 'event_hash']
    if (!event || Object.keys(event).length !== keys.length || !keys.every((k) => Object.hasOwn(event, k))
      || event.format_version !== 1 || !['APPROVE_TEXT', 'REQUEST_CHANGES'].includes(event.action)
      || typeof event.operation_id !== 'string' || seen.has(event.operation_id)
      || typeof event.reviewer !== 'string' || !event.reviewer.trim() || event.reviewer.length > 120
      || typeof event.note !== 'string' || event.note.length > 2000 || Number.isNaN(Date.parse(event.created_at))
      || !Array.isArray(event.items) || event.items.length < 1 || event.items.length > 10
      || event.previous_hash !== previous || typeof event.acknowledged !== 'boolean'
      || event.action === 'APPROVE_TEXT' && event.acknowledged !== true
      || event.action === 'REQUEST_CHANGES' && !event.note.trim()) throw new Error('Журнал решений повреждён или относится к другим условиям.')
    const itemKeys = new Set()
    for (const item of event.items) {
      const current = byKey.get(item.key)
      if (!current || itemKeys.has(item.key) || canonical(identity(current)) !== canonical(item)
        || event.action === 'APPROVE_TEXT' && !current.content_complete) throw new Error('ID, версия или текст решения не совпадают с этим каталогом.')
      itemKeys.add(item.key)
    }
    const { event_hash: eventHash, ...payload } = event
    if (await hash(payload) !== eventHash) throw new Error('Контрольная сумма события не совпадает.')
    previous = eventHash; seen.add(event.operation_id)
  }
  return list
}
function envelope(list = events) {
  return { format_version: 1, source_sha256: library.source_sha256, manifest_sha256: library.manifest_sha256,
    scope: 'TEXT_CONTENT_TECHNIQUE_CLARITY_ONLY_NO_MEDIA_NO_PUBLICATION_NO_PROGRAM_ADMISSION', events: list }
}
async function decode(raw) {
  const data = JSON.parse(raw)
  if (!data || Object.keys(data).length !== 5 || data.format_version !== 1
    || data.source_sha256 !== library.source_sha256 || data.manifest_sha256 !== library.manifest_sha256
    || data.scope !== envelope().scope) throw new Error('Копия относится к другому источнику или редакциям.')
  return validateHistory(data.events)
}
async function commit(action) {
  selection()
  if ($(action === 'APPROVE_TEXT' ? 'approve' : 'request-changes').disabled) return
  const payload = { format_version: 1, operation_id: crypto.randomUUID(), created_at: new Date().toISOString(),
    reviewer: $('reviewer').value.trim(), note: $('comment').value.trim(), action,
    acknowledged: action === 'APPROVE_TEXT' && $('ack').checked, previous_hash: head(),
    items: [...selected].map((key) => identity(byKey.get(key))) }
  try {
    const next = [...events, { ...payload, event_hash: await hash(payload) }]
    await validateHistory(next)
    localStorage.setItem(storageKey, JSON.stringify(envelope(next)))
    events = next; selected.clear(); $('ack').checked = false
    notify('Решение сохранено локально для точных версий. Скачай JSON для резервной копии.')
    render()
  } catch (error) { notify('Решение не сохранено: ' + error.message) }
}
function download() {
  const blob = new Blob([damaged ?? JSON.stringify(envelope(), null, 2)], { type: damaged ? 'text/plain' : 'application/json' })
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = damaged ? 'popp-content-damaged-review.txt' : 'popp-content-review-backup.json'
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function restore(file) {
  if (!file) return
  try {
    if (!writable || damaged) throw new Error('Существующий журнал недоступен или повреждён и не будет перезаписан. Сначала сохрани исходную копию.')
    if (file.size > 2000000) throw new Error('Файл слишком большой.')
    const incoming = await decode(await file.text())
    const shared = Math.min(incoming.length, events.length)
    if (incoming.slice(0, shared).some((e, n) => e.event_hash !== events[n].event_hash)) throw new Error('Истории разошлись. Текущие решения не перезаписаны.')
    if (incoming.length <= events.length) { notify('Эти решения уже сохранены. Более новая история оставлена.'); return }
    localStorage.setItem(storageKey, JSON.stringify(envelope(incoming)))
    events = incoming; notify('Решения восстановлены из проверенной копии. Тексты не изменены.'); render()
  } catch (error) { notify('Восстановление не выполнено: ' + error.message) }
  finally { $('import').value = '' }
}
async function start() {
  try {
    if (library.format_version !== 1 || byKey.size !== entries.length) throw new Error('Некорректный каталог.')
    for (const entry of entries) {
      if (entry.key !== `${entry.card.exercise_id}@${entry.card.exercise_version}` || entry.source_sha256 !== library.source_sha256
        || await hash(entry.card) !== entry.card_sha256 || await hash(body(entry.card)) !== entry.text_sha256) {
        throw new Error('Карточка или её версия изменена после проверки: ' + entry.key)
      }
    }
    const manifest = entries.map((entry) => ({ key: entry.key, content_revision: entry.card.content_revision,
      text_sha256: entry.text_sha256, source_record_hash: entry.card.source_record_hash }))
    if (canonical(manifest) !== canonical(library.manifest)) throw new Error('Редакции карточек не совпадают с реестром.')
    if (await hash(library.manifest) !== library.manifest_sha256) throw new Error('Нарушена целостность реестра редакций.')
    let raw = null
    try { raw = localStorage.getItem(storageKey); if (raw) events = await decode(raw) }
    catch (error) { damaged = raw; writable = false; notify('Локальное сохранение недоступно: ' + error.message) }
    options('muscle', entries.flatMap((e) => e.muscle_filters), 'Все мышцы')
    options('equipment', entries.flatMap((e) => e.equipment_filters), 'Весь инвентарь')
    node('option', 'Все группы', $('group')).value = 'all'
    for (const n of [...new Set(entries.map((e) => e.review_group))].sort((a, b) => a - b)) node('option', 'Группа ' + n, $('group')).value = String(n)
    for (const id of ['search', 'muscle', 'equipment', 'status', 'priority', 'group']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { pageIndex = 0; selected.clear(); render() })
    for (const id of ['reviewer', 'comment', 'ack']) $(id).addEventListener('input', selection)
    $('previous').addEventListener('click', () => { pageIndex--; render() })
    $('next').addEventListener('click', () => { pageIndex++; render() })
    $('select-page').addEventListener('click', () => { selected.clear(); filtered().slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).forEach((e) => selected.add(e.key)); render() })
    $('clear-selection').addEventListener('click', () => { selected.clear(); render() })
    $('approve').addEventListener('click', () => void commit('APPROVE_TEXT'))
    $('request-changes').addEventListener('click', () => void commit('REQUEST_CHANGES'))
    $('export').addEventListener('click', download)
    $('import').addEventListener('change', () => void restore($('import').files?.[0]))
    for (const question of library.questions || []) {
      const section = node('details', undefined, $('questions'))
      node('summary', question.title, section); node('p', question.text, section)
      node('p', question.exercise_ids.join(', '), section, 'hash')
    }
    $('storage-status').textContent = writable ? 'Решения сохраняются в этом браузере. Резервная копия — отдельный JSON; она не отправляется в интернет.'
      : 'Запись заблокирована. Старые данные не сброшены; экспорт доступен.'
    ready = true; render(); document.body.dataset.ready = 'true'
  } catch (error) { notify('Каталог не прошёл проверку: ' + error.message); selection() }
}
selection()
void start()
