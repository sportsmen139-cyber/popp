# Starting maintenance energy, beta 1

`estimateStartingEnergy({ nutritionProfile, trainingActivity })` returns a
starting **maintenance hypothesis**. It does not return a measured TDEE, a goal
adjustment or an intake prescription. There is no UI or calibration in this layer.

The function calls the existing `estimateRmr`, then builds `ActivityProfile`
from the same inputs. An externally supplied RMR is deliberately not accepted:
it could belong to a different profile or bypass its safety decision.
Successful results contain a `kcalPerDay` range, method/version, the RMR and
activity inputs, net activity components, completeness, reason codes and
limitations for future explanations. There is no purportedly precise midpoint.
Diagnostic components now expose the assumed net MET ranges, TEF fractions and
unrounded energy calculation. The unrounded values are for model auditing, not
an increase in claimed display precision. `reference/` is a separate comparison
layer; the production estimator never imports it or changes its output from it.

## Activity signals and overlap

- Steps and work describe much of the same daily movement. Work duration,
  load carrying and non-stepping physical tasks are unknown.
- Strength session count and strength minutes describe the same training.
  Count is used to check consistency, never as an additional energy term.
- Cardio can already be included in steps. Strength, cardio and other activity
  minutes can describe the same session. None is assumed fully independent.
- `ActivityProfile.level` remains an unchanged qualitative summary and is not
  used by the energy calculation. Raw signals drive the calculation continuously.
- The optional `dataAvailability` metadata preserves whether cardio/other
  minutes were supplied, even though the existing numeric defaults remain zero.
  This is an additive change for older ActivityProfile consumers.

Daily activity uses the **maximum**, at each bound, of the steps proxy and the
work proxy. Physical work is never added a second time on top of steps. Work can
still act as a floor when steps are absent or incompletely reflect the work.

For structured activity, the lower bound is the maximum of the three category
costs; the upper is their sum. When combining daily and structured activity, the
lower is again their maximum and the upper their sum. Thus the lower scenario
allows full inclusion, while the upper allows separate activity. The sum at the
upper bound is a scenario, **not a claim that the inputs are independent**.
Without overlap coverage or timestamps it cannot be resolved more precisely.

## Explicit model assumptions

All coefficients live in `startingEnergyModel.ts`. They are product beta
heuristics, not a validated physiological energy equation or probability model.
Activity costs are **net of rest**, to avoid adding resting energy twice.

| Component | Beta assumption |
| --- | --- |
| Walking | 0.0003–0.0005 kcal/kg/step, a rough proxy for unknown stride and pace |
| Seated / mixed work | 1–2 / 1.5–3.5 kcal/kg/day for daily non-rest activity |
| Standing / physical work | 2–4.5 / 3–6 kcal/kg/day; work hours and duties are unknown |
| Strength / cardio / other | Net MET proxies of 2–4 / 3–7 / 1–4 kcal/kg/hour |
| Weekly durations | Divided by 60 and 7 to obtain a daily net cost |
| RMR uncertainty allowance | Illustrative ±10%; no claim that actual RMR lies within it |
| Thermic effect of food | 8–12% of total maintenance, without diet composition data |

For each scenario, maintenance = `(RMR scenario + net activity) / (1 - TEF)`.
The final lower bound rounds down to 50 kcal and the upper rounds up to 50 kcal.
The result is a **scenario interval, not a statistical confidence interval**.
Unusual physiology, intensity, diet or work can put actual expenditure outside it.

### Assumption review

The confidence descriptions below concern evidence for an assumption. They are
not the runtime `confidence` field, which remains `low` for all starting outputs.

