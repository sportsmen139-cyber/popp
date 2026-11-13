import { describe, expect, it } from 'vitest'
import {
  exerciseVideoLibrary,
  findTechniqueVideo,
  LEGACY_EXERCISE_REVISION,
  validateResolvedVideo,
} from './videoLibrary'
import type { ExerciseVideoMetadata } from './videoLibrary'

// Synthetic metadata only; no source exercise or real video is claimed by these fixtures.
const approved: ExerciseVideoMetadata = {
  id: 'synthetic-video',
  exerciseId: 'EX_TEST',
  exerciseVersion: '7',
  type: 'technique',
  storageObjectKey: 'synthetic/revision7/technique.mp4',
  posterObjectKey: 'synthetic/revision7/poster.webp',
  checksum: `sha256:${'a'.repeat(64)}`,
  publicationStatus: 'published',
  reviewStatus: 'TRAINER_APPROVED',
  rightsConfirmed: true,
  title: 'Синтетическое тестовое видео',
}
const find = (item: ExerciseVideoMetadata) => findTechniqueVideo([item], 'EX_TEST', '7')

describe('versioned exercise technique media', () => {
  it('has no fabricated production files or exercise bindings', () => {
    expect(exerciseVideoLibrary).toEqual([])
  })
  it('requires exact exercise and version, with no name or variant matching', () => {
    expect(find(approved)).toBe(approved)
    expect(findTechniqueVideo([approved], 'EX_OTHER', '7')).toBeUndefined()
    expect(findTechniqueVideo([approved], 'EX_TEST', '8')).toBeUndefined()
    expect(findTechniqueVideo([approved], 'EX_TEST', '')).toBeUndefined()
    expect(findTechniqueVideo([approved], 'EX_TEST', LEGACY_EXERCISE_REVISION)).toBeUndefined()
  })
  it.each(['imported', 'validated', 'trainer_approved'] as const)(
    'does not play unpublished %s media',
    (publicationStatus) => {
      expect(find({ ...approved, publicationStatus })).toBeUndefined()
    },
  )
  it.each(['REJECTED', 'NEEDS_REVIEW'] as const)(
    'never activates %s media even if marked published',
    (reviewStatus) => {
      expect(find({ ...approved, reviewStatus })).toBeUndefined()
    },
  )
  it('requires rights, poster, object key and an actual SHA256-shaped checksum', () => {
    for (const patch of [
      { rightsConfirmed: false },
      { posterObjectKey: '' },
      { storageObjectKey: '' },
      { checksum: '' },
      { checksum: 'sha256:unknown' },
    ]) {
      expect(find({ ...approved, ...patch })).toBeUndefined()
    }
  })
  it('does not confuse setup or detailed footage with technique', () => {
    expect(find({ ...approved, type: 'setup' })).toBeUndefined()
    expect(find({ ...approved, type: 'detailed' })).toBeUndefined()
  })
  it('rejects duplicate media identifiers', () => {
    expect(
      findTechniqueVideo([approved, { ...approved, exerciseId: 'EX_OTHER' }], 'EX_TEST', '7'),
    ).toBeUndefined()
  })
  it('accepts HTTPS signed URLs and denies unsafe protocols and embedded credentials', () => {
    const good = {
      url: 'https://media.example.invalid/clip.mp4?signature=synthetic',
      posterUrl: 'https://media.example.invalid/poster.webp',
      mimeType: 'video/mp4' as const,
    }
    expect(validateResolvedVideo(good)).toBe(true)
    for (const url of [
      'javascript:alert(1)',
      'data:video/mp4;base64,AAAA',
      'http://media.example.invalid/clip.mp4',
      '/clip.mp4',
      'https://user:password@media.example.invalid/clip.mp4',
      'https://media.example.invalid/clip.mp4#fragment',
    ]) {
      expect(validateResolvedVideo({ ...good, url })).toBe(false)
      expect(validateResolvedVideo({ ...good, posterUrl: url })).toBe(false)
    }
  })
})
