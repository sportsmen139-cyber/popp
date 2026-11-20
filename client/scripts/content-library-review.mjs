import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

assert.ok(process.argv[2], 'Pass the real private generated catalog HTML')
const path = resolve(process.argv[2]), url = pathToFileURL(path).href
const source = await readFile(path, 'utf8')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-library-review-'))
const browser = await chromium.launch({ executablePath: process.env.POPP_BROWSER_PATH, headless: true, args: ['--no-sandbox'] })
const checks = [], errors = [], external = []
const pass = (name) => { checks.push(name); console.log('PASS ' + name) }
const sentinels = Object.fromEntries(['fitness-onboarding-profile', 'fitness-user-progress', 'fitness-workout-history',
  'fitness-workout-draft-v1'].map((key) => [key, 'synthetic unchanged ' + key]))
async function open(target = url, setup) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  await context.addInitScript((values) => { Object.entries(values).forEach(([k, v]) => localStorage.setItem(k, v)) }, sentinels)
  if (setup) await context.addInitScript(setup)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (!request.url().startsWith('file:') && !request.url().startsWith('blob:')) external.push(request.url()) })
  await page.goto(target)
  return { page, context }
}
async function ready(page) { await page.locator('body[data-ready="true"]').waitFor() }
async function expand(page, id) {
  if (!await page.locator('#' + id).evaluate((element) => element.open)) await page.locator('#' + id + '>summary').click()
}
async function records(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('popp-private-content-review-v1:'))
    return key ? JSON.parse(localStorage.getItem(key)) : null
  })
}
async function search(page, query) { await page.locator('#search').fill(query) }
async function choose(page, query) {
  await search(page, query)
  await page.locator('#cards input[type=checkbox]').first().check()
}
async function approve(page) {
  await expand(page, 'review-details')
  await page.locator('#reviewer').fill('SYNTHETIC browser reviewer — disposable context only')
  await page.locator('#ack').check()
  await page.locator('#approve').click()
  await page.locator('#message').filter({ hasText: 'Решение сохранено локально' }).waitFor()
}
async function unchanged(page) {
  assert.deepEqual(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), Object.keys(sentinels)), sentinels)
}
try {
  const { page, context } = await open()
  await ready(page)
  const data = await page.locator('#library-data').evaluate((e) => JSON.parse(e.textContent))
  await page.screenshot({ path: resolve(artifacts, 'initial-catalog-390.png') })
  assert.equal(data.entries.length, 200)
  assert.equal(data.entries.filter((e) => e.protected_first_packet).length, 10)
  assert.equal(data.entries.filter((e) => e.recorded_approval).length, 0)
  assert.deepEqual(data.initial_reviews, [])
  assert.equal(await records(page), null)
  for (const key of ['EX_000072@1', 'EX_000095@1', 'EX_000098@1']) assert.equal(data.entries.some((e) => e.key === key), false)
  pass('200 exact revisions, 190 new drafts, 10 preserved texts and 3 exclusions; zero inferred approvals')
  for (const entry of data.entries) {
    await search(page, entry.key.split('@')[0])
    const article = page.locator(`[data-key="${entry.key}"]`)
    assert.equal(await article.count(), 1)
    assert.equal(await article.locator('ol li').count(), entry.card.steps.length)
    assert.equal(await article.getByText(entry.card.start, { exact: true }).count(), 1)
    assert.equal(await article.getByText(entry.card.counting, { exact: true }).count(), 1)
  }
  pass('All 200 cards render their actual complete instructions and counting without substituting variants')
  await search(page, '')
  await expand(page, 'filter-details')
  await page.locator('#priority').selectOption('0')
  assert.match(await page.locator('#page-label').innerText(), /Найдено 20 /)
  await page.locator('#priority').selectOption('1')
  assert.match(await page.locator('#page-label').innerText(), new RegExp(`Найдено ${data.entries.filter((e) => e.needed_for_three_day).length} `))
  await page.locator('#priority').selectOption('all')
  const muscle = data.entries[0].muscle_filters[0]
  await page.locator('#muscle').selectOption(muscle)
  assert.match(await page.locator('#page-label').innerText(), new RegExp(`Найдено ${data.entries.filter((e) => e.muscle_filters.includes(muscle)).length} `))
  await page.locator('#muscle').selectOption('all')
  const equipment = data.entries.find((e) => e.card.exercise_id === 'EX_000013').equipment_filters[0]
  await page.locator('#equipment').selectOption(equipment)
  assert.match(await page.locator('#page-label').innerText(), new RegExp(`Найдено ${data.entries.filter((e) => e.equipment_filters.includes(equipment)).length} `))
  await page.locator('#equipment').selectOption('all')
  await page.locator('#status').selectOption('protected')
  assert.match(await page.locator('#page-label').innerText(), /Найдено 10 /)
  await page.locator('#status').selectOption('decision')
  assert.match(await page.locator('#page-label').innerText(), /Найдено 35 /)
  await page.locator('#status').selectOption('all')
  pass('Muscle, equipment, review status, first-ten and two-day priority filters use real metadata')

  await choose(page, 'EX_000013')
  assert.equal(await page.locator('#approve').isDisabled(), true)
  await approve(page)
  const first = await records(page)
  assert.equal(first.events.length, 1)
  assert.equal(first.events[0].items[0].text_sha256, data.entries.find((e) => e.card.exercise_id === 'EX_000013').text_sha256)
  assert.equal(first.events[0].scope, undefined)
  await page.reload(); await ready(page)
  await expand(page, 'filter-details')
  await expand(page, 'review-details')
  await page.locator('#group').selectOption('2')
  await page.locator('#select-page').click()
  await approve(page)
  assert.equal((await records(page)).events[1].items.length, 10)
  const downloading = page.waitForEvent('download')
  await page.locator('#export').click()
  const download = await downloading, backupPath = resolve(artifacts, 'synthetic-review-backup.json')
  await download.saveAs(backupPath)
  const backup = JSON.parse(await readFile(backupPath, 'utf8'))
  assert.equal(backup.events.length, 2)
  assert.ok(backup.events.every((e) => e.event_hash.length === 64))
  pass('Explicit single/group approvals bind exact text hashes; reload and hash-linked JSON backup retain history')

  await page.locator('#group').selectOption('all')
  await choose(page, 'EX_000013')
  await page.locator('#comment').fill('Synthetic change request; leave original text immutable.')
  await page.locator('#request-changes').click()
  await page.locator('#message').filter({ hasText: 'Решение сохранено локально' }).waitFor()
  assert.equal((await records(page)).events.length, 3)
  await page.locator('#import').setInputFiles(backupPath)
  await page.locator('#message').filter({ hasText: 'Более новая история оставлена' }).waitFor()
  assert.equal((await records(page)).events.length, 3)
  pass('New change requests append events; an older backup cannot erase newer approvals or comments')

  await choose(page, 'EX_000110')
  await page.locator('#reviewer').fill('Synthetic reviewer')
  await page.locator('#ack').check()
  assert.equal(await page.locator('#approve').isDisabled(), true)
  pass('Incomplete equipment cards cannot receive a final text approval through the interface')
  await page.locator('#clear-selection').click()
  await search(page, 'EX_000013')
  await page.locator('#cards article>details').evaluateAll((list) => list.forEach((e) => { e.open = true }))
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), [])
    await page.screenshot({ path: resolve(artifacts, `catalog-${width}.png`) })
  }
  await unchanged(page)
  pass('320/390/1280px layouts, keyboard/accessibility checks and all legacy storage sentinels preserved')

  const restored = await open(); await ready(restored.page)
  await expand(restored.page, 'review-details')
  await restored.page.locator('#import').setInputFiles(backupPath)
  await restored.page.locator('#message').filter({ hasText: 'Решения восстановлены' }).waitFor()
  assert.deepEqual(await records(restored.page), backup)
  const altered = structuredClone(backup); altered.events[0].items[0].text_sha256 = '0'.repeat(64)
  const alteredPath = resolve(artifacts, 'synthetic-wrong-version.json')
  await writeFile(alteredPath, JSON.stringify(altered))
  await restored.page.locator('#import').setInputFiles(alteredPath)
  await restored.page.locator('#message').filter({ hasText: 'Восстановление не выполнено' }).waitFor()
  assert.deepEqual(await records(restored.page), backup)
  await unchanged(restored.page)
  pass('Fresh-context restore accepts exact revisions and rejects altered text hashes without overwriting saved decisions')
  await restored.context.close()

  const fullKey = `popp-private-content-review-v1:${data.source_sha256}:${data.manifest_sha256}`
  const corruptContext = await browser.newContext()
  await corruptContext.addInitScript(({ key }) => localStorage.setItem(key, 'synthetic damaged journal'), { key: fullKey })
  const broken = await corruptContext.newPage(); await broken.goto(url); await ready(broken)
  await expand(broken, 'review-details')
  assert.match(await broken.locator('#storage-status').innerText(), /Запись заблокирована/)
  assert.equal(await broken.evaluate((key) => localStorage.getItem(key), fullKey), 'synthetic damaged journal')
  await corruptContext.close()
  pass('Corrupted local history is reported and preserved; no silent reset or fabricated approval')

  const failedSave = await open(); await ready(failedSave.page)
  await choose(failedSave.page, 'EX_000013'); await expand(failedSave.page, 'review-details')
  await failedSave.page.locator('#reviewer').fill('Synthetic quota failure')
  await failedSave.page.locator('#ack').check()
  await failedSave.page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('popp-private-content-review-v1:')) throw new DOMException('Synthetic storage full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await failedSave.page.locator('#approve').click()
  await failedSave.page.locator('#message').filter({ hasText: 'Решение не сохранено' }).waitFor()
  assert.equal(await records(failedSave.page), null)
  await unchanged(failedSave.page); await failedSave.context.close()
  pass('Storage write failure creates no phantom approval and preserves legacy records')

  const mismatchPath = resolve(artifacts, 'tampered-catalog.html')
  await writeFile(mismatchPath, source.replace(data.entries[0].text_sha256, '0'.repeat(64)))
  const mismatched = await open(pathToFileURL(mismatchPath).href)
  await mismatched.page.locator('#message').filter({ hasText: 'Каталог не прошёл проверку' }).waitFor()
  assert.equal(await mismatched.page.locator('#approve').isDisabled(), true)
  await mismatched.context.close()
  pass('Changing an embedded text hash prevents review startup and approval')
  const revised = structuredClone(data)
  revised.entries[0].card.content_revision = 'synthetic-unregistered-revision'
  const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : `{${Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',')}}`
  revised.entries[0].card_sha256 = createHash('sha256').update(canonical(revised.entries[0].card) + '\n').digest('hex')
  const revisionPath = resolve(artifacts, 'tampered-revision.html')
  const encoded = JSON.stringify(revised).replaceAll('<', '\\u003c')
  await writeFile(revisionPath, source.replace(/(<script type="application\/json" id="library-data">)[\s\S]*?(<\/script>)/,
    (_match, before, after) => before + encoded + after))
  const wrongRevision = await open(pathToFileURL(revisionPath).href)
  await wrongRevision.page.locator('#message').filter({ hasText: 'Редакции карточек не совпадают' }).waitFor()
  assert.equal(await wrongRevision.page.locator('#approve').isDisabled(), true)
  await wrongRevision.context.close()
  pass('A changed revision cannot reuse the old manifest even when the body text is identical')
  assert.deepEqual(await page.locator('#library-data').evaluate((e) => JSON.parse(e.textContent)), data)
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  assert.equal(await page.locator('img,video,audio,iframe').count(), 0)
  pass('No source text mutation, network requests, media, owner approval, assignment or publication')
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'passed', checks, errors, external,
    native_telegram_tested: false, actual_owner_approvals_created: false, reviews: 'synthetic disposable browser profiles only',
    executed_at: new Date().toISOString() }, null, 2))
  console.log('Artifacts: ' + artifacts)
  await context.close()
} finally { await browser.close() }
