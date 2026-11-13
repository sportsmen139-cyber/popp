import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

// Offline review only. Real source content stays in the ignored local preview.
const snapshot = process.argv[2]
assert.ok(
  snapshot,
  'Usage: node scripts/smart-trainer-preview-review.mjs <snapshot-folder> [report.json]',
)
const executablePath =
  process.env.POPP_BROWSER_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
assert.ok(executablePath, 'Set POPP_BROWSER_PATH to Chromium')
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
const checks = []
const errors = []
const requests = []
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith('file:')) requests.push(request.url())
  })
  // Managed Chromium blocks file:// navigation. Render the authorized local
  // artifact in memory without changing browser policy or publishing a server.
  await page.setContent(await readFile(resolve(snapshot, 'index.html'), 'utf8'))
  assert.equal(await page.locator('#record option').count(), 203)
  checks.push('203 real source exercise revisions selectable')
  await page.locator('#record').selectOption('71')
  await page
    .locator('#details')
    .getByText('REJECTED · imported · публикация отключена', { exact: true })
    .waitFor()
  checks.push('REJECTED source record shown as rejected, never published')
  await page.locator('#kind').selectOption('programs')
  assert.equal(await page.locator('#record option').count(), 108)
  for (const index of [0, 5, 53, 67, 94, 107]) {
    await page.locator('#record').selectOption(String(index))
    assert.equal(await page.locator('#details section').count(), 3)
    assert.ok((await page.locator('#details summary').count()) > 1)
  }
  checks.push(
    '108 real programs selectable; first/last/return/one-day examples retain three phases',
  )
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
  }
  checks.push('320/390/1280px layout fits viewport')
  assert.deepEqual(errors, [])
  assert.deepEqual(requests, [])
  checks.push('No runtime errors, external requests or delivery calls')
  const report =
    JSON.stringify(
      {
        checks,
        errors,
        externalRequests: requests,
        note: 'Local file preview, no deployment or production data.',
      },
      null,
      2,
    ) + '\n'
  if (process.argv[3]) await writeFile(process.argv[3], report)
  console.log(report)
} finally {
  await browser.close()
}