| Assumption | Source/type | Evidence / individual confidence | Why used | Future replacement |
| --- | --- | --- | --- | --- |
| Mifflin–St Jeor RMR | Published population RMR equation [1] | Established population estimate; limited individual accuracy | Initial resting-energy hypothesis | Measured RMR where available; personal maintenance calibration reduces reliance on it |
| RMR ±10% | Product uncertainty buffer | Heuristic; no coverage probability | Expose uncertainty instead of an exact RMR-based target | Empirically evaluated uncertainty / observed energy calibration |
| TEF near 10% | Research-backed population approximation [2] | Low for an individual without diet composition | Include digestion costs in an initial energy balance | Personal energy calibration; diet context if later justified |
| TEF bounds 8–12% | Product scenario bounds around that approximation | Heuristic; not an individual confidence interval | Avoid choosing one supposedly known TEF | Evaluate sensitivity / observed maintenance calibration |
| Step cost 0.0003–0.0005 kcal/kg/step | Beta product heuristic, not a directly validated coefficient | Low; stride, terrain, pace and device coverage unknown | Continuous activity signal rather than summary PAL multiplication | Personal trend / explicit activity data and evaluated integrations |
| Work proxies 1–6 kcal/kg/day | Beta product heuristic | Low; no duration or load data | Fallback daily movement floor when steps are absent/incomplete | Work duration/context and personal trend |
| Net MET conversion | Research-backed activity-cost approximation: gross MET minus rest [3] | Approximate; standard resting MET differs between people | Express exercise above rest rather than add resting energy twice | Measured/contextual activity and personal calibration |
| Strength/cardio/other net MET defaults | Beta product heuristic ranges, not activity identification | Low; minutes do not identify intensity | Model plausible scenarios without assigning an exact exercise intensity | Reported modality/intensity or observed calibration |
| Maximum/sum overlap envelope | Product modelling heuristic | Low; neither endpoint is observed | Avoid unconditional addition of overlapping signals | Explicit coverage, timestamps and overlap context |
| 50 kcal outward rounding | Presentation/product rounding | N/A; not an accuracy guarantee | Avoid presenting a formula-derived single-kcal target | May remain as a presentation rule |
| DRI 2023 EER | Published external population EER regressions [4, 5] | Reference only; individual PAL unknown | Independent regression/sanity comparison | Keep as reference; never replace observed maintenance automatically |
| 25% reference warning | Engineering guardrail | Not a medical or physiological error limit | Detect large regression against all explicit PAL scenarios | Revisit using reviewed benchmark coverage, without fitting production to it |

TEF depends on protein/carbohydrate/fat composition and other context; no macro
composition is known or inferred here. The implementation solves
`E = RMR + activity + f * E` algebraically, giving `E = (RMR + activity)/(1-f)`.
There is no iterative/circular dependency and no separate addition of `10% RMR`.
Tests check this energy-balance identity before rounding, where a mistaken
multiply-by-`(1+f)` implementation cannot be hidden by 50 kcal rounding.

The structured MET defaults are exposed as
`components.assumedStructuredNetMet` with source
`beta_defaults_not_reported_intensity`. They are not selected from step count,
work category or a claim about the user's actual exercise. Step/work double
counting is prevented by the maximum rule. Unknown exercise/category overlap
still remains a risk: the upper scenario can overestimate repeated activity,
while the conservative lower scenario can underestimate separate activity.
The interval does not prove that the actual expenditure is contained in it.

## Completeness and safety

`StartingActivityDataCompleteness` measures coverage of the supplied activity
fields, not energy accuracy or future calibration confidence:

- **low**: no steps, even if work/training is supplied;
- **medium**: steps supplied but optional activity fields missing or signals
  need review (session/time mismatch, or low steps with physical work);
- **high**: steps, work and all activity durations supplied with no such issues.

Explicit zero durations are valid reports of no activity. Missing durations are
not treated as evidence of no activity: they default to zero for compatibility,
remain marked missing, and no unreported sessions/minutes are invented. The
interval is conditional on reported inputs; it cannot bound unknown activity.
Low steps with physical work may reflect non-stepping duties, not erroneous data.
All starting estimates keep `confidence: 'low'`, even with high completeness and
in tracking mode. Actual intake and expenditure have not been observed here.

