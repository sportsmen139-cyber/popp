import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'

// Synthetic contact and media stay in this runner, never in the production bundle.
const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = await mkdtemp(resolve(tmpdir(), 'popp-alpha-review-'))
const executablePath =
  process.env.POPP_BROWSER_PATH ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync)
if (process.env.POPP_BROWSER_PATH) assert.ok(existsSync(executablePath), 'POPP_BROWSER_PATH must point to Chromium')
const port = process.env.POPP_ALPHA_PORT || '5186'
const origin = `http://127.0.0.1:${port}`
const telegramSdk = 'https://telegram.org/js/telegram-web-app.js?65'
const fixture = JSON.parse(
  await readFile(resolve(client, 'scripts/fixtures/ui-before-b9c38f4.json'), 'utf8'),
).normal
let clip
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', port, '--strictPort'],
  {
    cwd: client,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, VITE_FEEDBACK_TELEGRAM_USERNAME: 'synthetic_alpha_contact' },
  },
)
let serverOutput = ''
server.stdout.on('data', (data) => {
  serverOutput += data
})
server.stderr.on('data', (data) => {
  serverOutput += data
})
let browser
const errors = []
const external = []
const checks = []
function pass(name) {
  checks.push(name)
  console.log(`PASS ${name}`)
}
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

async function audit(page, name) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    small: [...document.querySelectorAll('button,select,textarea,summary')]
      .filter((node) => {
        const box = node.getBoundingClientRect()
        return box.width > 0 && box.height > 0 && (box.width < 48 || box.height < 48)
      })
      .map((node) => node.textContent?.slice(0, 30)),
  }))
  assert.equal(layout.overflow, false, `${name}: overflow`)
  assert.deepEqual(layout.small, [], `${name}: target below 48px`)
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))),
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  assert.deepEqual(
    result.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
    [],
    `${name}: axe`,
  )
  pass(`${name}: 320px layout, 48px controls, WCAG A/AA`)
}

