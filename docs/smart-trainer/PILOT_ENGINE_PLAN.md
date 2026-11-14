# План будущей интеграции PRG_000002 v1

**Исторический план Stage 3.** Реализация изолированного Engine и новый процесс
с одним заявлением владельца описаны в [PILOT_ENGINE.md](PILOT_ENGINE.md).
Требование индивидуально утверждать все карточки ниже больше не является
основным процессом. Runtime production по-прежнему не подключён.

Это план отдельного engine этапа, не реализация. `client/src`, 45 legacy IDs,
Gym/3 resolver, рабочая прогрессия, Session/Coach/Nutrition/Progress и storage
не менялись. Пилот пока NEEDS_REVIEW; контент и release не активированы.

## 1. Текущая граница кода

`resolveProgram.ts` выбирает bundled baseProgram по environment/frequency/level.
`resolveTrainingPlan.ts` добавляет emphasis цели. `resolveNextWorkout.ts` использует
`completedWorkoutsCount % workoutTemplateIds.length`: это бесконечный A/B/C.
`OnboardingProfile` не хранит назначение program ID/version/release или начало цикла.

`WorkoutSetResult` содержит только setNumber/reps/weightKg. В истории нет RIR,
program/phase/week/source revision/device context и стабильного session instance ID.
App дополняет историю и отдельно увеличивает счётчик. Старый EX ID — ключ ввода
подходов, а не slot-instance ID. Нельзя реконструировать новую программу из этих данных.

`resolveExerciseProgression.ts` использует слабейший подход и старые 8/12 пороги.
В частности `decideProgression.ts` предлагает увеличение уже при 12 повторах:
это не верх 15 у EX_000112/000044 и не верх 20 у EX_000121. Source требует два
сопоставимых выполнения, все рабочие подходы, качество и допустимый RIR.

`applySessionAdaptation.ts` может убрать accessory, сократить secondary sets и
добавить 30 секунд отдыха. Пилот имеет собственные minimum/skip/rest/adaptation
ограничения. Применять прежнюю эвристику к нему без policy review нельзя.

## 2. Release и выбор из onboarding

Будущий выбор пилота доступен только при проверенном versioned release и отдельной
активации: GYM / BEGINNER / GENERAL_FITNESS / 3 дня, подтверждённом инвентаре и
предпосылках. Provisional Gym «оборудование не собрано» недостаточен для подтверждения
всех source kits. Пока gate не выполнен, существующий Gym/3 работает прежним путём.

Нужна явная opt-in assignment запись: assignment ID, release ID/hash, program ID/v1,
source SHA256, start context, timezone, approved policy version. Старый programme
не заменяется автоматически; две assignment версии не используют общий счётчик.

## 3. Состояние конечного восьминедельного цикла

Отдельный `ProgramAssignmentState`: programWeek 1–8, phaseId, pending sourceSessionId,
cycle day cursor 1/3/5, completed session instances, hold/resume, завершённость цикла.
Programme week хранится явно и восстанавливается из событий назначения/выполнения,
а не вычисляется по общему legacy completedWorkoutsCount или только разнице дат.

Диапазоны фазы берутся из pinned source: 1–2, 3–5, 6–8. Порядок — соответствующие
три source sessions каждой фазы, не одно вечное A/B/C. В неделю 8 после последней
подтверждённой сессии состояние становится cycle_completed; повтор — новое назначение.

**До реализации требуется решение тренера:** правило продвижения programWeek при
переносах — календарная неделя с carry либо завершённый микроцикл. Источник не
задаёт полный вычислимый алгоритм. Typed policy должна разрешать `advance_week`;
при её отсутствии Engine возвращает policy_unresolved, не выбирает молча эвристику.
При phase_hold номинальная дата не повышает дозу; переход выполняется через явное
approved transition/resume event с пересчётом срока.

## 4. День и пропуск

Дни 1/3/5 — дни source календарного цикла, не индексы массива. Следующая сессия
определяется pending cursor; пропуск не равен выполнению и не сдвигает счётчик
как completion. Продолжение с незавершённого дня, интервалы отдыха и регулярные
пропуски должны исполнять согласованную missed-session policy. Не удваивать sets,
не сжимать три занятия в два дня, не перепрыгивать фазу ради календаря.

Нужны distinct events completed / postponed / missed / cancelled / phase_held /
phase_resumed и явная причина. Отсутствующее событие нельзя автоматически считать
подтверждённым пропуском для Coach insights.

## 5. Prescriptions и RIR

Typed slot prescription сохраняет source slot/session/EX revisions, sets, range,
rest, minimum sets, skip/cut priority и исходный/effective вариант. Для всех основных
45 slots modality REPS. RIR 3–4 там, где задан, EX_000135 — без source RIR.
В result добавить optional RIR/unknown state, качество выполнения и scoped device/
assistance/lever metadata. Missing RIR не становится нулём или разрешением повысить кг.

