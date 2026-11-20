import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Real source is preview-only. Only the explicitly synthetic fixture executes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-two-day-'))
const python = process.env.POPP_PYTHON || resolve(root, '.local/smart-trainer/python/bin/python3')
const servers = [], checks = [], errors = [], external = []
const pass = (name) => { checks.push(name); console.log('PASS ' + name) }
let browser
async function start(mode) {
  const source = `from pathlib import Path
import sys
from tools.smart_trainer.author_programs import AuthorPrograms
from tools.smart_trainer.engine.service import PilotService
from tools.smart_trainer.review.local import prepare_local
from tools.smart_trainer.review.server import create_server
from tools.smart_trainer.tests.test_two_day import two_day_fixture, declare_synthetic
folder = Path(sys.argv[1]) / sys.argv[2]
if sys.argv[2] == 'real':
    catalog = AuthorPrograms.registered(batch='two-day')
    bundle = prepare_local()
else:
    bundle, _, policy = two_day_fixture()
    catalog = AuthorPrograms([bundle], folder, {'PRG_000001': policy})
    declare_synthetic(PilotService(bundle, folder, policy))
server = create_server(bundle, folder / 'review.json', 0, author_programs=catalog)
print('ORIGIN=http://127.0.0.1:' + str(server.server_port), flush=True)
try:
    server.serve_forever()
finally:
    server.server_close()
`
  const server = spawn(python, ['-c', source, artifacts, mode], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  servers.push(server)
  let output = ''
  server.stdout.on('data', (data) => { output += data })
  server.stderr.on('data', (data) => { output += data })
  server.on('error', (error) => { output += error.message })
  let origin
  for (let n = 0; n < 300; n++) {
    origin = output.match(/ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/)?.[1]
    if (origin) break
    if (server.exitCode !== null) throw new Error(output)
    await new Promise((done) => setTimeout(done, 100))
  }
  assert.ok(origin, output)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith(origin)) external.push(request.url()) })
  const storage = Object.fromEntries(['fitness-onboarding-profile', 'fitness-user-progress', 'fitness-workout-history',
    'fitness-workout-draft-v1'].map((key) => [key, 'synthetic unchanged ' + key]))
  await page.addInitScript((values) => { Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)) }, storage)
  await page.goto(origin + '/author-programs')
  await page.locator('[data-program]').first().waitFor()
  return { origin, context, page, storage }
}
async function audit(page, label) {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: resolve(artifacts, `${label}-${width}.png`) })
  }
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  assert.deepEqual(axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), [])
}
async function model(page) {
  return page.evaluate(async () => (await fetch(document.body.dataset.pilotApiRoot)).json())
}
async function saved(page) { await page.locator('#message').filter({ hasText: 'Действие записано' }).waitFor() }
try {
  browser = await chromium.launch({ executablePath: process.env.POPP_BROWSER_PATH, headless: true, args: ['--no-sandbox'] })
  const real = await start('real')
  const listing = await (await fetch(real.origin + '/api/author-programs')).json()
  assert.deepEqual(listing.programs.map((p) => p.programId), ['PRG_000001', 'PRG_000013', 'PRG_000021'])
  assert.ok(listing.programs.every((p) => !p.executionAvailable && p.previewOnly))
  const library = await (await fetch(real.origin + '/api/exercise-library')).json()
  assert.equal(library.eligible_count, 200)
  assert.deepEqual(library.excluded_revisions, ['EX_000072@1', 'EX_000095@1', 'EX_000098@1'])
  assert.equal(library.public_text_count, 0)
  pass('Three real 2-day programs remain gated; library preserves 200 revisions and excludes 3')
  const page = real.page
  await page.locator('#days').selectOption('2')
  for (const program of listing.programs) {
    await page.locator('#level').selectOption(program.level)
    await page.locator(`[data-program="${program.programId}"] button`).click()
    await page.locator('#message').filter({ hasText: 'Загружен предварительный просмотр' }).waitFor()
    assert.equal(await page.locator('#preview [data-phase]').count(), 3)
    assert.equal(await page.locator('#preview [data-slot]').count(), 36)
    assert.equal(await page.getByRole('button', { name: 'Тренировка недоступна', exact: true }).isDisabled(), true)
    const profile = { environment: 'gym', daysPerWeek: '2', level: program.level,
      goalType: program.goalType, targetType: program.targetType, targetId: program.targetId }
    const response = await fetch(real.origin + '/api/author-programs/open', { method: 'POST', headers: {
      Origin: real.origin, 'Content-Type': 'application/json', 'X-Review-CSRF': listing.csrf },
    body: JSON.stringify({ programId: program.programId, profile }) })
    assert.equal(response.ok, false)
    pass(`${program.programId}: source phases/36 slots visible; no false assignment`)
  }
  for (const [level, days] of [['advanced', '2'], ['beginner', '3'], ['intermediate', '4']]) {
    await page.locator('#level').selectOption(level)
    await page.locator('#days').selectOption(days)
    assert.equal(await page.locator('#programs button:enabled').count(), 0)
  }
  await audit(page, 'real-selection')
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), real.storage)
  pass('Wrong levels/frequency rejected; mobile/desktop selection, accessibility and legacy storage preserved')
  await real.context.close()

  const synthetic = await start('synthetic')
  const p = synthetic.page
  await p.locator('#days').selectOption('2')
  await p.locator('#level').selectOption('beginner')
  await p.locator('[data-program="PRG_000001"] button').click()
  await p.getByRole('button', { name: 'Открыть локальную тренировку', exact: true }).click()
  await p.locator('#participant').waitFor()
  assert.deepEqual((await model(p)).state.assignments, {})
  await p.locator('#participant').fill('Explicit synthetic two-day browser participant')
  for (const box of await p.locator('#inventory input').all()) await box.check()
  await p.locator('#prerequisites-ack').check()
  await p.locator('#assign').click(); await saved(p)
  await p.locator('#start-session').click(); await saved(p)
  for (const exercise of await p.locator('.exercise').all()) {
    await exercise.locator('input[id$="-context"]').fill('synthetic-device-A')
    await exercise.locator('input[type=checkbox]').check()
    for (const reps of await exercise.locator('input[id*="-reps-"]').all()) await reps.fill('12')
    for (const load of await exercise.locator('input[id*="-load-"]').all()) await load.fill('20')
    for (const rir of await exercise.locator('input[id*="-rir-"]').all()) await rir.fill('3')
    for (const quality of await exercise.locator('select[id*="-quality-"]').all()) await quality.selectOption('good')
    await exercise.locator('[data-action=save]').click(); await saved(p)
  }
  const before = await model(p)
  const aid = before.state.active_assignment_id
  await p.reload()
  await p.locator('#finish-session').waitFor()
  assert.deepEqual((await model(p)).state.assignments[aid].session, before.state.assignments[aid].session)
  await audit(p, 'synthetic-active')
  pass('Synthetic fixture: selection → existing Engine → equipment acknowledgement → results → reload restores active session')
  await p.locator('#finish-session').click(); await saved(p)
  const after = await model(p)
  const assignment = after.state.assignments[aid]
  assert.equal(assignment.completed_sessions, 1)
  assert.equal(assignment.history.length, 1)
  assert.equal(assignment.day_index, 1)
  assert.equal(assignment.next_rest_days, 3)
  assert.ok(assignment.history[0].slots.every((s) => s.sets.length))
  const exported = await p.evaluate(async () => (await fetch(document.body.dataset.pilotApiRoot + '/export')).json())
  assert.ok(exported.events.length >= 5)
  assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), synthetic.storage)
  pass('Synthetic fixture: completion advances to source day 4, preserves full history/export and legacy storage')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'passed', checks, errors, external,
    execution_fixture: 'explicit synthetic, not author source admission', native_telegram_tested: false,
    executed_at: new Date().toISOString() }, null, 2))
  console.log('Artifacts: ' + artifacts)
} finally {
  await browser?.close()
  servers.forEach((server) => server.kill('SIGTERM'))
}