try {
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput)
    try {
      if ((await fetch(origin)).ok) {
        ready = true
        break
      }
    } catch {
      /* server starting */
    }
    await delay(100)
  }
  assert.ok(ready, serverOutput)
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  // Create a local synthetic clip with Playwright's own video recorder; no system ffmpeg needed.
  const mediaContext = await browser.newContext({ viewport: { width: 160, height: 240 },
    recordVideo: { dir: resolve(artifacts, 'synthetic-media'), size: { width: 160, height: 240 } } })
  const mediaPage = await mediaContext.newPage()
  await mediaPage.setContent('<html><body style="margin:0;background:#000"></body></html>')
  const video = mediaPage.video()
  assert.ok(video)
  await delay(1200)
  await mediaContext.close()
  clip = await readFile(await video.path())
  const context = await browser.newContext({
    viewport: { width: 320, height: 720 },
    hasTouch: true,
    isMobile: true,
  })
  await context.route(telegramSdk, (route) => route.fulfill({ contentType: 'text/javascript', body: '// Native SDK is intercepted in this isolated test.' }))
  await context.addInitScript((snapshot) => {
    for (const [key, value] of Object.entries(snapshot))
      localStorage.setItem(key, JSON.stringify(value))
  }, fixture)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = request.url()
    if (
      !url.startsWith(origin) &&
      !url.startsWith('data:') &&
      url !== telegramSdk &&
      !url.startsWith('https://media.example.invalid/')
    )
      external.push(url)
  })
  await page.goto(origin)
  await page.getByRole('button', { name: 'Обратная связь', exact: true }).click()
  await page
    .getByLabel('Твой отзыв', { exact: true })
    .fill('Синтетический отзыв: &text=one\nУдобный план')
  await audit(page, 'feedback configured')
  await page.screenshot({ path: resolve(artifacts, 'feedback.png'), fullPage: true })

  await page.evaluate(() => {
    window.__handoffs = []
    window.Telegram = { WebApp: { openTelegramLink: (url) => window.__handoffs.push(url) } }
  })
  await page.getByRole('button', { name: 'Открыть Telegram', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Запрошено открытие Telegram' }).waitFor()
  const url = new URL(await page.evaluate(() => window.__handoffs[0]))
  assert.equal(url.pathname, '/synthetic_alpha_contact')
  assert.ok(url.searchParams.get('text').includes('Удобный план'))
  assert.equal([...url.searchParams.keys()].join(','), 'text')
  pass('configured contact: real form requests Telegram handoff, no delivery claim')

  await page.evaluate(() => {
    delete window.Telegram
    window.open = (url) => {
      window.__handoffs.push(url)
      return null
    }
  })
  await page.getByRole('button', { name: 'Открыть Telegram', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__handoffs.length), 2)
  pass('without Telegram SDK: browser fallback requests opening even when noopener returns null')

  await page.evaluate(() => {
    window.Telegram = {
      WebApp: {
        openTelegramLink: () => {
          throw new Error('synthetic bridge error')
        },
      },
    }
  })
  await page.getByRole('button', { name: 'Открыть Telegram', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Не удалось открыть Telegram' }).waitFor()
  pass('native bridge exception: recoverable message, draft preserved')

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copied = text
        },
      },
    })
  })
  await page.getByRole('button', { name: 'Скопировать текст', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Текст скопирован' }).waitFor()
  assert.ok((await page.evaluate(() => window.__copied)).includes('Синтетический отзыв'))
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('synthetic clipboard denial')
    }
  })
  await page.getByRole('button', { name: 'Скопировать текст', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Не удалось скопировать' }).waitFor()
  await page.getByText('Текст для отправки', { exact: true }).click()
  assert.ok(await page.getByLabel('Текст для отправки', { exact: true }).inputValue())
  pass('clipboard success and denial: manual text remains accessible')

  await page.getByLabel('О чём хочешь рассказать?').selectOption('usability')
  await page.getByLabel('Насколько удобно?', { exact: false }).selectOption('4')
  assert.ok(
    (await page.getByLabel('Текст для отправки', { exact: true }).inputValue()).includes(
      'Удобство: 4 из 5',
    ),
  )
  await page.getByRole('button', { name: 'К плану', exact: true }).click()
  const stored = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, JSON.parse(localStorage.getItem(key))]),
    ),
  )
  assert.deepEqual(stored, fixture)
  pass('feedback leaves all three legacy localStorage values unchanged')

  // Mount real exported components through Vite's transformed source, without a
  // production fixture entry, query flag, mock content module or dev-only app path.
  async function mount(kind, props) {
    await page.evaluate(
      async ({ kind, props }) => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js')
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js')
        if (!window.__alphaRoot) {
          const container = document.createElement('div')
          document.body.append(container)
          document.getElementById('root').hidden = true
          window.__alphaRoot = ReactDOM.createRoot(container)
        }
        if (kind === 'feedback') {
          const { FeedbackScreen } = await import('/src/features/feedback/FeedbackScreen.tsx')
          window.__alphaRoot.render(
            React.createElement(FeedbackScreen, { ...props, onBack: () => {} }),
          )
        } else {
          const { ExerciseTechniqueVideo } = await import(
            '/src/features/exerciseVideo/ExerciseTechniqueVideo.tsx'
          )
          const resolver = props.failure
            ? async () => {
                throw new Error('synthetic resolver failure')
              }
            : async (_metadata, signal) => {
                window.__mediaRequests = (window.__mediaRequests || 0) + 1
                window.__mediaSignal = signal
                return {
                  url: 'https://media.example.invalid/synthetic.webm',
                  posterUrl: 'https://media.example.invalid/poster.svg',
                  mimeType: 'video/webm',
                }
              }
          window.__alphaRoot.render(
            React.createElement(
              'main',
              { className: 'app' },
              React.createElement('h1', null, 'Тест техники'),
              React.createElement(ExerciseTechniqueVideo, { ...props, resolveVideo: resolver }),
            ),
          )
        }
      },
      { kind, props },
    )
  }
  await mount('feedback', { channel: { status: 'missing' } })
  await page.getByText('Канал связи пока не настроен.', { exact: false }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Открыть Telegram', exact: true }).count(), 0)
  await page.getByLabel('Твой отзыв', { exact: true }).fill('Отзыв без адресата')
  await audit(page, 'feedback missing config')
  pass('missing contact: no broken send action, draft/copy available')

  let mediaRequests = 0
  await page.route('https://media.example.invalid/**', async (route) => {
    mediaRequests++
    if (route.request().url().endsWith('.webm'))
      await route.fulfill({ status: 200, contentType: 'video/webm', body: clip })
    else
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><rect width="160" height="240" fill="#1b2723"/></svg>',
      })
  })
  const metadata = {
    id: 'synthetic-only',
    exerciseId: 'EX_SYNTHETIC',
    exerciseVersion: '7',
    type: 'technique',
    storageObjectKey: 'synthetic.webm',
    posterObjectKey: 'poster.svg',
    checksum: `sha256:${'a'.repeat(64)}`,
    publicationStatus: 'published',
    reviewStatus: 'TRAINER_APPROVED',
    rightsConfirmed: true,
    title: 'Синтетическое видео',
  }
  await mount('video', { exerciseId: metadata.exerciseId, exerciseVersion: '7', library: [] })
  await page.getByText('Видео техники пока не добавлено.').waitFor()
  assert.equal(await page.locator('video').count(), 0)
  pass('empty video library: honest fallback without a broken play button')

  await mount('video', {
    exerciseId: metadata.exerciseId,
    exerciseVersion: '7',
    library: [metadata],
  })
  await page.getByRole('button', { name: 'Смотреть технику', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__mediaRequests || 0), 0)
  assert.equal(mediaRequests, 0)
  assert.equal(await page.locator('video').count(), 0)
  await page.getByRole('button', { name: 'Смотреть технику', exact: true }).click()
  await page.locator('video').waitFor()
  assert.deepEqual(
    await page
      .locator('video')
      .evaluate((video) => ({
        controls: video.controls,
        inline: video.playsInline,
        preload: video.preload,
        autoplay: video.autoplay,
        paused: video.paused,
      })),
    { controls: true, inline: true, preload: 'none', autoplay: false, paused: true },
  )
  await page.locator('video').evaluate(async (video) => {
    video.loop = true
    await video.play()
  })
  assert.equal(await page.locator('video').evaluate((video) => video.paused), false)
  await page.locator('video').evaluate((video) => video.pause())
  assert.equal(await page.locator('video').evaluate((video) => video.paused), true)
  await audit(page, 'technique player')
  await page.screenshot({ path: resolve(artifacts, 'video.png'), fullPage: true })
  await page.getByRole('button', { name: 'Закрыть видео', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__mediaSignal.aborted), true)
  assert.equal(await page.locator('video').count(), 0)
  pass('on-demand resolver, poster, native play/pause, inline/no-autoplay, cleanup')

  await page.getByRole('button', { name: 'Смотреть технику', exact: true }).click()
  await page.locator('video').waitFor()
  await page.locator('video').evaluate((video) => video.dispatchEvent(new Event('error')))
  await page.getByRole('status').filter({ hasText: 'Не удалось загрузить видео' }).waitFor()
  await page.getByRole('button', { name: 'Закрыть видео', exact: true }).click()
  pass('media element errors recover through close/retry')

  await mount('video', {
    exerciseId: metadata.exerciseId,
    exerciseVersion: '7',
    library: [metadata],
    failure: true,
  })
  await page.getByRole('button', { name: 'Смотреть технику', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Не удалось загрузить видео' }).waitFor()
  await mount('video', {
    exerciseId: metadata.exerciseId,
    exerciseVersion: '8',
    library: [metadata],
  })
  await page.getByText('Видео техники пока не добавлено.').waitFor()
  pass('resolver error handled; another exercise revision never inherits media')

  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  await writeFile(
    resolve(artifacts, 'review.json'),
    JSON.stringify(
      {
        checks,
        errors,
        external,
        syntheticMediaRequests: mediaRequests,
        note: 'Local Chromium only; no native Telegram or real messages/files.',
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`${checks.length} alpha browser checks passed. Artifacts: ${artifacts}`)
  await context.close()
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
