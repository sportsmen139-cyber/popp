import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Real private source, read-only; disposable review journals and browser profile.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-author-programs-'))
const receipt = JSON.parse(await readFile(resolve(root, 'docs/smart-trainer/audit/snapshot-receipt.json'), 'utf8'))
const snapshot = resolve(root, '.local/smart-trainer', receipt.source_sha256, 'schema-1-importer-1.0.0')
const decision = JSON.parse(await readFile(resolve(root, 'docs/smart-trainer/decisions/EX_000135-six-programs-v1.json'), 'utf8'))
const protectedFiles = ['source.xlsx', 'catalog.json'].map((name) => resolve(snapshot, name))
protectedFiles.push(resolve(root, '.local/smart-trainer/trainer-review/journals/author-statements.json'))
const hashes = async () => Promise.all(protectedFiles.map(async (name) =>
  createHash('sha256').update(await readFile(name)).digest('hex')))
const before = await hashes()
const python = process.env.POPP_PYTHON || resolve(root, '.local/smart-trainer/python/bin/python3')
const source = `from pathlib import Path
import sys
from tools.smart_trainer.author_programs import AuthorPrograms
from tools.smart_trainer.review.local import prepare_local
from tools.smart_trainer.review.server import create_server
catalog = AuthorPrograms.registered()
server = create_server(prepare_local(), Path(sys.argv[1]) / 'synthetic-review.json', 0, author_programs=catalog)
print('ORIGIN=http://127.0.0.1:' + str(server.server_port), flush=True)
try:
    server.serve_forever()
finally:
    server.server_close()
`
const server = spawn(python, ['-c', source, artifacts], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
server.stdout.on('data', (data) => { output += data })
server.stderr.on('data', (data) => { output += data })
let browser
const checks = []
const errors = []
const external = []
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`) }
try {
  let origin
  for (let i = 0; i < 300; i++) {
    origin = output.match(/ORIGIN=(http:\/\/127\.0\.0\.1:\d+)/)?.[1]
    if (origin) break
    if (server.exitCode !== null) throw new Error(output)
    await new Promise((done) => setTimeout(done, 100))
  }
  assert.ok(origin, output)
  const listing = await (await fetch(`${origin}/api/author-programs`)).json()
  assert.equal(listing.programs.length, 6)
  assert.ok(listing.programs.every((p) => p.previewOnly && !p.executionAvailable && p.authorDeclarationFound))
  pass('Six exact source programs reuse the existing owner declaration; none activated')
  browser = await chromium.launch({ executablePath: process.env.POPP_BROWSER_PATH, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith(origin)) external.push(request.url()) })
  const storage = { 'fitness-onboarding-profile': 'synthetic profile sentinel',
    'fitness-workout-history': 'synthetic history sentinel', 'fitness-user-progress': 'synthetic progress sentinel',
    'fitness-workout-draft-v1': 'synthetic draft sentinel' }
  await page.addInitScript((values) => {
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value))
  }, storage)
  await page.goto(`${origin}/author-programs`)
  await page.locator('[data-program]').nth(5).waitFor()
  for (const [level, days] of [['beginner', '3'], ['intermediate', '4'], ['advanced', '3']]) {
    await page.locator('#level').selectOption(level)
    await page.locator('#days').selectOption(days)
    assert.equal(await page.locator('#programs button:enabled').count(), 0)
  }
  pass('Beginner and mismatched 3/4-day combinations receive no selectable program or legacy fallback')
  for (const program of listing.programs) {
    await page.locator('#level').selectOption(program.level)
    await page.locator('#days').selectOption(String(program.daysPerWeek))
    const response = page.waitForResponse((r) => r.url().endsWith('/api/author-programs/preview') && r.status() === 200)
    await page.locator(`[data-program="${program.programId}"] button`).click()
    const data = await (await response).json()
    await page.locator('#message').getByText('Загружен предварительный просмотр.', { exact: false }).waitFor()
    assert.equal(await page.locator('#preview [data-phase]').count(), 3)
    assert.equal(await page.locator('#preview [data-slot]').count(), program.slotCount)
    assert.equal(await page.getByRole('button', { name: 'Тренировка недоступна', exact: true }).isDisabled(), true)
    for (const [phase, reps] of [['PHASE_01', 6], ['PHASE_02', 8], ['PHASE_03', 10]]) {
      const slotId = decision.programs[program.programId][phase]
      assert.equal(await page.locator(`[data-phase="${phase}"] [data-slot="${slotId}"]`).getByText(`2 подхода по ${reps} повторений на каждую сторону`, { exact: true }).count(), 1)
      const change = data.corrections[0].changes.find((c) => c.slot_id === slotId)
      assert.equal(change.original.time_seconds, decision.phases[phase].original_time_seconds)
    }
    if (program.programId === 'PRG_000063') {
      assert.deepEqual(data.unitConflicts.map((c) => c.exercise_id), ['EX_000139', 'EX_000139', 'EX_000139'])
      assert.ok(data.phases.flatMap((p) => p.sessions).flatMap((s) => s.slots)
        .filter((s) => s.exercise_id === 'EX_000139').every((s) => s.rep_min === null && s.time_seconds !== null))
    }
    pass(`${program.programId}: real phases, ${program.slotCount} slots, exact per-side doses and preserved originals; execution blocked`)
  }
  await page.locator('#preview details').first().evaluate((element) => { element.open = true })
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(accessibility.violations.map((v) => v.id), [])
    await page.screenshot({ path: resolve(artifacts, `preview-${width}.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const deadbug = page.locator(`[data-slot="${decision.programs.PRG_000060.PHASE_01}"]`)
  await deadbug.evaluate((element) => { element.closest('details').open = true })
  await deadbug.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(artifacts, 'deadbug-dose-390.png') })
  pass('320/390/1280px layouts and accessibility checks passed')
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), storage)
  assert.deepEqual(await hashes(), before)
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  pass('No source/journal/history changes, runtime errors, external calls or publication')
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'passed', checks, errors, external,
    native_telegram_tested: false, source_sha256: receipt.source_sha256, executed_at: new Date().toISOString() }, null, 2))
  console.log(`Artifacts: ${artifacts}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
