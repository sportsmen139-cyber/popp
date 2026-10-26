// Captured from commit 07b8dd9 BEFORE metadata migration. Static regression
// evidence; do not regenerate expectations from the live catalog/resolver.
export const gymTemplateBaselines = [
  {
    "templateId": "gym-fullbody-a",
    "title": "Full Body A",
    "estimatedMinutes": 60,
    "slots": [
      {
        "slotId": "a-squat",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "a-horizontal-push",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "a-vertical-pull",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "a-hinge",
        "role": "secondary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "a-arms",
        "role": "accessory",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      }
    ]
  },
  {
    "templateId": "gym-fullbody-b",
    "title": "Full Body B",
    "estimatedMinutes": 60,
    "slots": [
      {
        "slotId": "b-single-leg",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "b-horizontal-pull",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "b-horizontal-push",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "b-glutes",
        "role": "secondary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "b-core",
        "role": "accessory",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 30,
          "max": 60
        }
      }
    ]
  },
  {
    "templateId": "gym-fullbody-c",
    "title": "Full Body C",
    "estimatedMinutes": 60,
    "slots": [
      {
        "slotId": "c-hinge",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "c-horizontal-push",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "c-vertical-pull",
        "role": "primary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "c-squat",
        "role": "secondary",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      },
      {
        "slotId": "c-calves",
        "role": "accessory",
        "sets": 3,
        "target": {
          "type": "reps",
          "mode": "range",
          "min": 8,
          "max": 12
        },
        "restSeconds": {
          "min": 90,
          "max": 120
        }
      }
    ]
  }
] as const

export const gymChoiceBaselines = [
  {"level": "beginner", "emphasis": "balanced", "exerciseIds": [["leg-press", "chest-press-machine", "lat-pulldown", "hyperextension", "dumbbell-biceps-curl"], ["step-up", "seated-cable-row", "incline-chest-press-machine", "hip-extension-machine", "crunch"], ["hyperextension", "chest-press-machine", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "beginner", "emphasis": "glutes", "exerciseIds": [["leg-press", "chest-press-machine", "lat-pulldown", "hyperextension", "dumbbell-biceps-curl"], ["step-up", "seated-cable-row", "incline-chest-press-machine", "hip-extension-machine", "crunch"], ["hyperextension", "chest-press-machine", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "beginner", "emphasis": "pullups", "exerciseIds": [["leg-press", "chest-press-machine", "assisted-pull-up", "hyperextension", "dumbbell-biceps-curl"], ["step-up", "seated-cable-row", "incline-chest-press-machine", "hip-extension-machine", "crunch"], ["hyperextension", "chest-press-machine", "assisted-pull-up", "leg-press", "standing-calf-raise"]]},
  {"level": "intermediate", "emphasis": "balanced", "exerciseIds": [["barbell-squat", "barbell-bench-press", "lat-pulldown", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "intermediate", "emphasis": "glutes", "exerciseIds": [["leg-press", "barbell-bench-press", "lat-pulldown", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "intermediate", "emphasis": "pullups", "exerciseIds": [["barbell-squat", "barbell-bench-press", "pull-up", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "pull-up", "leg-press", "standing-calf-raise"]]},
  {"level": "advanced", "emphasis": "balanced", "exerciseIds": [["barbell-squat", "barbell-bench-press", "lat-pulldown", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "advanced", "emphasis": "glutes", "exerciseIds": [["leg-press", "barbell-bench-press", "lat-pulldown", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "close-grip-lat-pulldown", "leg-press", "standing-calf-raise"]]},
  {"level": "advanced", "emphasis": "pullups", "exerciseIds": [["barbell-squat", "barbell-bench-press", "pull-up", "romanian-deadlift", "dumbbell-biceps-curl"], ["bulgarian-split-squat", "seated-cable-row", "incline-bench-press", "hip-extension-machine", "crunch"], ["romanian-deadlift", "barbell-bench-press", "pull-up", "leg-press", "standing-calf-raise"]]},
] as const

export const existingExerciseIds = [
  "lat-pulldown",
  "pull-up",
  "assisted-pull-up",
  "dumbbell-lateral-raise",
  "seated-cable-row",
  "t-bar-row",
  "triceps-pushdown",
  "close-grip-lat-pulldown",
  "barbell-bench-press",
  "chest-press-machine",
  "push-up",
  "incline-bench-press",
  "incline-chest-press-machine",
  "elevated-push-up",
  "dumbbell-biceps-curl",
  "pec-deck",
  "romanian-deadlift",
  "bulgarian-split-squat",
  "single-leg-press",
  "step-up",
  "hyperextension",
  "hip-abduction-machine",
  "hip-extension-machine",
  "cable-hip-extension",
  "barbell-squat",
  "leg-press",
  "leg-extension",
  "forward-knee-lean",
  "standing-calf-raise",
  "goblet-squat",
  "calf-raise-machine",
  "hip-adduction-machine",
  "bodyweight-squat",
  "jump-squat",
  "glute-bridge",
  "ankle-flexion",
  "lunge",
  "dead-hang",
  "prone-trunk-raise",
  "prone-leg-raise",
  "prone-band-shoulder-extension",
  "crunch",
  "reverse-crunch",
  "side-plank",
  "run-in-place"
] as const
