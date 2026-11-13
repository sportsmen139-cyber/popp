import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Isolated browser contexts only. Nothing loads the live Telegram URL or real data.
// The immutable fixture was captured through the original b9c38f4 UI before edits.
const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseline = JSON.parse(
  await readFile(resolve(client, 'scripts/fixtures/ui-before-b9c38f4.json'), 'utf8'),
)
const artifacts =
  process.env.POPP_CAPTURE_DIR || (await mkdtemp(resolve(tmpdir(), 'popp-ui-review-')))
await mkdir(artifacts, { recursive: true })
assert.ok(existsSync(resolve(client, 'dist/index.html')), 'Run npm run build first')
const executablePath =
  process.env.POPP_BROWSER_PATH ||
  ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync)
assert.ok(executablePath, 'Set POPP_BROWSER_PATH to an installed Chromium executable')
const port = process.env.POPP_UI_PORT || '5185'
const origin = `http://127.0.0.1:${port}`
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--strictPort',
  ],
  { cwd: client, stdio: ['ignore', 'pipe', 'pipe'] },
)
let serverOutput = ''
server.stdout.on('data', (data) => {
  serverOutput += data
})
server.stderr.on('data', (data) => {
  serverOutput += data
})
let browser
const pageErrors = []
const externalRequests = []
const checks = []
const screens = []

function passed(name) {
  checks.push(name)
  console.log(`PASS ${name}`)
}
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function setup(width = 390, height = 844, profile) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width < 600,
    hasTouch: width < 600,
    timezoneId: 'Europe/Moscow',
  })
  if (profile)
    await context.addInitScript(
      (value) => localStorage.setItem('fitness-onboarding-profile', JSON.stringify(value)),
      profile,
    )
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:'))
      externalRequests.push(request.url())
  })
  await page.clock.setFixedTime(new Date('2026-11-13T09:00:00Z'))
  await page.goto(origin)
  await page.evaluate(() => document.fonts.ready)
  return { page, context }
}

async function capture(page, name, fullPage = false) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage })
  screens.push(name)
}

async function layout(page, name) {
  const result = await page.evaluate(() => {
    const tooSmall = [...document.querySelectorAll('button,input,select,summary,a[href]')]
      .filter((element) => {
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && (box.width < 43.9 || box.height < 43.9)
      })
      .map(
        (element) =>
          `${element.tagName}: ${element.textContent?.trim().slice(0, 50) || element.getAttribute('aria-label')}`,
      )
    return {
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      tooSmall,
    }
  })
  assert.equal(result.overflow, false, `${name}: horizontal overflow at ${result.width}px`)
  assert.deepEqual(result.tooSmall, [], `${name}: controls below 44×44px`)
}

async function accessibility(page, name) {
  // Audit settled UI states, after real CSS transitions finish; no WCAG rules are skipped.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    results.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      elements: item.nodes.map((node) => node.target),
    })),
    [],
    `${name}: accessibility violations`,
  )
  passed(`axe ${name}`)
}

async function onboard(page) {
  await page.getByRole('button', { name: /^В зале/ }).click()
  await page.getByRole('button', { name: '3 раза в неделю', exact: true }).click()
  await page.getByRole('button', { name: 'Новичок', exact: true }).click()
  await page.getByRole('button', { name: 'Поддерживать форму', exact: true }).click()
}

