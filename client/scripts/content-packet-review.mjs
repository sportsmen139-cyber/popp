import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Explicit owner-local draft only. No server, publishing, media or approval action.
assert.ok(process.argv[2], 'Pass the private review HTML file')
const html = await readFile(resolve(process.argv[2]), 'utf8')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-content-review-'))
const browser = await chromium.launch({ executablePath: process.env.POPP_BROWSER_PATH, headless: true, args: ['--no-sandbox'] })
const checks = [], errors = [], requests = []
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  await page.setContent(html)
  assert.equal(await page.locator('article[data-exercise]').count(), 10)
  assert.equal(await page.locator('img,video,audio,script,iframe').count(), 0)
  for (const card of await page.locator('article[data-exercise]').all()) {
    assert.equal(await card.locator('ol li').count(), 3)
    const mistakes = await card.locator('ul li').count()
    assert.ok(mistakes >= 2 && mistakes <= 4)
    for (const label of ['Оборудование.', 'Старт.', 'Безопасность.', 'Как считать.']) {
      assert.equal(await card.getByText(label, { exact: true }).count(), 1)
    }
  }
  checks.push('All ten private cards contain the required short sections, steps and 2–4 errors')
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    assert.deepEqual(axe.violations.map((v) => v.id), [])
    await page.screenshot({ path: resolve(artifacts, `packet-${width}.png`) })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const id of ['EX_000139', 'EX_000194', 'EX_000006']) {
    await page.locator(`[data-exercise="${id}"]`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(artifacts, id + '-390.png') })
  }
  checks.push('320/390/1280px: readable layout, no horizontal overflow or accessibility violations')
  assert.deepEqual(errors, []); assert.deepEqual(requests, [])
  checks.push('No media, scripts, external requests or publication; trainer decisions collected at the end')
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ status: 'passed', checks, errors, requests,
    trainer_approval: false, executed_at: new Date().toISOString() }, null, 2))
  checks.forEach((name) => console.log('PASS ' + name))
  console.log('Artifacts: ' + artifacts)
} finally { await browser.close() }
