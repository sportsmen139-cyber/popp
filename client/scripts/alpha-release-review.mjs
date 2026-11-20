import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Only disposable browser profiles and synthetic entries. Never opens the live Site or bot.
const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-alpha-release-'))
assert.ok(existsSync(resolve(client, 'dist/index.html')), 'Run npm run build first')
const executablePath = process.env.POPP_BROWSER_PATH
const port = process.env.POPP_RELEASE_PORT || '5187'
const origin = `http://127.0.0.1:${port}`
const sdk = 'https://telegram.org/js/telegram-web-app.js?65'
const draftKey = 'fitness-workout-draft-v1'
const keys = ['fitness-onboarding-profile', 'fitness-user-progress', 'fitness-workout-history']
const profile = { environment: 'gym', daysPerWeek: 3, level: 'beginner',
  goal: { goalType: 'general_fitness', target: { type: 'whole_body' }, priority: 'normal' } }
const nativeStub = `window.__telegramCalls = [];
window.Telegram = {WebApp: {
 ready(){window.__telegramCalls.push('ready')}, expand(){window.__telegramCalls.push('expand')},
 isVersionAtLeast(){return true},
 enableClosingConfirmation(){window.__telegramCalls.push('closing:on')},
 disableClosingConfirmation(){window.__telegramCalls.push('closing:off')}
}};`
const launch = { executablePath, headless: true, args: ['--no-sandbox'] }
const mobile = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  timezoneId: 'Europe/Moscow' }
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1',
  '--port', port, '--strictPort'], { cwd: client, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
server.stdout.on('data', (data) => { serverOutput += data })
server.stderr.on('data', (data) => { serverOutput += data })
let browser
let persistent
const checks = []
const screenshots = []
const external = []
const contexts = []
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`) }

async function installSdk(context, mode = 'stub') {
  await context.route(sdk, (route) => mode === 'absent' ? route.abort() :
    route.fulfill({ contentType: 'text/javascript', body: nativeStub }))
}

function observe(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith(origin) && !url.startsWith('data:') && url !== sdk) external.push(url)
  })
  return errors
}

async function openCase({ seed = true, sdkMode = 'stub' } = {}) {
  const context = await browser.newContext(mobile)
  contexts.push(context)
  await installSdk(context, sdkMode)
  if (seed) await context.addInitScript((value) => {
    if (localStorage.getItem('fitness-onboarding-profile') === null)
      localStorage.setItem('fitness-onboarding-profile', JSON.stringify(value))
  }, profile)
  const page = await context.newPage()
  const errors = observe(page)
  return { context, page, errors }
}

async function onboard(page) {
  await page.getByRole('button', { name: /^В зале/ }).click()
  await page.getByRole('button', { name: '3 раза в неделю', exact: true }).click()
  await page.getByRole('button', { name: 'Новичок', exact: true }).click()
  await page.getByRole('button', { name: 'Общая физическая подготовка', exact: true }).click()
}

async function start(page) {
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click()
  const groups = page.locator('.session-checkin .session-feeling-options')
  await groups.nth(0).getByRole('button', { name: 'Нормально', exact: true }).click()
  await groups.nth(2).getByRole('button', { name: 'Нет', exact: true }).click()
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await page.locator('.exercise-card').first().waitFor()
}

async function fillRemaining(page) {
  for (const input of await page.getByRole('spinbutton', { name: /^Вес, подход/ }).all())
    if (!(await input.inputValue())) await input.fill('20')
  for (const input of await page.getByRole('spinbutton', { name: /^Повторения, подход/ }).all())
    if (!(await input.inputValue())) await input.fill('12')
}

async function snapshot(page) {
  return page.evaluate((names) => Object.fromEntries(names.map((key) =>
    [key, JSON.parse(localStorage.getItem(key) ?? 'null')])), keys)
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true })
  screenshots.push(name)
}

async function audit(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  assert.deepEqual(result.violations.map((item) => ({ id: item.id, targets: item.nodes.map((node) => node.target) })), [], `${name}: accessibility`)
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput)
    try { if ((await fetch(origin)).ok) { ready = true; break } } catch { /* preview starting */ }
    await delay(100)
  }
  assert.ok(ready, serverOutput)

  const userDataDir = resolve(artifacts, 'synthetic-persistent-profile')
  persistent = await chromium.launchPersistentContext(userDataDir, { ...launch, ...mobile })
  await installSdk(persistent)
  let page = await persistent.newPage()
  let errors = observe(page)
  await page.goto(origin)
  await onboard(page)
  await start(page)
  const first = page.locator('.exercise-card').first()
  await first.getByRole('spinbutton', { name: 'Вес, подход 1', exact: true }).fill('21.25')
  await first.getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true }).fill('7')
  await first.getByRole('button', { name: 'Нормально', exact: true }).click()
  await page.waitForFunction(() => window.__telegramCalls?.includes('closing:on'))
  const savedDraft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), draftKey)
  const before = await snapshot(page)
  assert.equal(before['fitness-workout-history'], null)
  assert.deepEqual(errors, [])
  await persistent.close()
  persistent = null

  persistent = await chromium.launchPersistentContext(userDataDir, { ...launch, ...mobile })
  await installSdk(persistent)
  page = await persistent.newPage()
  errors = observe(page)
  await page.goto(origin)
  await page.getByRole('button', { name: 'Продолжить тренировку', exact: true }).click()
  assert.equal(await page.locator('.exercise-card').first().getByRole('spinbutton', { name: 'Вес, подход 1', exact: true }).inputValue(), '21.25')
  assert.equal(await page.locator('.exercise-card').first().getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true }).inputValue(), '7')
  assert.equal(await page.locator('.exercise-card').first().getByRole('button', { name: 'Нормально', pressed: true, exact: true }).count(), 1)
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), draftKey), savedDraft)
  assert.deepEqual(await snapshot(page), before)
  await audit(page, 'cold resumed workout')
  await capture(page, 'resumed-workout')
  pass('Cold browser restart restores exact workout, partial inputs, decimal weight and difficulty without advancing history')
  await fillRemaining(page)
  await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).waitFor()
  const completed = await snapshot(page)
  assert.equal(completed['fitness-user-progress'].completedWorkoutsCount, 1)
  assert.equal(completed['fitness-workout-history'].length, 1)
  assert.equal(completed['fitness-workout-history'][0].exercises[0].sets[0].weightKg, 21.25)
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), draftKey), null)
  await page.waitForFunction(() => window.__telegramCalls.at(-1) === 'closing:off')
  await page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await page.getByRole('heading', { name: 'Мой прогресс', exact: true }).waitFor()
  await page.locator('.workout-history-record summary').first().click()
  assert.ok((await page.locator('.workout-history-exercise').first().textContent()).includes('21,25 кг · 7 повт.'))
  await audit(page, 'real newly recorded progress')
  await capture(page, 'recorded-progress')
  assert.deepEqual(errors, [])
  await persistent.close()
  persistent = null
  persistent = await chromium.launchPersistentContext(userDataDir, { ...launch, ...mobile })
  await installSdk(persistent)
  page = await persistent.newPage()
  errors = observe(page)
  await page.goto(origin)
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).waitFor()
  assert.deepEqual(await snapshot(page), completed)
  assert.deepEqual(errors, [])
  await capture(page, 'home-after-restart')
  await persistent.close()
  persistent = null
  pass('Finish, view actual progress and cold reopen preserve one completion and disable native closing confirmation')

  browser = await chromium.launch(launch)
  const historyCase = await openCase()
  const sessions = Array.from({ length: 22 }, (_, index) => ({
    workoutTemplateId: 'gym-fullbody-a', completedAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    exercises: [{ exerciseId: 'synthetic-unknown-legacy', sets: [{ setNumber: 1, weightKg: index + 0.25, reps: index === 0 ? 0 : 12 }, { setNumber: 2 }] }],
  }))
  await historyCase.context.addInitScript((entries) => {
    localStorage.setItem('fitness-workout-history', JSON.stringify(entries))
    localStorage.setItem('fitness-user-progress', JSON.stringify({ completedWorkoutsCount: entries.length }))
  }, sessions)
  await historyCase.page.goto(origin)
  const historyBefore = await snapshot(historyCase.page)
  await historyCase.page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await historyCase.page.getByRole('heading', { name: 'История тренировок', exact: true }).waitFor()
  assert.equal(await historyCase.page.locator('.workout-history-record').count(), 20)
  await historyCase.page.getByRole('button', { name: 'Показать ещё', exact: true }).click()
  assert.equal(await historyCase.page.locator('.workout-history-record').count(), 22)
  await historyCase.page.locator('.workout-history-record summary').last().click()
  const oldest = historyCase.page.locator('.workout-history-record').last()
  assert.ok((await oldest.textContent()).includes('0,25 кг · 0 повт.'))
  assert.ok((await oldest.textContent()).includes('вес не указан · повторения не указаны'))
  await historyCase.page.setViewportSize({ width: 320, height: 720 })
  await audit(historyCase.page, 'all workout history')
  assert.deepEqual(await snapshot(historyCase.page), historyBefore)
  assert.deepEqual(historyCase.errors, [])
  pass('Full workout history exposes older sessions, exact values and missing data; pagination preserves every record')

  const failure = await openCase()
  await failure.page.goto(origin)
  await start(failure.page)
  await fillRemaining(failure.page)
  await failure.page.evaluate(() => {
    const write = Storage.prototype.setItem
    let failed = false
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fitness-user-progress' && !failed) {
        failed = true
        throw new DOMException('Synthetic write failure', 'QuotaExceededError')
      }
      return write.call(this, key, value)
    }
  })
  await failure.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  await failure.page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' }).waitFor()
  assert.equal((await snapshot(failure.page))['fitness-workout-history'].length, 1)
  assert.equal(await failure.page.evaluate((key) => JSON.parse(localStorage.getItem(key)).stage, draftKey), 'completing')
  await audit(failure.page, 'interrupted save notice')
  await capture(failure.page, 'interrupted-save')
  await failure.page.reload()
  await failure.page.getByRole('button', { name: 'Начать тренировку', exact: true }).waitFor()
  let recovered = await snapshot(failure.page)
  assert.equal(recovered['fitness-workout-history'].length, 1)
  assert.equal(recovered['fitness-user-progress'].completedWorkoutsCount, 1)
  await failure.page.reload()
  recovered = await snapshot(failure.page)
  assert.equal(recovered['fitness-workout-history'].length, 1)
  assert.equal(recovered['fitness-user-progress'].completedWorkoutsCount, 1)
  assert.deepEqual(failure.errors, [])
  pass('Interrupted history/progress save recovers on reopen exactly once')

  const retry = await openCase()
  await retry.page.goto(origin)
  await start(retry.page)
  await retry.page.evaluate((keyToFail) => {
    const write = Storage.prototype.setItem
    let failed = false
    Storage.prototype.setItem = function (key, value) {
      if (key === keyToFail && !failed) { failed = true; throw new DOMException('Synthetic failure', 'QuotaExceededError') }
      return write.call(this, key, value)
    }
  }, draftKey)
  await retry.page.locator('.exercise-card').first().getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true }).fill('11')
  await retry.page.getByRole('alert').waitFor()
  await retry.page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click()
  await retry.page.reload()
  await retry.page.getByRole('button', { name: 'Продолжить тренировку', exact: true }).click()
  assert.equal(await retry.page.locator('.exercise-card').first().getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true }).inputValue(), '11')
  await retry.page.getByRole('button', { name: 'К плану', exact: true }).click()
  const profileBefore = (await snapshot(retry.page))['fitness-onboarding-profile']
  await retry.page.getByRole('button', { name: 'Изменить профиль', exact: true }).click()
  await retry.page.getByRole('alert').filter({ hasText: 'Сначала заверши' }).waitFor()
  assert.deepEqual((await snapshot(retry.page))['fitness-onboarding-profile'], profileBefore)
  assert.deepEqual(retry.errors, [])
  pass('Draft save failure is retryable and profile editing cannot erase an active workout')

  const partial = await openCase()
  await partial.page.goto(origin)
  await start(partial.page)
  await partial.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  await partial.page.getByRole('group', { name: 'Подтвердить завершение', exact: true }).waitFor()
  assert.equal((await snapshot(partial.page))['fitness-workout-history'], null)
  await partial.page.setViewportSize({ width: 320, height: 720 })
  await audit(partial.page, 'incomplete completion confirmation')
  await capture(partial.page, 'incomplete-confirmation')
  await partial.page.getByRole('button', { name: 'Вернуться к вводу', exact: true }).click()
  const input = partial.page.locator('.exercise-card').first().getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true })
  await input.fill('-1')
  await partial.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  assert.equal((await snapshot(partial.page))['fitness-workout-history'], null)
  await input.fill('0')
  await partial.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  await partial.page.getByRole('button', { name: 'Сохранить как есть', exact: true }).click()
  const partialSaved = (await snapshot(partial.page))['fitness-workout-history'][0]
  assert.equal(partialSaved.exercises[0].sets[0].reps, 0)
  assert.equal(partialSaved.exercises[0].sets[1].reps, undefined)
  assert.deepEqual(partial.errors, [])
  pass('Incomplete data require confirmation; negative input is rejected; explicit zero and missing fields remain distinct')

  const pain = await openCase()
  await pain.page.goto(origin)
  await pain.page.getByRole('button', { name: 'Начать тренировку', exact: true }).click()
  const groups = pain.page.locator('.session-checkin .session-feeling-options')
  await groups.nth(0).getByRole('button', { name: 'Нормально', exact: true }).click()
  await groups.nth(2).getByRole('button', { name: 'Да', exact: true }).click()
  await pain.page.getByRole('button', { name: 'Боль / дискомфорт', exact: true }).click()
  await pain.page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await pain.page.getByRole('alert').filter({ hasText: 'При боли' }).waitFor()
  assert.equal(await pain.page.locator('.exercise-card').count(), 0)
  assert.equal(await pain.page.getByRole('button', { name: 'Принять адаптацию', exact: true }).count(), 0)
  assert.equal(await pain.page.evaluate((key) => localStorage.getItem(key), draftKey), null)
  assert.deepEqual(pain.errors, [])
  pass('Pain check-in does not offer an automatic lighter workout or start a session')

  const corrupt = await openCase()
  await corrupt.context.addInitScript(() => localStorage.setItem('fitness-workout-history', '{synthetic-broken'))
  await corrupt.page.goto(origin)
  await corrupt.page.getByRole('heading', { name: 'Не удалось открыть приложение', exact: true }).waitFor()
  assert.equal(await corrupt.page.evaluate(() => localStorage.getItem('fitness-workout-history')), '{synthetic-broken')
  await audit(corrupt.page, 'unreadable storage recovery')
  await capture(corrupt.page, 'storage-recovery')
  assert.ok(corrupt.errors.every((error) => error.includes('Не удалось прочитать сохранённые записи')))
  const blocked = await openCase({ seed: false })
  await blocked.context.addInitScript(() => {
    window.__storageWrites = 0
    Storage.prototype.getItem = () => { throw new DOMException('Synthetic unavailable storage', 'SecurityError') }
    Storage.prototype.setItem = () => { window.__storageWrites += 1 }
  })
  await blocked.page.goto(origin)
  await blocked.page.getByRole('heading', { name: 'Не удалось открыть приложение', exact: true }).waitFor()
  assert.equal(await blocked.page.evaluate(() => window.__storageWrites), 0)
  assert.ok(blocked.errors.every((error) => error.includes('Не удалось открыть записи')))
  pass('Unreadable or disabled storage shows a recovery screen without resetting user records')

  const unavailableSdk = await openCase({ sdkMode: 'absent' })
  await unavailableSdk.page.goto(origin)
  await start(unavailableSdk.page)
  await unavailableSdk.page.reload()
  await unavailableSdk.page.getByRole('button', { name: 'Продолжить тренировку', exact: true }).waitFor()
  assert.deepEqual(unavailableSdk.errors, [])
  pass('SDK loading failure preserves browser-mode startup and draft recovery')

  const feedback = await openCase()
  await feedback.page.goto(origin)
  const beforeFeedback = await snapshot(feedback.page)
  await feedback.page.evaluate(() => {
    window.__feedbackLinks = []
    window.Telegram.WebApp.openTelegramLink = (url) => window.__feedbackLinks.push(url)
  })
  await feedback.page.getByRole('button', { name: 'Обратная связь', exact: true }).click()
  await feedback.page.getByText('Канал: @forever_139.', { exact: false }).waitFor()
  await feedback.page.getByLabel('Твой отзыв', { exact: true }).fill('Проверка формы: & ? #')
  await feedback.page.getByRole('button', { name: 'Открыть Telegram', exact: true }).click()
  const feedbackLinks = await feedback.page.evaluate(() => window.__feedbackLinks)
  assert.equal(feedbackLinks.length, 1)
  const feedbackUrl = new URL(feedbackLinks[0])
  assert.equal(feedbackUrl.origin, 'https://t.me')
  assert.equal(feedbackUrl.pathname, '/forever_139')
  assert.deepEqual([...feedbackUrl.searchParams.keys()], ['text'])
  assert.equal(feedbackUrl.searchParams.get('text'), 'Отзыв об альфа-версии\nТип: Сообщить об ошибке\n\nПроверка формы: & ? #')
  assert.deepEqual(await snapshot(feedback.page), beforeFeedback)
  for (const width of [320, 390, 1280]) {
    await feedback.page.setViewportSize({ width, height: 844 })
    await audit(feedback.page, `owner feedback ${width}px`)
  }
  await capture(feedback.page, 'owner-feedback')
  assert.deepEqual(feedback.errors, [])
  pass('Built Alpha opens owner-confirmed @forever_139 with only the entered feedback; link intercepted, no message sent; mobile layout and storage preserved')

  assert.deepEqual(external, [], 'Unexpected external requests')
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'passed', executed_at: new Date().toISOString(),
    browser: browser.version(), native_telegram_tested: false, storage: 'synthetic disposable profiles only', checks, screenshots, external }, null, 2))
  console.log(`${checks.length} release checks passed. Artifacts: ${artifacts}`)
} catch (error) {
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'failed', checks,
    error: String(error), screenshots, external }, null, 2))
  throw error
} finally {
  await persistent?.close()
  await Promise.all(contexts.map((context) => context.close().catch(() => {})))
  await browser?.close()
  server.kill('SIGTERM')
}