The safety policy remains conservative and unchanged. Calculability of a raw
population RMR formula does not imply permission to generate an automated plan
or fat-loss recommendation. The existing RMR layer withholds estimates for all
safety-review profiles, so this layer propagates that decision with its reasons
and without calorie values. A future clinician-supervised flow could distinguish
these permissions explicitly; it is not introduced implicitly in this beta.

Invalid RMR prerequisites, non-finite/negative activity, unknown work categories,
fractional session counts, unsupported duration totals exceeding a week, and
non-finite/nonpositive energy results return `invalid_input` with field codes.
Inputs are not silently clamped. No existing safety tests or rules are weakened.

## DRI 2023 reference comparison (development/domain only)

`reference/estimateDri2023AdultEer.ts` implements the adult 19+ equations in
Dietary Reference Intakes for Energy (2023), DOI `10.17226/26818`, as tabulated
by Health Canada [4, 5]. Coefficients are isolated in `reference/dri2023Model.ts`;
none is used in the production beta model. This is the 2023 model, **not** the
older 2005 equation with a PA multiplier and height in metres.

For explicit sex/calculation category and explicit PAL scenario:

`EER kcal/day = intercept + ageCoefficient * ageYears + heightCoefficient * heightCm + weightCoefficient * weightKg`.

| Category | PAL scenario | Intercept | Age (years) | Height (cm) | Weight (kg) |
| --- | --- | ---: | ---: | ---: | ---: |
| Male | inactive | 753.07 | -10.83 | 6.50 | 14.10 |
| Male | low_active | 581.47 | -10.83 | 8.30 | 14.94 |
| Male | active | 1004.82 | -10.83 | 6.52 | 15.91 |
| Male | very_active | -517.88 | -10.83 | 15.61 | 19.11 |
| Female | inactive | 584.90 | -7.01 | 5.72 | 11.71 |
| Female | low_active | 575.77 | -7.01 | 6.60 | 12.14 |
| Female | active | 710.25 | -7.01 | 6.54 | 12.34 |
| Female | very_active | 511.83 | -7.01 | 9.07 | 12.56 |

Source-verification status: the primary Health Canada and National Academies
sites returned a network-proxy 403 in this environment during implementation.
The citations and coefficient table are provided for review, but **live
verification against the primary table remains pending**. Arithmetic examples
and regression tests passing do not constitute that external source check or
scientific validation. Exact domains were saved in the environment draft for
review; a draft save does not apply networking or publish the environment.

PAL is mandatory in the mathematical reference function. `validateStartingEnergy`
accepts an explicit `palScenarios` array, computes each requested scenario and
returns `EnergyEstimateValidation`: production result, references, absolute and
percentage differences, eligibility and warnings. Empty scenario lists produce
`no_pal_scenarios`, never an inferred PAL. Fixtures choose multiple scenarios
explicitly; there is no hidden step-to-PAL or ActivityProfile.level-to-PAL mapping.
The envelope of scenario outputs is not a statistical confidence interval.

The midpoint of the production range exists **only in comparison diagnostics**;
it is not a production recommendation. Differences use the reference estimate as
the denominator: `100 * abs(midpoint - reference) / reference`. A
`large_reference_discrepancy` warning is emitted only if every supplied valid
scenario differs by **more than 25%**. Equality to 25% does not trigger it.
This is an engineering regression guardrail, not proof of acceptable individual
accuracy. No warning does not mean either model is correct.

Separate `production_range_below_reference_scenarios` and
`production_range_above_reference_scenarios` warnings expose complete separation
of the ranges even when midpoint differences are below 25%. Missing/unsupported
reference inputs, unavailable production results and safety review have their own
warnings. No warning changes production energy, confidence or automation gates.

### Deterministic validation personas

Scenario choices below are benchmark hypotheses, not measured PAL labels. All
male personas use age 30, height 175 cm, weight 75 kg; the female persona uses age
30, height 165 cm, weight 60 kg. Optional other activity is explicitly zero.

