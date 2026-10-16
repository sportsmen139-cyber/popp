import { describe, expect, it } from 'vitest'

import {
  resolveDifficultyProgressionSignal,
} from './resolveDifficultyProgressionSignal'

describe(
  'resolveDifficultyProgressionSignal',
  () => {
    it('очень легко — разрешает рассмотреть повышение нагрузки', () => {
      const result =
        resolveDifficultyProgressionSignal(
          'very_easy',
        )

      expect(result).toBe(
        'increase_candidate',
      )
    })

    it('нормально — оставляет текущий курс', () => {
      const result =
        resolveDifficultyProgressionSignal(
          'normal',
        )

      expect(result).toBe(
        'keep_course',
      )
    })

    it('тяжело — запрещает повышение нагрузки', () => {
      const result =
        resolveDifficultyProgressionSignal(
          'hard',
        )

      expect(result).toBe(
        'no_increase',
      )
    })

    it('очень тяжело — предлагает рассмотреть снижение нагрузки', () => {
      const result =
        resolveDifficultyProgressionSignal(
          'very_hard',
        )

      expect(result).toBe(
        'reduce_candidate',
      )
    })

    it('не смог выполнить — требует снижения нагрузки', () => {
      const result =
        resolveDifficultyProgressionSignal(
          'failed',
        )

      expect(result).toBe(
        'reduce_required',
      )
    })
  },
)