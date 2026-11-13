/** A code revision, not an invented Google Sheets exercise version. */
export const LEGACY_EXERCISE_REVISION = 'legacy-git:c072c8c0da7796feebb63757dc0d3b9115d2516e'

export type ExerciseVideoMetadata = {
  id: string
  exerciseId: string
  exerciseVersion: string
  type: 'technique' | 'setup' | 'detailed'
  storageObjectKey: string
  posterObjectKey: string
  checksum: string
  publicationStatus: 'imported' | 'validated' | 'trainer_approved' | 'published'
  reviewStatus: 'NEEDS_REVIEW' | 'REJECTED' | 'TRAINER_APPROVED'
  rightsConfirmed: boolean
  title: string
}

export type ResolvedVideo = { url: string; posterUrl: string; mimeType: 'video/mp4' | 'video/webm' }
export type VideoResolver = (
  metadata: ExerciseVideoMetadata,
  signal: AbortSignal,
) => Promise<ResolvedVideo>

// Intentionally empty. The owner's 103 files, rights, exact IDs and versions are unavailable.
// Never infer source versions or map files by name. No public Storage URL is guessed here.
export const exerciseVideoLibrary: readonly ExerciseVideoMetadata[] = []

export function findTechniqueVideo(
  library: readonly ExerciseVideoMetadata[],
  exerciseId: string,
  exerciseVersion: string,
): ExerciseVideoMetadata | undefined {
  if (!exerciseId || !exerciseVersion) return undefined
  // Duplicate media IDs make this metadata ambiguous; fail closed.
  const ids = new Set(library.map((video) => video.id))
  if (ids.size !== library.length) return undefined
  return library.find(
    (video) =>
      video.exerciseId === exerciseId &&
      video.exerciseVersion === exerciseVersion &&
      video.type === 'technique' &&
      video.publicationStatus === 'published' &&
      video.reviewStatus === 'TRAINER_APPROVED' &&
      video.rightsConfirmed === true &&
      video.id.trim() !== '' &&
      video.storageObjectKey.trim() !== '' &&
      video.posterObjectKey.trim() !== '' &&
      /^sha256:[a-f0-9]{64}$/.test(video.checksum),
  )
}

export function isSafeMediaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

export function validateResolvedVideo(value: ResolvedVideo): boolean {
  return (
    (value.mimeType === 'video/mp4' || value.mimeType === 'video/webm') &&
    isSafeMediaUrl(value.url) &&
    isSafeMediaUrl(value.posterUrl)
  )
}