Существующие legacy types/десериализация остаются совместимыми. Новые источники
результатов лучше добавить через отдельный pilot result envelope, до утверждённой
миграции не переписывать старую историю.

## 6. История, идентичность и идемпотентность

Новый sessionInstanceId, assignmentId, program/release/source version, programWeek,
phase/sourceSession, start/completed timestamps и timezone; для каждого slot —
instance ID + sourceSlotId + exact EX revision + original/effective prescription.
Set result принадлежит instance, а не общему exerciseId. Snapshot фактически
выполненной дозы сохраняется, не пересчитывается по текущему каталогу.

Сохранение completion/cursor/counter для нового assignment должно быть атомарным
и идемпотентным, с durable draft/outbox по ранее принятой архитектуре. Это отдельная
реализация, не подключение Supabase в Stage 3. Legacy append order/история/счётчик
остаются прежними; старым тренировкам не назначаются выдуманные program versions.
Source EX IDs не становятся aliases 45 legacy IDs без отдельного решения.

## 7. Load Engine пилота

Нужен program-specific strategy с утверждёнными параметрами: upper range каждого
slot, все рабочие подходы, два сопоставимых exposures, допустимый effort/technique,
минимальный доступный шаг, правила возврата. `ComparableExposure` должен различать
EX revision, modality, устройство/настройки, помощь, стороны, дозу и effective plan.

Точные критерии сопоставимости/качества и поведение при missing RIR утверждает
тренер. Не заменять их текущим scalar difficulty или общей суммой кг. Переход с
одного подхода к двум не получает автоматический статус сопоставимого результата.
Не увеличивать одновременно sets и resistance. Для bodyweight сначала качество/
рычаг; переход к иному EX — отдельно согласованное назначение с новой калибровкой.
1RM/strength score и переносы кг между устройствами не нужны.

## 8. Усталость и Session Engine

Source fatigue policy описывает два неуспешных сопоставимых выполнения, пересмотр
восстановления и последней переносимой дозы. Она не равна одному плохому check-in.
Нужны approved typed actions и причины, которые не нарушают minimum/skip/rest и
phase constraints. При боли/плохом самочувствии не подбирать случайные замены.

Не переносить на пилот `shortenWorkout <=20/<=30` и `sets-1` автоматически.
Если нет согласованной безопасной адаптации под доступное время/оборудование,
выдать unavailable/reschedule/trainer-review state. Предложение изменения и его
принятие пользователем сохраняются отдельно от original prescription.

## 9. Альтернативы и неподдерживаемые назначения

Включены только 18 explicit ALT и 90 slot links. Для B проверяются goal/role/level,
оборудование, dose и условия; C — program modification с пересчётом и отдельным
решением тренера. Никаких обратных/транзитивных рёбер или автоматического переноса кг.

ALT_000476 ведёт от REPS EX_000135 к SECONDS EX_000136. До утверждённого typed
назначения и seconds result logger такой переход возвращает unsupported_prescription.
Нельзя сделать seconds из числа reps или положить секунды в поле repetitions.
Timed/distance support union в ExerciseTarget недостаточен для runtime поддержки.

Любой неподдерживаемый mode, unit, phase transition, device/assistance context
останавливает выполнение нового назначения с объяснением. Не использовать старый
resolver как скрытый fallback в середине назначенного source cycle.

## 10. Порядок будущего внедрения и regression gates

1. Тренер разрешает вопросы, источник/typed overlay получает новую review scope,
   journal подтверждает все зависимости. Source SHA/revision и фактические решения pinned.
2. Реализуются source content adapter + explicit equipment mapping, finite assignment
   state и event reducer с tests: все 8 недель, hold/resume, переносы, конец цикла.
3. Добавляются instance history/RIR, durable completion и per-program progression
   с отдельными fixtures для 6–10, 8–12, 10–15, 12–20, bodyweight и missing data.
4. Реализуется ограниченный Session policy adapter, затем contextual alternatives.
   Неподдерживаемые назначения остаются заблокированы, а не конвертируются молча.
5. На точном engine commit проходят contract tests/две версии source/старые 319
   client tests/fixture истории. Новый release получает проверяемый capability report.
6. Права и отдельная activation decision подтверждаются владельцем; только затем
   изолированная интеграция пилота и отдельное решение о rollout. Main merge/deploy
   не входят в этот план как уже разрешённое действие.

Механизм gates подготовлен в `tools/smart_trainer/review/release.py`: текущий Engine
не заявлен поддерживающим пилот. Никаких настоящих Engine/rights attestations или
activation decisions в Stage 3 не создано.
