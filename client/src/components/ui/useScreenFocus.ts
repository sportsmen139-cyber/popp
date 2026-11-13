import { useEffect } from 'react'

/** Presentation-only route focus. It never watches or updates entered set values. */
export function useScreenFocus(screen: string) {
  useEffect(() => {
    const heading = document.querySelector<HTMLHeadingElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [screen])
}

/** Keep the fixed action above keyboards when the visual and layout viewports differ. */
export function useVisualViewportInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      const inset =
        viewport && viewport.scale === 1
          ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
          : 0
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  }, [])
}