async function checkin(page, adapt = false) {
  await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click()
  const groups = page.locator('.session-checkin .session-feeling-options')
  await groups
    .nth(0)
    .getByRole('button', { name: adapt ? 'Усталость' : 'Нормально', exact: true })
    .click()
  if (adapt) await groups.nth(1).getByRole('button', { name: 'Плохо', exact: true }).click()
  await groups.nth(2).getByRole('button', { name: 'Нет', exact: true }).click()
  if (adapt) {
    await page.getByRole('button', { name: 'У меня меньше времени', exact: true }).click()
    await page.getByRole('button', { name: '20 мин', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
}

async function fill(page, iteration = 0) {
  const cards = page.locator('.exercise-card')
  for (let index = 0; index < (await cards.count()); index++) {
    const card = cards.nth(index)
    const weights = card.getByRole('spinbutton', { name: /^Вес, подход/ })
    const reps = card.getByRole('spinbutton', { name: /^Повторения, подход/ })
    for (let set = 0; set < (await weights.count()); set++) {
      await weights.nth(set).fill(String(20 + index * 5 + iteration * 2.5))
      await reps.nth(set).fill('12')
    }
    await card.getByRole('button', { name: 'Нормально', exact: true }).click()
    await card.getByRole('button', { name: 'Нормально', pressed: true, exact: true }).waitFor()
  }
}

async function storage(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['fitness-onboarding-profile', 'fitness-user-progress', 'fitness-workout-history'].map(
        (key) => [key, JSON.parse(localStorage.getItem(key) ?? 'null')],
      ),
    ),
  )
}

try {
  for (let attempts = 0; ; attempts++) {
    assert.equal(server.exitCode, null, `Preview server stopped: ${serverOutput}`)
    try {
      if ((await fetch(origin)).ok) break
    } catch {
      /* Wait for the isolated server. */
    }
    assert.ok(attempts < 100, `Preview did not start: ${serverOutput}`)
    await delay(100)
  }
  browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
  for (const width of [320, 360, 390, 430, 1280]) {
    const { page, context } = await setup(width, width === 1280 ? 900 : 844)
    await layout(page, `onboarding ${width}`)
    if (width === 390) {
      await capture(page, 'onboarding')
      await accessibility(page, 'onboarding')
      await page.keyboard.press('Tab')
      assert.notEqual(
        await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle),
        'none',
      )
    }
    await onboard(page)
    await layout(page, `home ${width}`)
    if (width === 390) {
      await capture(page, 'home')
      await accessibility(page, 'home')
    }
    if (width === 1280) await capture(page, 'home-desktop')
    await page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
    await page.getByRole('heading', { name: 'Мой прогресс', exact: true }).waitFor()
    await layout(page, `empty progress ${width}`)
    assert.equal(
      await page.locator('.recharts-surface').count(),
      0,
      'Empty history must not draw charts',
    )
    if (width === 390) {
      await capture(page, 'progress-empty', true)
      await accessibility(page, 'empty progress')
    }
    await page.getByRole('button', { name: 'К тренировке', exact: true }).click()
    await page.getByRole('button', { name: 'Начать тренировку', exact: true }).click()
    const proceed = page.getByRole('button', { name: 'Продолжить', exact: true })
    assert.equal(await proceed.isDisabled(), true)
    const groups = page.locator('.session-checkin .session-feeling-options')
    await groups.nth(0).getByRole('button', { name: 'Нормально', exact: true }).click()
    assert.equal(await proceed.isDisabled(), true)
    await groups.nth(2).getByRole('button', { name: 'Да', exact: true }).click()
    assert.equal(await proceed.isDisabled(), true)
    await page.getByRole('button', { name: 'Спазмы', exact: true }).click()
    assert.equal(await proceed.isEnabled(), true)
    await layout(page, `symptoms ${width}`)
    await groups.nth(2).getByRole('button', { name: 'Нет', exact: true }).click()
    if (width === 390) {
      await capture(page, 'checkin', true)
      await accessibility(page, 'check-in')
    }
    await proceed.click()
    await page.locator('.exercise-card').first().waitFor()
    await layout(page, `workout ${width}`)
    await page.waitForFunction(() => scrollY === 0)
    const finish = await page
      .getByRole('button', { name: 'Завершить тренировку', exact: true })
      .boundingBox()
    assert.ok(
      finish && finish.y >= 0 && finish.y + finish.height <= (width === 1280 ? 900 : 844),
      'Finish action stays in viewport',
    )
    if (width === 390) {
      await accessibility(page, 'workout')
      await capture(page, 'workout')
      await page.locator('.set-input').first().focus()
      await page.setViewportSize({ width, height: 480 })
      await layout(page, 'keyboard-sized viewport')
      const box = await page
        .getByRole('button', { name: 'Завершить тренировку', exact: true })
        .boundingBox()
      assert.ok(box && box.y + box.height <= 480)
      await page.setViewportSize({ width, height: 844 })
      const beforeSafeArea = await page
        .getByRole('button', { name: 'Завершить тренировку', exact: true })
        .boundingBox()
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--tg-content-safe-area-inset-bottom', '34px'),
      )
      const afterSafeArea = await page
        .getByRole('button', { name: 'Завершить тренировку', exact: true })
        .boundingBox()
      assert.ok(
        Math.abs(beforeSafeArea.y - afterSafeArea.y - 34) < 1,
        'Telegram safe-area moves the action clear of its bottom inset',
      )
      await page.evaluate(() => {
        document.documentElement.style.removeProperty('--tg-content-safe-area-inset-bottom')
        Object.defineProperty(visualViewport, 'height', {
          configurable: true,
          value: innerHeight - visualViewport.offsetTop - 300,
        })
        visualViewport.dispatchEvent(new Event('resize'))
      })
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue('--keyboard-inset'),
        ),
        '300px',
      )
      await page.evaluate(() => {
        delete visualViewport.height
        visualViewport.dispatchEvent(new Event('resize'))
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(
        await page
          .getByRole('button', { name: 'Завершить тренировку', exact: true })
          .evaluate((element) => getComputedStyle(element).transitionDuration),
        '0s',
      )
    }
    passed(`320/360/390/430/desktop: ${width}px layout, validation and controls`)
    await context.close()
  }

  const { page, context } = await setup()
  await onboard(page)
  const referenceHistory = baseline.normal['fitness-workout-history']
  const firstExercise = referenceHistory[3].exercises[0].exerciseId
  const previousSet = referenceHistory
    .slice(0, 3)
    .reverse()
    .flatMap((session) => session.exercises)
    .find((exercise) => exercise.exerciseId === firstExercise).sets[0]
  for (let iteration = 0; iteration < 5; iteration++) {
    await page.clock.setFixedTime(
      new Date(`2026-11-${String(3 + iteration * 2).padStart(2, '0')}T09:00:00Z`),
    )
    await checkin(page)
    if (iteration === 3)
      assert.equal(
        await page
          .locator('.exercise-card')
          .first()
          .getByRole('spinbutton', { name: 'Вес, подход 1', exact: true })
          .inputValue(),
        String(previousSet.weightKg),
        'Latest exercise result across templates still prefills',
      )
    await fill(page, iteration)
    if (iteration === 3) {
      await page.locator('.exercise-card').first().scrollIntoViewIfNeeded()
      await capture(page, 'workout-recorded')
      assert.ok(
        (
          await page.locator('.exercise-card').first().locator('.previous-result').innerText()
        ).includes(`${previousSet.weightKg} кг × ${previousSet.reps}`),
      )
    }
    await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  }
  assert.deepEqual(
    await storage(page),
    baseline.normal,
    'Five completions must match the original UI exactly',
  )
  await page.reload()
  assert.deepEqual(
    await storage(page),
    baseline.normal,
    'Reload must preserve all three storage values',
  )
  await page.getByRole('heading', { name: 'Full Body C', exact: true }).waitFor()
  await capture(page, 'home-with-history', true)
  await page.clock.setFixedTime(new Date('2026-11-13T09:00:00Z'))
  await page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await page.locator('.recharts-line-dot').first().waitFor()
  await accessibility(page, 'recorded progress')
  for (const width of [320, 360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 })
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
    await layout(page, `recorded progress ${width}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  await capture(page, 'progress', true)
  await page.locator('.recharts-line-dot').first().hover({ force: true })
  await page.locator('.progress-tooltip').waitFor()
  assert.match(await page.locator('.progress-tooltip').innerText(), /Подход 1: 12 повт\./)
  await capture(page, 'progress-tooltip')
  for (const weeks of [4, 8, 12]) {
    const button = page.getByRole('button', {
      name: `${weeks} ${weeks === 4 ? 'недели' : 'недель'}`,
      exact: true,
    })
    await button.click()
    await page
      .getByRole('button', {
        name: `${weeks} ${weeks === 4 ? 'недели' : 'недель'}`,
        pressed: true,
        exact: true,
      })
      .waitFor()
  }
  await page.getByLabel('Упражнение', { exact: true }).selectOption('leg-press')
  await page.getByText('Записи нагрузки', { exact: true }).click()
  assert.match(await page.locator('.progress-records table').first().innerText(), /27,5 кг/)
  await page.getByRole('button', { name: 'К тренировке', exact: true }).click()
  await page.getByRole('button', { name: 'Изменить профиль', exact: true }).click()
  assert.deepEqual(
    (await storage(page))['fitness-workout-history'],
    baseline.normal['fitness-workout-history'],
    'Editing profile must not clear history',
  )
  assert.deepEqual(
    (await storage(page))['fitness-user-progress'],
    baseline.normal['fitness-user-progress'],
  )
  passed(
    'Five normal completions, previous results, progression, reload, period/exercise controls and profile history retention',
  )
  await context.close()

  const coach = await setup()
  await onboard(coach.page)
  for (let iteration = 0; iteration < 5; iteration++) {
    await checkin(coach.page, true)
    await coach.page.getByRole('button', { name: 'Принять адаптацию', exact: true }).click()
    await fill(coach.page)
    await coach.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  }
  await coach.page.getByText('Замечаю частую усталость', { exact: true }).waitFor()
  await coach.page.locator('.coach-note').screenshot({ path: resolve(artifacts, 'coach.png') })
  screens.push('coach')
  await accessibility(coach.page, 'coach observations')
  passed('Coach observations are derived from five actual synthetic UI completions')
  await coach.context.close()

  for (const accepted of [true, false]) {
    const { page, context } = await setup()
    await onboard(page)
    await checkin(page, true)
    await page
      .getByRole('button', {
        name: accepted ? 'Принять адаптацию' : 'Оставить обычную тренировку',
        exact: true,
      })
      .click()
    assert.equal(await page.locator('.exercise-card').count(), accepted ? 3 : 5)
    await fill(page)
    await page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
    assert.deepEqual(await storage(page), baseline[accepted ? 'accepted' : 'declined'])
    passed(`${accepted ? 'Accepted' : 'Declined'} adaptation exactly matches pre-redesign storage`)
    await context.close()
  }

  const partial = await setup()
  await onboard(partial.page)
  await checkin(partial.page)
  await partial.page
    .locator('.exercise-card')
    .first()
    .getByRole('spinbutton', { name: 'Вес, подход 1', exact: true })
    .fill('0')
  await partial.page
    .locator('.exercise-card')
    .first()
    .getByRole('spinbutton', { name: 'Повторения, подход 1', exact: true })
    .fill('0')
  await partial.page.getByRole('button', { name: 'Завершить тренировку', exact: true }).click()
  const saved = (await storage(partial.page))['fitness-workout-history'][0]
  assert.deepEqual(saved.exercises[0].sets[0], { setNumber: 1, weightKg: 0, reps: 0 })
  assert.deepEqual(saved.exercises[0].sets[1], { setNumber: 2 }, 'Missing values remain missing')
  passed('Explicit zero and partial records remain intact')
  await partial.context.close()

  for (const [name, profile] of [
    ['unsupported home', { ...baseline.normal['fitness-onboarding-profile'], environment: 'home' }],
    [
      'unsupported outdoor',
      { ...baseline.normal['fitness-onboarding-profile'], environment: 'outdoor' },
    ],
    [
      'unsupported two-day program',
      { ...baseline.normal['fitness-onboarding-profile'], daysPerWeek: 2 },
    ],
    [
      'unsupported four-day program',
      { ...baseline.normal['fitness-onboarding-profile'], daysPerWeek: 4 },
    ],
    [
      'known empty inventory',
      { ...baseline.normal['fitness-onboarding-profile'], availableEquipment: [] },
    ],
    [
      'invalid inventory',
      { ...baseline.normal['fitness-onboarding-profile'], availableEquipment: ['тренажёр'] },
    ],
  ]) {
    const { page, context } = await setup(320, 844, profile)
    await page.getByRole('heading', { name: 'Тренировка недоступна', exact: true }).waitFor()
    await layout(page, name)
    if (name === 'invalid inventory') {
      await accessibility(page, 'unavailable state')
      await capture(page, 'unavailable')
    }
    passed(name)
    await context.close()
  }

  const inventory = [
    'kettlebell',
    'chest_press_machine',
    'lat_pulldown_machine',
    'hyperextension_bench',
    'dumbbells',
  ]
  const verifiedProfile = {
    ...baseline.normal['fitness-onboarding-profile'],
    availableEquipment: inventory,
  }
  const known = await setup(390, 844, verifiedProfile)
  await known.page.getByRole('heading', { name: 'Full Body A', exact: true }).waitFor()
  assert.equal(await known.page.locator('.equipment-note').count(), 0)
  assert.deepEqual((await storage(known.page))['fitness-onboarding-profile'], verifiedProfile)
  await known.context.close()
  passed('Known inventory stays verified and unmodified')

  for (const [label, goal] of [
    [
      'Увеличить ягодицы',
      { goalType: 'hypertrophy', target: { type: 'muscle_group', id: 'glutes' }, priority: 'high' },
    ],
    [
      'Лучше подтягиваться',
      {
        goalType: 'exercise_performance',
        target: { type: 'exercise', id: 'pull_up' },
        priority: 'high',
      },
    ],
  ]) {
    const { page, context } = await setup()
    await page.getByRole('button', { name: /^В зале/ }).click()
    await page.getByRole('button', { name: 'Назад', exact: true }).click()
    await page.getByRole('button', { name: /^В зале/ }).click()
    await page.getByRole('button', { name: '3 раза в неделю', exact: true }).click()
    await page.getByRole('button', { name: 'Средний', exact: true }).click()
    await page.getByRole('button', { name: 'Назад', exact: true }).click()
    await page.getByRole('button', { name: 'Продвинутый', exact: true }).click()
    await page.getByRole('button', { name: label, exact: true }).click()
    assert.deepEqual((await storage(page))['fitness-onboarding-profile'].goal, goal)
    await context.close()
    passed(`Onboarding back navigation and goal: ${label}`)
  }

  const metadata = await setup()
  assert.equal(await metadata.page.title(), 'POPP Fitness — тренировки и прогресс')
  assert.equal(await metadata.page.locator('html').getAttribute('lang'), 'ru')
  assert.equal(
    await metadata.page.locator('meta[name="theme-color"]').getAttribute('content'),
    '#F3F0E8',
  )
  assert.equal((await fetch(`${origin}/favicon.svg`)).status, 200)
  assert.equal((await fetch(`${origin}/apple-touch-icon.png`)).status, 200)
  await metadata.context.close()
  passed('Branded metadata, Russian document and original icons')

  const loading = await setup()
  await onboard(loading.page)
  let releaseChunk
  const chunkGate = new Promise((done) => {
    releaseChunk = done
  })
  await loading.page.route(
    '**/assets/ProgressScreen-*.js',
    async (route) => {
      await chunkGate
      await route.continue()
    },
    { times: 1 },
  )
  try {
    await loading.page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
    await loading.page.locator('.loading-state').waitFor()
    await capture(loading.page, 'loading')
    await layout(loading.page, 'loading')
  } finally {
    releaseChunk()
  }
  await loading.page.getByRole('heading', { name: 'Мой прогресс', exact: true }).waitFor()
  await loading.context.close()
  passed('Branded loading state while the real lazy module is pending')

  const recovery = await setup()
  await recovery.context.addInitScript((snapshot) => {
    for (const [key, value] of Object.entries(snapshot))
      localStorage.setItem(key, JSON.stringify(value))
  }, baseline.normal)
  await recovery.page.reload()
  await recovery.page.route('**/assets/ProgressScreen-*.js', (route) => route.abort('failed'), {
    times: 1,
  })
  await recovery.page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await recovery.page.getByRole('heading', { name: 'Прогресс не открылся', exact: true }).waitFor()
  assert.deepEqual(
    await storage(recovery.page),
    baseline.normal,
    'Failed chunk must not modify stored records',
  )
  await capture(recovery.page, 'progress-error')
  await accessibility(recovery.page, 'lazy module recovery')
  await recovery.page.getByRole('button', { name: 'К тренировке', exact: true }).click()
  await recovery.page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await recovery.page.getByRole('button', { name: 'Обновить страницу', exact: true }).click()
  await recovery.page.getByRole('button', { name: 'Мой прогресс', exact: true }).click()
  await recovery.page.locator('.recharts-line-dot').first().waitFor()
  assert.deepEqual(await storage(recovery.page), baseline.normal)
  await recovery.context.close()
  passed('Failed lazy module recovers through actual back/reload actions without data loss')

  assert.deepEqual(pageErrors, [], 'Browser runtime errors')
  assert.deepEqual(externalRequests, [], 'No cloud, tracking or external font requests allowed')
  await writeFile(
    resolve(artifacts, 'review.json'),
    JSON.stringify(
      {
        checks,
        screenshots: screens,
        baseline: 'b9c38f4',
        viewports: [320, 360, 390, 430, 1280],
        pageErrors,
        externalRequests,
        note: 'Chromium emulation, not a native Telegram/iOS/Android device test. Synthetic data produced through UI in isolated contexts only.',
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`${checks.length} browser checks passed. Artifacts: ${artifacts}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
