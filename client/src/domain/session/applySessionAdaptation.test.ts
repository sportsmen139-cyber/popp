import {
  describe,
  expect,
  it,
} from 'vitest'

import type {
  ResolvedWorkout,
} from '../../types/program'

import {
  applySessionAdaptation,
} from './applySessionAdaptation'

const workout: ResolvedWorkout = {
  templateId: 'test-workout',
  title: 'Test Workout',
  estimatedMinutes: 60,

  exercises: [
    {
      slotId: 'primary-slot',
      exerciseId: 'barbell-squat',
      role: 'primary',
      sets: 3,

      target: {
        type: 'reps',
        mode: 'range',
        min: 8,
        max: 12,
      },

      restSeconds: {
        min: 90,
        max: 120,
      },
    },

    {
      slotId: 'secondary-slot',
      exerciseId: 'romanian-deadlift',
      role: 'secondary',
      sets: 3,

      target: {
        type: 'reps',
        mode: 'range',
        min: 8,
        max: 12,
      },

      restSeconds: {
        min: 90,
        max: 120,
      },
    },

    {
      slotId: 'accessory-slot',
      exerciseId:
        'dumbbell-biceps-curl',
      role: 'accessory',
      sets: 3,

      target: {
        type: 'reps',
        mode: 'range',
        min: 10,
        max: 15,
      },

      restSeconds: {
        min: 60,
        max: 90,
      },
    },
  ],
}

describe(
  'applySessionAdaptation',
  () => {
    it('оставляет тренировку без изменений при keep_as_planned', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'keep_as_planned',
            ],
            reason: 'Всё хорошо',
            requiresConfirmation:
              false,
          },
        )

      expect(result).toBe(workout)
    })

    it('уменьшает объём accessory-упражнения на один подход', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'reduce_accessory_volume',
            ],
            reason:
              'Снижаем дополнительный объём',
            requiresConfirmation:
              true,
          },
        )

      expect(
        result.exercises[2].sets,
      ).toBe(2)
    })

    it('не уменьшает количество подходов основного упражнения', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'reduce_accessory_volume',
            ],
            reason:
              'Снижаем дополнительный объём',
            requiresConfirmation:
              true,
          },
        )

      expect(
        result.exercises[0].sets,
      ).toBe(3)
    })

    it('увеличивает отдых на 30 секунд', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'increase_rest',
            ],
            reason:
              'Добавляем отдых',
            requiresConfirmation:
              true,
          },
        )

      expect(
        result.exercises[0]
          .restSeconds,
      ).toEqual({
        min: 120,
        max: 150,
      })

      expect(
        result.exercises[2]
          .restSeconds,
      ).toEqual({
        min: 90,
        max: 120,
      })
    })

    it('сокращает тренировку до 45 минут, сохраняя упражнения', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'shorten_session',
              'reduce_accessory_volume',
            ],
            reason:
              'Сегодня меньше времени',
            requiresConfirmation:
              true,
            targetMinutes: 45,
          },
        )

      expect(
        result.estimatedMinutes,
      ).toBe(45)

      expect(
        result.exercises,
      ).toHaveLength(3)

      expect(
        result.exercises[2].sets,
      ).toBe(2)
    })

    it('при 30 минутах убирает accessory и сокращает secondary', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'shorten_session',
              'reduce_accessory_volume',
            ],
            reason:
              'Сегодня есть только 30 минут',
            requiresConfirmation:
              true,
            targetMinutes: 30,
          },
        )

      expect(
        result.estimatedMinutes,
      ).toBe(30)

      expect(
        result.exercises,
      ).toHaveLength(2)

      expect(
        result.exercises.some(
          (exercise) =>
            exercise.role ===
            'accessory',
        ),
      ).toBe(false)

      const secondary =
        result.exercises.find(
          (exercise) =>
            exercise.role ===
            'secondary',
        )

      expect(
        secondary?.sets,
      ).toBe(2)
    })

    it('при 20 минутах оставляет только основные упражнения', () => {
      const result =
        applySessionAdaptation(
          workout,
          {
            actions: [
              'shorten_session',
              'reduce_accessory_volume',
            ],
            reason:
              'Сегодня есть только 20 минут',
            requiresConfirmation:
              true,
            targetMinutes: 20,
          },
        )

      expect(
        result.estimatedMinutes,
      ).toBe(20)

      expect(
        result.exercises,
      ).toHaveLength(1)

      expect(
        result.exercises[0].role,
      ).toBe('primary')

      expect(
        result.exercises[0].sets,
      ).toBe(3)
    })
  },
)