| Persona | Activity | Explicit DRI scenarios | Beta range kcal/day | DRI scenario envelope kcal/day | Midpoint below nearest scenario |
| --- | --- | --- | ---: | ---: | ---: |
| Sedentary male | Seated, 3000 steps, no training | inactive / low_active | 1700–2300 | 2623–2830 | 23.8% |
| Moderate-step female | Seated, 7500 steps, no training | inactive / low_active | 1400–1950 | 2021–2183 | 17.1% |
| Regular lifter | Mixed work, 8000 steps, 3 strength sessions / 180 min | low_active / active | 1850–2650 | 2830–3014 | 20.5% |
| High-step user | Seated, 14000 steps, 4 strength sessions / 240 min, 120 min cardio | low_active / active / very_active | 2000–3100 | 2830–3322 | 9.9% |
| Physical worker | Physical job, 12000 steps, 4 strength sessions / 240 min | active / very_active | 1950–2850 | 3014–3322 | 20.4% |
| Missing steps | Mixed work, steps unknown, 3 strength sessions / 180 min | inactive / low_active / active | 1750–2600 | 2623–3014 | 17.1% |

Five of six production ranges are entirely below the selected reference outputs.
All six midpoints are below their closest scenario, despite not crossing the
25% guardrail. **This is a finding to investigate, not a successful accuracy
validation.** Investigate daily movement/work floors, scenario suitability and
conservative overlap assumptions before building an automatic nutrition plan.
Do not silently tune production coefficients to these six fixtures.

### Mathematical estimate versus eligibility

The reference function is mathematical and does not grant permissions. An adult
with safety flags may have mathematical reference outputs in a dev comparison,
but production remains safety-blocked, no differences are computed without a
production result, and both automation gates remain false. Pregnancy/lactation
adjustments are not implemented, so those reference values are not applicable
clinical estimates. There are no adult-reference extrapolations below age 19.

`EnergyEstimateValidation.eligibility` separately reports
`automaticNutritionPlanAllowed` and `automaticFatLossAllowed`: current gates
require a valid production result and no safety review; fat loss also requires
the existing `automaticFatLossAllowed` rule. These are input/safety gates only,
not a newly implemented nutrition-plan generator. Reference warnings cannot
grant or revoke them. Age 18 can pass the existing production safety rules while
the 19+ reference remains unavailable. Invalid production activity blocks the
gates even when a mathematical reference can be calculated.

### Sources

1. Mifflin MD et al. (1990), A new predictive equation for resting energy
   expenditure in healthy individuals. DOI:
   [10.1093/ajcn/51.2.241](https://doi.org/10.1093/ajcn/51.2.241).
2. Westerterp KR (2004), Diet induced thermogenesis. DOI:
   [10.1186/1743-7075-1-5](https://doi.org/10.1186/1743-7075-1-5).
   Supports the population concept; does not validate our specific 8–12% bounds.
3. [Compendium of Physical Activities](https://pacompendium.com/), MET methodology.
   This is not a source claiming our broad default categories have known personal
   intensity or validating the exact beta MET ranges chosen here.
4. National Academies of Sciences, Engineering, and Medicine (2023),
   [Dietary Reference Intakes for Energy](https://nap.nationalacademies.org/catalog/26818/dietary-reference-intakes-for-energy),
   DOI: `10.17226/26818`, adult EER equations.
5. Health Canada,
   [Dietary reference intakes: Reference values for energy](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-energy.html),
   adult 19+ EER equations, sex/category and PAL-specific rows.

## Next boundary

Before a goal-adjustment stage, review the beta coefficients and collect explicit
activity intensity, step coverage and overlap context. Later real-data calibration
should replace this starting hypothesis, with its own confidence and explanations.
Goal deficits/surpluses, macros, logging, wearables and calibration are not
implemented by this change.
