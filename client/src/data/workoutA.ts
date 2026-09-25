export type WorkoutExercise = {
  id: string
  name: string
  sets: number
  repsMin: number
  repsMax: number
  restSeconds: number
}

export type Workout = {
  id: string
  title: string
  programName: string
  estimatedMinutes: number
  exercises: WorkoutExercise[]
}

export const workoutA: Workout = {
  id: 'workout-a',
  title: 'Тренировка A',
  programName: 'Программа для новичка',
  estimatedMinutes: 60,

  exercises: [
    {
      id: 'leg-press',
      name: 'Жим ногами',
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'chest-press',
      name: 'Жим от груди в тренажёре',
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'lat-pulldown',
      name: 'Тяга верхнего блока',
      sets: 3,
      repsMin: 8,
      repsMax: 12,
      restSeconds: 120,
    },
    {
      id: 'leg-curl',
      name: 'Сгибание ног',
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      restSeconds: 90,
    },
    {
      id: 'lateral-raise',
      name: 'Подъём рук в стороны',
      sets: 3,
      repsMin: 10,
      repsMax: 15,
      restSeconds: 90,
    },
    {
      id: 'plank',
      name: 'Планка',
      sets: 3,
      repsMin: 30,
      repsMax: 45,
      restSeconds: 60,
    },
  ],
}