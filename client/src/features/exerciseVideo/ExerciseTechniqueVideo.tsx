import { useEffect, useRef, useState } from 'react'
import { ActionButton } from '../../components/ui/Primitives'
import {
  exerciseVideoLibrary,
  findTechniqueVideo,
  LEGACY_EXERCISE_REVISION,
  validateResolvedVideo,
} from './videoLibrary'
import type { ExerciseVideoMetadata, ResolvedVideo, VideoResolver } from './videoLibrary'
import './exerciseVideo.css'

type Props = {
  exerciseId: string
  exerciseVersion?: string
  library?: readonly ExerciseVideoMetadata[]
  resolveVideo?: VideoResolver
}

/** Key isolates both async requests and playback when the exercise revision changes. */
export function ExerciseTechniqueVideo({
  exerciseId,
  exerciseVersion = LEGACY_EXERCISE_REVISION,
  library = exerciseVideoLibrary,
  resolveVideo,
}: Props) {
  const metadata = findTechniqueVideo(library, exerciseId, exerciseVersion)
  if (!metadata || !resolveVideo)
    return <p className="exercise-video-empty">Видео техники пока не добавлено.</p>
  return (
    <VideoPlayer
      key={`${exerciseId}:${exerciseVersion}:${metadata.id}`}
      metadata={metadata}
      resolveVideo={resolveVideo}
    />
  )
}

function VideoPlayer({
  metadata,
  resolveVideo,
}: {
  metadata: ExerciseVideoMetadata
  resolveVideo: VideoResolver
}) {
  const [requested, setRequested] = useState(false)
  const [media, setMedia] = useState<ResolvedVideo | null>(null)
  const [error, setError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!requested) return
    const controller = new AbortController()
    void (async () => {
      try {
        const result = await resolveVideo(metadata, controller.signal)
        if (!validateResolvedVideo(result)) throw new Error('Invalid media response')
        if (!controller.signal.aborted) setMedia(result)
      } catch {
        if (!controller.signal.aborted) setError(true)
      }
    })()
    return () => {
      controller.abort()
    }
  }, [requested, metadata, resolveVideo])

  useEffect(() => {
    const element = videoRef.current
    return () => {
      if (element) {
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
    }
  }, [media])

  function close() {
    setRequested(false)
    setMedia(null)
    setError(false)
  }

  return (
    <section className="exercise-video" aria-label="Видео техники">
      {!requested ? (
        <ActionButton variant="secondary" onClick={() => setRequested(true)}>
          Смотреть технику
        </ActionButton>
      ) : (
        <>
          {error ? (
            <p role="status">Не удалось загрузить видео. Закрой его и попробуй ещё раз.</p>
          ) : media ? (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="none"
              poster={media.posterUrl}
              src={media.url}
              aria-label={metadata.title}
              onError={() => setError(true)}
            />
          ) : (
            <p role="status">Загружаем видео…</p>
          )}
          <ActionButton variant="text" onClick={close}>
            Закрыть видео
          </ActionButton>
        </>
      )}
    </section>
  )
}
