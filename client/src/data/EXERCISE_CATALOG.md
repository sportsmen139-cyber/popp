# Existing exercise catalog: controlled metadata

This migration retains exactly 45 exercise IDs, names, levels, muscle labels,
technique and video fields. It does not add exercises, programs, primary/secondary
muscles, progression rules or session modalities. The existing 15 slots and
Gym/3 A→B→C order are unchanged. Static pre-migration regression fixtures were
captured from commit `07b8dd9`, independently of the migrated catalog.

## Equipment requirements

`EquipmentId` is a capability/configured equipment ID, never a translated label.
The 26 current IDs are:

```text
barbell, dumbbells, kettlebell, bench, adjustable_bench, rack,
pull_up_bar, resistance_band, stable_support, step_platform,
lat_pulldown_machine, assisted_pull_up_machine, cable_row_machine,
t_bar_row_station, cable_station, ankle_cuff,
chest_press_machine, incline_chest_press_machine, pec_deck_machine,
leg_press_machine, hyperextension_bench, hip_abduction_machine,
hip_extension_machine, leg_extension_machine, calf_raise_machine,
hip_adduction_machine
```

Every ID is used by at least one of the existing 45 entries, with display labels
in `equipmentCatalog.ts`. There is no generic `machine`, unused leg-curl machine
or dip-bars entry. A station ID means an appropriately configured station with
its normal handle; it does not imply that another incompatible machine exists.
`cable_station` includes upper/lower pulleys and a standard handle, while a cable
hip extension explicitly also requires `ankle_cuff`. `t_bar_row_station` means a
configured T-row setup, not an assumed bare barbell/landmine combination.

`exercise.equipment` is a discriminated union:

- `no_external_equipment`: explicit equipment-free/bodyweight requirement. It is
  not missing metadata and needs no fictitious `bodyweight` inventory item.
  Bodyweight loading can still require external equipment, e.g. a pull-up bar;
  such an exercise has `external` requirements.
- `external`: a nonempty `equipmentOptions` list. **OR** between options, **AND**
  between IDs within an option. Options themselves must be nonempty and contain
  controlled, distinct IDs.
- `needs_review`: unresolved requirements, excluded from automatic selection.

Examples from actual entries:

```ts
// RDL: either barbell or dumbbells, never the literal "штанга или гантели".
equipmentOptions: [['barbell'], ['dumbbells']]

// Incline press: either complete equipment setup is enough.
equipmentOptions: [
  ['barbell', 'adjustable_bench', 'rack'],
  ['dumbbells', 'adjustable_bench'],
]
```

The inclined bench alone is no longer sufficient. Standard barbell squat/bench
setups now require a rack. Flat barbell bench accepts a suitable flat or adjustable
bench explicitly; no implicit ID inheritance is performed. A stable support or
suitable bench is allowed for elevated push-up/BSS. A bench is **not** automatically
a rated step platform. Goblet squat retains its named kettlebell version rather
than silently adding another exercise variation.

The 16 former equipment literals are removed from matching and exercise
requirements: `блочный тренажёр`, `турник`, `гравитрон`, `гантели`, `Т-гриф`,
`кроссовер`, `штанга`, `скамья`, `тренажёр`, `опора`, `штанга или гантели`,
`тренажёр для жима ногами`, `платформа`, `скамья для гиперэкстензии`, `гиря`,
`резинка`. Russian display labels remain display content, not matching logic.

## Inventory, provisional Gym behavior and App path

Inventory is distinct from exercise requirements:

| State | Meaning | Selection policy |
| --- | --- | --- |
| `known`, items (including `[]`) | An actual supplied controlled inventory | Strict requirements matching; insufficient items never receive fallback |
| `not_collected` | Field absent, not an empty or unlimited inventory | Gym alone may use the explicit provisional policy; other environments verify only equipment-free requirements |
| `invalid` | Non-array, unknown IDs or duplicate IDs | Reject selection; never turn corruption into provisional access |

`createExerciseSelectionContext` is the explicit boundary. `undefined` becomes
`not_collected`, not a fake list of all equipment. For the existing Gym flow only,
it selects `provisional_gym`: reviewed Gym content can be proposed without claiming
its equipment is present. `resolveEquipmentEligibility` reports `unconfirmed_gym`
for those external requirements. `resolveCurrentWorkout` exposes the inventory
status and selection policy in `equipmentResolution`. The training home and
Workout Mode show a short notice that the plan is preliminary and equipment must
be checked. This preserves the existing Gym plan without silently calling it
inventory-verified. There is no newly invented inventory and no new confirmation
step or inventory-collection UI.

`verified_only` blocks external requirements when inventory is uncollected,
even if somebody sets the provisional policy outside Gym. Equipment-free exercises
can still match independently of inventory collection. Missing/empty external
metadata, review-pending requirements and invalid inventory are never bodyweight.

The actual data path is now:

`OnboardingProfile.availableEquipment → saved profile state in App → resolveCurrentWorkout → createExerciseSelectionContext → selector`.

