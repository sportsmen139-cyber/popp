import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const bundlePath = resolve(process.argv[2] || '')
assert.ok(process.argv[2] && existsSync(bundlePath), 'Pass the real private Stage 3 bundle.json')
const bundleBytes = await readFile(bundlePath)
const temp = await mkdtemp(resolve(tmpdir(), 'popp-pilot-engine-'))
const python = process.env.POPP_PYTHON || resolve(root, '.local/smart-trainer/python/bin/python3')
const executablePath = process.env.POPP_BROWSER_PATH
assert.ok(executablePath, 'Set POPP_BROWSER_PATH to Chromium')
const ownerPath = resolve(root, '.local/smart-trainer/trainer-review/journals/author-statements.json')
const ownerBefore = existsSync(ownerPath) ? await readFile(ownerPath) : null
const baseline = JSON.parse(await readFile(resolve(root, 'client/scripts/fixtures/ui-before-b9c38f4.json'), 'utf8')).normal
const checks = [], errors = [], external = [], servers = []
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
let browser
function pass(message) { checks.push(message); console.log('PASS ' + message) }
async function start(bundle, journal, contracts, alternatives = []) {
  const args = ['-u', '-m', 'tools.smart_trainer.review', 'serve', '--bundle', bundle, '--journal', journal, '--port', '0']
  if (contracts) args.push('--technical-contracts', contracts)
  for (const id of alternatives) args.push('--alternative', id)
  const server = spawn(python, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  servers.push(server)
  let output = ''
  server.stdout.on('data', (data) => { output += data })
  server.stderr.on('data', (data) => { output += data })
  server.on('error', (error) => { output += error.message })
  let origin
  for (let n = 0; n < 150; n++) {
    if (server.exitCode !== null) throw new Error(output)
    origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (origin) break
    await delay(100)
  }
  assert.ok(origin, output)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.addInitScript((values) => { for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value)) }, baseline)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith(origin)) external.push(request.url()) })
  await page.goto(origin + '/pilot')
  await page.locator('#scope-facts').getByText(/Идентичность scope/).waitFor()
  return { server, context, page, origin }
}
const getModel = (page) => page.evaluate(async () => (await (await fetch('/api/pilot-engine')).json()))
async function statement(page) {
  await page.locator('#owner-reviewer').fill('Synthetic browser owner — temporary journal only')
  await page.locator('#statement-ack').check()
  await page.locator('#declare').click()
  await page.locator('#message').filter({ hasText: 'Заявление владельца записано отдельно' }).waitFor()
}
async function audit(page, name) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ' overflow')
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  assert.deepEqual(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), [])
}
async function unchangedStorage(page) {
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, JSON.parse(localStorage.getItem(key))]))), baseline)
}
async function saved(page) { await page.locator('#message').filter({ hasText: 'Действие записано' }).waitFor() }

