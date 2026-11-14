# Блокеры после аудита XLSX

Источник получен и прочитан; прежний SOURCE-01 закрыт. Факты и source SHA256:
[IMPORT_AUDIT.md](IMPORT_AUDIT.md). Код импорта готов для изолированного preview,
не для публикации контента или переноса пользовательской истории.

| ID | Что блокирует следующий этап | Нужное решение |
| --- | --- | --- |
| CONTENT-01 | Исходные статусы 200 неисключённых EX и 108 программ остаются NEEDS_REVIEW | По решению владельца — одно source-bound заявление о ранее выполненной содержательной проверке, отдельно от technical readiness; индивидуальные 177 approvals не требуются, REJECTED остаются исключёнными |
| UNIT-01 | 312 slots в 90 программах: seconds против REPS карточки | Согласовать modality/новую revision/исправление slots; source пока сохраняется дословно |
| EQUIPMENT-01 | У 34 EX нет явного required kit | Подтвердить equipment-free или указать комплект; unknown не превращать в [] |
| COVERAGE-01 | Home overview 98 против 104 membership IDs | Уточнить шесть IDs/условия Home и согласовать обзор с нормализованными связями |
| VOLUME-01 | Контекстный учёт не полностью выражен typed rules | Review 915 отличий fields/45 frequency; не считать source или модель автоматически ошибочной |
| MAPPING-01 | 28 неоднозначных, 5 иных вариантов, 6 отсутствующих соответствий из legacy | Уточнить хваты, machines, angles, support, laterality/load; никаких aliases/history merge по названию |
| ENGINE-01 | Нет phase/week scheduler и source progression/RIR/miss/fatigue/adaptation | Отдельный engine этап с regression; сохранить текущий Gym/3 |
| ENGINE-02 | 1 day, новые environments/goals/splits, timed/distance results | Явная реализация и типы; не менять частоту/units молча |
| VERSION-01 | История legacy не хранит source revisions; phase/slot версии наследуются от parent | Отдельная версия assignment/history; не угадывать старые revisions или units |
| RIGHTS-01 | Права на распространение полного контента не установлены | Подтверждение владельца/rightsholders до публикации XLSX или normalized content; пока всё полное ignored/local |
| VIDEO-01 | Нет 103 файлов, точных привязок и прав | Inventory/checksums/manifest → trainer review → host/access rules; URL не придумывать |
| FEEDBACK-01 | Нет подтверждённого username/канала | Указать публичную config, проверить native Telegram и доставку вручную; никаких bot secrets в frontend |
| BRAND-01 | Новое имя/рынки/реестры не утверждены | Отдельное решение владельца и rebranding commit |

Проверка на credential/email patterns в XML/комментариях не дала совпадений;
reviewer и reviewed_at пустые. Это ограниченная техническая проверка, не лицензия
на публикацию и не доказательство отсутствия любых персональных данных. XLSX,
comments/metadata и полные тексты остаются в private ignored output.

Ни Supabase, ни production deploy, ни merge main не являются частью этого этапа.
Текущая изолированная реализация и оставшиеся блокеры PRG_000002:
[PILOT_ENGINE.md](PILOT_ENGINE.md). Авторское заявление не устраняет технические
расхождения; активация требует отдельного решения. Старый Trainer Review вспомогательный.