App forwards real saved values; absence stays absent. Editing the profile clears
the cached old profile too, so an old inventory cannot leak into a new onboarding
result. The current onboarding still does not collect equipment: this remains a
documented gap for a separate task. Known inventory is checked for the current
workout; it is not a guarantee every future template has compatible candidates.

Old profiles **without** the field keep the provisional Gym behavior. A stored
array of old Russian labels is deliberately rejected, with an invalid-inventory
message, rather than guessing which specific machine a generic label meant.
Duplicate canonical IDs are also rejected rather than silently normalized.
Updating/collecting real equipment belongs to the future profile/inventory flow.

## Environments and movement metadata

Membership describes supported contexts, conditional on equipment, not active
program membership. Portable dumbbell/kettlebell/band and equipment-free entries
can support all three environments. Barbell bench, incline press and squat also
support a properly equipped home setup. Fixed machines/stations are currently
Gym-only supported content. This is a beta scope decision, not a claim that nobody
can own a machine at home.

Counts including review-pending entries: Gym 45, Home 27, Outdoor 24. Of these,
43/25/22 respectively have classified metadata. **No Home/Outdoor or 2/4-day
program was added or enabled.** Program membership is checked before resolving a
workout; passing the Gym program directly with a non-Gym context also fails.

Catalog movement IDs are separate from the legacy slot categories:

```text
squat, lunge, step_up, hinge, calf,
horizontal_push, horizontal_pull, vertical_pull,
hip_extension, hip_abduction, hip_adduction, knee_extension,
elbow_flexion, elbow_extension, shoulder_abduction,
shoulder_horizontal_adduction, shoulder_extension, trunk_extension,
anti_lateral_flexion, trunk_flexion, grip_isometric,
locomotion, power, conditioning
```

All 24 are used. Vertical push, knee flexion, anti-extension, anti-rotation and
carry are not invented to fill the audit gaps: they will be added with real future
content. Split-stance BSS is in the lunge family; step-up has its own ID. Leg press
is knee-dominant/squat. Bridge/prone leg raise are hip extension, not automatically
RDL equivalents. Hyperextension is tagged hip/trunk extension without claiming a
specific hip-versus-spine contribution from an empty technique description.

All 45 entries have explicit fields. `forward-knee-lean` and `ankle-flexion` retain
their IDs/levels/legacy rep targets, but both equipment and movement are
`needs_review` until the exact movement and requirements are defined. They have
potential environment memberships but cannot be selected automatically. This is
an explicit unresolved decision, not fabricated movement classification.

The selector enforces environment membership, level, reviewed metadata, supported
target type and equipment. It deliberately retains slot candidate order and
emphasis rules. It does not reinterpret legacy `glute`, `arms`, `core` or other
slot categories as the new catalog movement IDs or introduce new substitution
rules between different mechanics.

## Target semantics and historical identity

`supportedTargetTypes` documents existing reps/time uses in active templates and
the nine legacy workouts, including inherited targets of alternatives. All active
Gym slots retain reps 8–12, 3 sets and their exact rest periods. Dead hang and side
plank are time-based; run-in-place is time-based; existing interval variants retain
their time compatibility. No timer/distance logging or modality-specific load
progression has been implemented, and legacy workouts remain inactive.

Exercise IDs, names, difficulty, muscles and history schema are preserved. RDL
and incline press retain their generic existing identity while requirements
correctly represent alternative equipment setups. The user's recording convention
(e.g. total dumbbell load versus per hand) is not inferred or changed here;
variant-aware tracking/comparability remains separate future work. No progression
or Progress Screen calculation was changed.

## Shadowed / unused content after migration

| Exercise | Classification after migration |
| --- | --- |
| `reverse-crunch` | Valid, still shadowed by equipment-free `crunch`; order intentionally unchanged |
| `calf-raise-machine` | Valid, still shadowed by equipment-free standing calf raise |
| `hip-abduction-machine` | Valid; generic-machine ambiguity fixed. Selectable with its specific known machine when hip-extension equipment is absent; provisional/full-equipment selection still prefers hip extension |
| `pec-deck` | Valid but unused by current templates/legacy workouts; not obsolete, not deleted |

None of these four was found genuinely obsolete. Fixing order/rotation or deciding
whether different movement mechanics should share a slot is a later programming
policy task. Two ambiguous entries above remain metadata debt, not obsolete IDs.

## Verification and next boundary

Tests cover bodyweight versus missing metadata, single/AND/OR options, partial
options, multiple valid options, specific machine capabilities, environment
mismatch/shared membership, invalid/duplicate runtime IDs, the explicit unknown
policy, inactive Home/Outdoor programs, legacy targets and all 45 stable IDs.
The 27 static original Gym workouts are compared in full for both uncollected and
full known inventory: selected IDs, order, sets, targets, rest, titles and duration.

The controlled catalog is ready to accept a small reviewed expansion. Resolve the
two ambiguous entries before automatically using them. Keep inventory onboarding,
new programs, new movement modalities and Muscle Map as separate stages. Existing
technique/video content is still empty and must not be mistaken for completed
instructional content.
