# Recorded training progress

These pure helpers use saved `WorkoutSessionResult` entries and the current
onboarding goal/weekly target. They do not use mock progress or nutrition data.

- A 4/8/12-week period means that many local Monday–Sunday calendar weeks,
  including the ongoing week, through the injected `now`. Future/invalid dates
  are excluded. Date arithmetic uses calendar days rather than fixed 24h offsets
  so week boundaries work across daylight-saving transitions.
- Weekly counts count completed session records, including sessions with no set
  details. The optional target is **the current profile target**, not evidence of
  an historical schedule. No confirmed missed-workout claim is generated.
- The load chart selects one exercise. Its value is the arithmetic average of
  all recorded set weights for that exercise/session, with min/max in the tooltip.
  Each set must have a distinct positive integer number, positive integer reps
  and a finite nonnegative weight. Missing weights/reps leave a null gap, never a
  zero or interpolated value. Explicit zero weight remains a valid record.
- Two complete records at distinct timestamps are needed to draw a load trend.
  A brief change metric also requires first/last records with the same set
  numbers, set count and repetitions, and all weight changes in the same direction.
  It describes recorded weight, not strength, 1RM or a progression decision.
  Assisted exercises may record assistance; increasing that number is not claimed
  to be improved performance. Training Engine decisions are unchanged.
- Insights describe recorded full weeks after the first known training week;
  both that initial partial week and the ongoing week are excluded. Coach insights
  reuse the existing Coach Memory functions on chronologically sorted records
  from the selected period. No insights are invented when records are insufficient.
- WeightEntry is a future observed weigh-in boundary only. The view model's weight
  history is unavailable/empty; there is no collection, fake chart or persistence.

Dates and labels use the browser's local calendar. Unit tests inject `now` and
construct local dates so results are deterministic in different time zones.
