import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Real pilot content, isolated temporary journal and explicit synthetic reviewer.
// Nothing writes to the owner's journal, original snapshot or Mini App storage.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const bundleFile = resolve(process.argv[2] || '')
assert.ok(process.argv[2] && existsSync(bundleFile), 'Pass the private prepared bundle.json')
const bundleBytes = await readFile(bundleFile)
const bundle = JSON.parse(bundleBytes)
const temp = await mkdtemp(resolve(tmpdir(), 'popp-trainer-review-'))
const journal = resolve(temp, 'synthetic-journal.json')
const server = spawn(
  'python',
  [
    '-u',
    '-m',
    'tools.smart_trainer.review',
    'serve',
    '--bundle',
    bundleFile,
    '--journal',
    journal,
    '--port',
    '0',
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
)
let output = ''
server.stdout.on('data', (data) => {
  output += data
})
server.stderr.on('data', (data) => {
  output += data
})
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const executablePath =
  process.env.POPP_BROWSER_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
assert.ok(executablePath, 'Set POPP_BROWSER_PATH to Chromium')
const checks = [],
  errors = [],
  external = []
let browser
function pass(name) {
  checks.push(name)
  console.log(`PASS ${name}`)
}

try {
  let origin
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error(output)
    origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (origin) break
    await delay(100)
  }
  assert.ok(origin, output)
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const baseline = JSON.parse(
    await readFile(resolve(root, 'client/scripts/fixtures/ui-before-b9c38f4.json'), 'utf8'),
  ).normal
  await context.addInitScript((values) => {
    for (const [key, value] of Object.entries(values))
      localStorage.setItem(key, JSON.stringify(value))
  }, baseline)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url())
  })
  await page.goto(origin)
  await page.locator('#card h2').waitFor()
  const getState = () => page.evaluate(async () => (await (await fetch('/api/state')).json()).state)
  const select = async (filter, key) => {
    await page.locator('#filter').selectOption(filter)
    if (key) await page.locator('#entity').selectOption(key)
  }
  assert.equal((await getState()).approved, 0)
  assert.equal(await page.locator('.week').count(), 8)
  assert.equal(await page.locator('.session').count(), 24)
  assert.equal(await page.locator('#ack').isChecked(), false)
  assert.equal(await page.locator('#approve').isDisabled(), true)
  pass('Real PRG_000002: eight nominal weeks, three phases, no pre-approved decisions')

  await page.locator('#reviewer').fill('Synthetic browser reviewer — test journal only')
  await page.locator('#ack').check()
  assert.equal(await page.locator('#approve').isDisabled(), true)
  const denied = await page.evaluate(async () => {
    const data = await (await fetch('/api/pilot')).json()
    const response = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-CSRF': data.csrf },
      body: JSON.stringify({
        items: [data.bundle.program_key],
        action: 'approve',
        reviewer: 'Synthetic browser reviewer',
        comment: '',
        expected_head: data.state.head,
        source_sha256: data.bundle.source_sha256,
        bundle_hash: data.bundle.bundle_hash,
        acknowledged: true,
      }),
    })
    return { status: response.status, data: await response.json() }
  })
  assert.equal(denied.status, 409)
  assert.equal(denied.data.error, 'dependencies_unreviewed')
  assert.equal((await getState()).events.length, 0)
  pass('UI and server both prevent program approval with unreviewed dependencies')

  await select('core', 'exercise:EX_000135@1')
  assert.equal(await page.locator('#entity option').count(), 10)
  await page.getByText('Техника выполнения', { exact: true }).waitFor()
  await page.locator('#comment').fill('Synthetic correction question, not a real trainer decision')
  await page.locator('#ack').check()
  await page.locator('#correction').click()
  await page.getByRole('status').filter({ hasText: 'Решение записано' }).waitFor()
  assert.equal((await getState()).units['exercise:EX_000135@1'].status, 'needs_correction')
  await page.getByText('Исходник: NEEDS_REVIEW', { exact: true }).waitFor()
  pass('All ten core exercises available; correction records separately, source status unchanged')

  const leafKeys = Object.entries(bundle.units)
    .filter(([, unit]) => unit.dependencies.length === 0)
    .map(([key]) => key)
  const leaf = leafKeys[0],
    otherLeaf = leafKeys[1]
  await select('definitions', leaf)
  await page.locator('#ack').check()
  await page.locator('#approve').click()
  await page.getByRole('status').filter({ hasText: 'Решение записано' }).waitFor()
  assert.equal((await getState()).units[leaf].status, 'approved')
  await page.locator('#comment').fill('Synthetic note after explicit approval')
  await page.locator('#ack').check()
  await page.locator('#note').click()
  await page.getByRole('status').filter({ hasText: 'Решение записано' }).waitFor()
  assert.equal((await getState()).units[leaf].status, 'approved')
  pass('Explicit approval and comment actions persist without automatic status promotion')

  await select('definitions', otherLeaf)
  await page.locator('#comment').fill('Synthetic rejection in isolated test journal')
  await page.locator('#ack').check()
  await page.locator('#reject').click()
  await page.getByRole('status').filter({ hasText: 'Решение записано' }).waitFor()
  assert.deepEqual(
    await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(localStorage).map((key) => [key, JSON.parse(localStorage.getItem(key))]),
      ),
    ),
    baseline,
  )
  await page.reload()
  await page.locator('#card h2').waitFor()
  const restored = await getState()
  assert.equal(restored.units[leaf].status, 'approved')
  assert.equal(restored.units[otherLeaf].status, 'rejected')
  assert.equal(restored.units['exercise:EX_000135@1'].status, 'needs_correction')
  assert.equal(restored.program_approved, false)
  pass('Approve/correct/reject/comment survive reload through the filesystem journal')

  await select('definitions', leafKeys[2])
  await page.locator('#reviewer').fill('Synthetic browser reviewer — test journal only')
  await page.locator('#comment').fill('Unsaved synthetic comment')
  await page.locator('#ack').check()
  const beforeFailure = (await getState()).events.length
  await page.route(
    '**/api/review',
    (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'save_unconfirmed',
          message: 'Сохранение не подтверждено: synthetic failure',
        }),
      }),
    { times: 1 },
  )
  await page.locator('#note').click()
  await page.getByRole('status').filter({ hasText: 'Сохранение не подтверждено' }).waitFor()
  assert.equal((await getState()).events.length, beforeFailure)
  assert.equal(await page.locator('#comment').inputValue(), 'Unsaved synthetic comment')
  pass('Failed save never claims success or discards the comment draft')

  await page.evaluate(async () => {
    const data = await (await fetch('/api/pilot')).json()
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-CSRF': data.csrf },
      body: JSON.stringify({
        items: [data.bundle.program_key],
        action: 'comment',
        reviewer: 'Synthetic second window',
        comment: 'Synthetic concurrent edit',
        expected_head: data.state.head,
        source_sha256: data.bundle.source_sha256,
        bundle_hash: data.bundle.bundle_hash,
        acknowledged: true,
      }),
    })
  })
  await page.locator('#note').click()
  await page.getByRole('status').filter({ hasText: 'Журнал изменился' }).waitFor()
  await page.locator('#refresh').click()
  await page.getByRole('status').filter({ hasText: 'Состояние журнала обновлено' }).waitFor()
  pass('Concurrent reviewer window is detected; stale writes require refresh')

  await select('alternative', 'alternative:ALT_000475@1')
  assert.equal(await page.locator('#entity option').count(), 18)
  await page
    .getByText('C — изменение программы, не обычная автоматическая замена', { exact: true })
    .waitFor()
  await select('alternative_target', 'exercise:EX_000136@1')
  assert.equal(await page.locator('#entity option').count(), 18)
  pass('Only explicit pilot alternatives and targets are included; C semantics remain visible')

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
  }
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((node) => node.target) })),
    [],
  )
  pass('320/390/1280px layout and WCAG A/AA audit pass')

  const stored = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, JSON.parse(localStorage.getItem(key))]),
    ),
  )
  assert.deepEqual(stored, baseline)
  assert.deepEqual(await readFile(bundleFile), bundleBytes)
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  pass(
    'All legacy localStorage values and source bundle unchanged; no external requests or runtime errors',
  )
  const report =
    JSON.stringify(
      {
        checks,
        errors,
        externalRequests: external,
        journal: 'isolated temporary synthetic decisions only',
        real_owner_decisions_created: false,
      },
      null,
      2,
    ) + '\n'
  if (process.argv[3]) await writeFile(process.argv[3], report)
  await page.screenshot({ path: resolve(temp, 'trainer-review.png'), fullPage: true })
  console.log(`${checks.length} browser checks passed. Private artifacts: ${temp}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