try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const real = await start(bundlePath, resolve(temp, 'real/auxiliary-review.json'))
  const p = real.page
  let model = await getModel(p)
  assert.deepEqual(model.overview.counts, { programs: 108, exercises: 203, eligible_exercises: 200 })
  assert.deepEqual(model.overview.excluded_exercises, ['EX_000072', 'EX_000095', 'EX_000098'])
  assert.equal(model.scope.scope.core_exercises.length, 10)
  assert.deepEqual(model.scope.scope.alternatives, [])
  assert.equal(model.scope.weeks.length, 8)
  assert.equal(await p.locator('#statement-ack').isChecked(), false)
  assert.equal(await p.locator('#declare').isDisabled(), true)
  pass('Real source SHA/counts/exclusions displayed; exact core-only scope; no pre-recorded owner declaration')
  await statement(p)
  model = await getModel(p)
  assert.ok(model.declaration)
  assert.equal(model.readiness.individual_approvals_required, false)
  assert.equal(model.readiness.isolated_assignment_ready, false)
  assert.ok(model.readiness.blockers.includes('equipment_contract_unresolved:EX_000082'))
  assert.ok(model.readiness.blockers.includes('equipment_contract_unresolved:EX_000135'))
  assert.ok(!model.readiness.blockers.some((b) => b.includes('alternative') || b.includes('typed_alternative')))
  const auxiliary = await p.evaluate(async () => (await (await fetch('/api/state')).json()).state)
  assert.equal(auxiliary.approved, 0); assert.equal(auxiliary.events.length, 0)
  const exportedAuthor = await p.evaluate(async () => (await (await fetch('/api/owner-statement/export')).json()))
  assert.equal(exportedAuthor.events.length, 1)
  assert.equal(await p.locator('#assign').isDisabled(), true)
  pass('One temporary synthetic owner statement creates no card approvals and cannot bypass technical, equipment, Engine or rights gates')
  await audit(p, 'real pilot')
  await unchangedStorage(p)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.screenshot({ path: resolve(temp, 'real-pilot.png') })
  await real.context.close()

  const fixtureDir = resolve(temp, 'explicit-synthetic-fixture')
  const generated = spawnSync(python, ['-m', 'tools.smart_trainer.tests.engine_fixtures', fixtureDir], { cwd: root, encoding: 'utf8' })
  assert.equal(generated.status, 0, generated.stderr)
  const fixture = JSON.parse(generated.stdout)
  const synthetic = await start(fixture.bundle, resolve(temp, 'synthetic/auxiliary-review.json'), fixture.contracts, ['ALT_000001', 'ALT_000002', 'ALT_000003'])
  const page = synthetic.page
  await statement(page)
  await page.locator('#participant').fill('Synthetic participant')
  for (const checkbox of await page.locator('#inventory input').all()) await checkbox.check()
  await page.locator('#prerequisites-ack').check()
  await page.locator('#assign').click(); await saved(page)
  assert.equal(await page.locator('#start-session').isEnabled(), true)
  await page.locator('#start-session').click(); await saved(page)
  assert.equal(await page.locator('.exercise').count(), 2)
  let first = page.locator('.exercise').nth(0), second = page.locator('.exercise').nth(1)
  assert.equal(await first.locator('input[id*="-load-"]').inputValue(), '')
  await second.locator('input[id*="-reps-"]').fill('8')
  await first.locator('input[id$="-reason"]').fill('Synthetic target device today')
  await first.locator('select[id$="-alternative"]').selectOption('ALT_000001')
  await first.getByText('Synthetic target device and setup differ', { exact: false }).waitFor()
  await first.locator('[data-action=replace]').click(); await saved(page)
  first = page.locator('.exercise').nth(0); second = page.locator('.exercise').nth(1)
  assert.match(await first.locator('h3').innerText(), /exercise 3/)
  assert.equal(await first.locator('input[id*="-load-"]').inputValue(), '')
  assert.equal(await second.locator('input[id*="-reps-"]').inputValue(), '8')
  await first.locator('input[id$="-context"]').fill('device-B')
  await first.locator('input[type=checkbox]').check()
  await first.locator('input[id*="-reps-"]').fill('12')
  await first.locator('input[id*="-load-"]').fill('3')
  await first.locator('input[id*="-rir-"]').fill('3')
  await first.locator('select[id*="-quality-"]').selectOption('good')
  await first.locator('[data-action=save]').click(); await saved(page)
  pass('Isolated assignment/session: fresh load after directed A replacement, saved REPS/RIR/technique, unrelated drafts retained')

  second = page.locator('.exercise').nth(1)
  await second.locator('input[id$="-reason"]').fill('Synthetic optional skip')
  await second.locator('[data-action=skip]').click(); await saved(page)
  model = await getModel(page)
  let assignment = model.state.assignments[model.state.active_assignment_id]
  assert.deepEqual(assignment.session.slots[1].sets, [])
  assert.equal(assignment.session.slots[1].skipped, true)
  second = page.locator('.exercise').nth(1)
  await second.locator('input[id$="-reason"]').fill('Synthetic reviewed personal removal')
  await second.getByText('Изменить только мою программу на будущее', { exact: true }).click()
  await second.locator('[data-action=remove-permanent]').click(); await saved(page)
  first = page.locator('.exercise').nth(0)
  await first.locator('input[id$="-reason"]').fill('Synthetic C program adjustment with reviewed dose')
  await first.getByText('Изменить только мою программу на будущее', { exact: true }).click()
  await first.locator('select[id$="-permanent-choice"]').selectOption('ALT_000003')
  await first.getByText('C — отдельное согласованное назначение, с пересмотром дозы и объёма', { exact: false }).waitFor()
  await first.locator('[data-action=replace-permanent]').click(); await saved(page)
  model = await getModel(page); assignment = model.state.assignments[model.state.active_assignment_id]
  assert.equal(assignment.personal_revision, 3)
  assert.equal(assignment.session.personal_revision, 1)
  assert.equal(assignment.session.slots[0].effective.alternative_id, 'ALT_000001')
  assert.equal(assignment.personal_changes['EX_000001@1'].replacements.SLOT_000001.alternative_id, 'ALT_000003')
  await audit(page, 'active session')
  await page.locator('#session-title').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(temp, 'synthetic-session.png') })
  await page.locator('#finish-session').click(); await saved(page)
  model = await getModel(page); assignment = model.state.assignments[model.state.active_assignment_id]
  assert.equal(assignment.history[0].performed_sets, 1)
  assert.equal(assignment.completed_sessions, 1)
  assert.equal(assignment.history[0].slots[0].source_slot.exercise_id, 'EX_000001')
  assert.equal(assignment.history[0].slots[0].effective.exercise_id, 'EX_000003')
  pass('Today skip gives no phantom sets; reviewed permanent remove/C changes affect future revision while current session retains its snapshot')

  const historyBefore = JSON.stringify(assignment.history)
  for (let n = 0; n < 2; n++) {
    const row = page.locator('#personal-changes > div').first()
    await row.locator('input').fill('Synthetic return to original author program')
    await row.getByRole('button', { name: 'Вернуть исходный вариант на будущее' }).click(); await saved(page)
  }
  model = await getModel(page); assignment = model.state.assignments[model.state.active_assignment_id]
  assert.deepEqual(assignment.personal_changes, {})
  assert.equal(JSON.stringify(assignment.history), historyBefore)
  await page.locator('#start-session').click()
  await page.locator('#message').filter({ hasText: 'Между занятиями нужен день' }).waitFor()
  const downloading = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Скачать журнал назначений и выполнения' }).click()
  const download = await downloading, exportedPath = resolve(temp, 'synthetic-engine-export.json')
  await download.saveAs(exportedPath)
  assert.ok(JSON.parse(await readFile(exportedPath, 'utf8')).events.length > 5)
  await page.reload(); await page.locator('#scope-facts').getByText(/Идентичность scope/).waitFor()
  model = await getModel(page)
  assert.equal(JSON.stringify(model.state.assignments[model.state.active_assignment_id].history), historyBefore)
  await unchangedStorage(page)
  pass('Undo restores future author prescription without history reset; rest day enforced; JSON export and reload retain identities and results')
  await synthetic.context.close()
  assert.deepEqual(await readFile(bundlePath), bundleBytes)
  assert.deepEqual(existsSync(ownerPath) ? await readFile(ownerPath) : null, ownerBefore)
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  pass('320/390/1280px and WCAG A/AA pass; no external requests, runtime errors, source mutation or owner/legacy storage writes')
  const report = { checks, errors, externalRequests: external, real_owner_declarations_created: false,
    real_owner_assignments_created: false, synthetic_test_journals_only: true, live_activation_enabled: false,
    viewports: [320, 390, 1280], browser: 'Chromium on macOS; not a native Telegram test' }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n')
  console.log(`${checks.length} pilot browser checks passed. Private screenshots: ${temp}`)
} finally {
  await browser?.close()
  for (const server of servers) server.kill('SIGTERM')
}
