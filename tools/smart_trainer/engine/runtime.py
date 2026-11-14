"""Deterministic event reducer for an isolated, versioned finite program assignment."""

from copy import deepcopy
from datetime import datetime
from zoneinfo import ZoneInfo

from ..xlsx_source import canonical, digest
from .contracts import alternative, check_inventory, dose, exercise, fail, finite_number, readiness


def program(scope):
    return scope['units'][scope['program_key']]['payload']


def phase_for(scope, week):
    return next(p for p in program(scope)['phases'] if all(s['record']['phase_week_start'] <= week <= s['record']['phase_week_end'] for s in p['sessions']))


def slots_for(scope, identity, version):
    return [s for p in program(scope)['phases'] for session in p['sessions'] for s in session['slots']
            if (s['exercise_id'], s['exercise_version']) == (identity, version)]


def impact(scope, identity, version):
    slots = slots_for(scope, identity, version)
    return {'source_exercise_id': identity, 'source_version': version,
            'slot_ids': sorted(s['slot_id'] for s in slots),
            'mandatory_slots': sorted(s['slot_id'] for s in slots if s['can_skip'] != 'YES' or s['priority'] == 'PRIMARY'),
            'nominal_weekly_sets_by_phase': {p['phase_id']: sum(s['sets'] for session in p['sessions'] for s in session['slots'] if s in slots) for p in program(scope)['phases']},
            'muscle_relations': deepcopy(exercise(scope, identity, version)['relations']),
            'volume_reassessment_required': True, 'original_template_changed': False}


def reason(data):
    if not isinstance(data.get('reason'), str) or not 1 <= len(data['reason'].strip()) <= 2000:
        fail('reason_required', 'Укажи причину изменения или пропуска.')


def fields(data, *extra):
    if set(data) != {'operation_id', 'action', 'assignment_id', *extra}:
        fail('invalid_command', 'Некорректный состав действия; назначение не изменено.')


def date(value):
    try:
        stamp = datetime.fromisoformat(value)
        if stamp.tzinfo is None:
            raise ValueError
        return stamp
    except (TypeError, ValueError):
        fail('invalid_time', 'Нужно время с явным часовым поясом.')


def rest_allowed(assignment, stamp):
    if assignment['last_training_at']:
        zone = ZoneInfo(assignment['timezone'])
        elapsed = (date(stamp).astimezone(zone).date() - date(assignment['last_training_at']).astimezone(zone).date()).days
        if elapsed < assignment['next_rest_days']:
            fail('rest_day_required', 'Между занятиями нужен день без силовой тренировки; на границе цикла сохраняется интервал дней 1/3/5 из семидневного плана. Подходы не удваиваются.')


def active_slot(assignment, slot_id):
    if not assignment['session']:
        fail('no_active_session', 'Сначала открой текущую тренировку.')
    slot = next((s for s in assignment['session']['slots'] if s['source_slot']['slot_id'] == slot_id), None)
    if not slot:
        fail('unknown_slot', 'Позиция отсутствует в текущем экземпляре тренировки.')
    return slot


def effective(scope, assignment, slot):
    change = assignment['personal_changes'].get(f'{slot["exercise_id"]}@{slot["exercise_version"]}')
    if change and change['action'] == 'remove':
        return None
    if change:
        return deepcopy(change['replacements'][slot['slot_id']])
    return {'exercise_id': slot['exercise_id'], 'exercise_version': slot['exercise_version'],
            'prescription': dose(slot), 'alternative_id': None}


def save_results(scope, assignment, data):
    slot = active_slot(assignment, data['slot_id'])
    if slot['skipped']:
        fail('slot_skipped', 'Отмени пропуск перед вводом результатов.')
    rows = data['sets']
    if not isinstance(rows, list) or len(rows) > slot['effective']['prescription']['sets']:
        fail('invalid_results', 'Число записей превышает назначенное число рабочих подходов.')
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'set_number', 'reps', 'resistance', 'rir', 'quality'}:
            fail('invalid_results', 'Logger принимает REPS, сопротивление, RIR и качество; секунды не являются повторами.')
        if type(row['set_number']) is not int or not 1 <= row['set_number'] <= slot['effective']['prescription']['sets'] or row['set_number'] in seen:
            fail('invalid_results', 'Неверный или повторный номер подхода.')
        seen.add(row['set_number'])
        if row['reps'] is not None and (type(row['reps']) is not int or not 0 <= row['reps'] <= 1000):
            fail('invalid_results', 'Повторения — целое число; пустое значение не равно нулю.')
        if row['resistance'] is not None and not finite_number(row['resistance']):
            fail('invalid_results', 'Некорректное сопротивление.')
        if row['rir'] is not None and (not finite_number(row['rir']) or row['rir'] > 10):
            fail('invalid_results', 'RIR должен быть известным числом 0–10 либо оставаться неизвестным.')
        if row['quality'] not in ('good', 'poor', 'unknown'):
            fail('invalid_results', 'Укажи качество выполнения или оставь его неизвестным.')
    if not isinstance(data['context'], str) or not 1 <= len(data['context'].strip()) <= 500 or type(data['calibrated']) is not bool:
        fail('calibration_context_required', 'Нужен контекст устройства, настроек, помощи/сторон и явный статус калибровки.')
    slot['sets'] = deepcopy(rows)
    slot['load_context'] = data['context']
    slot['calibrated'] = data['calibrated']


def personal_change(scope, assignment, data):
    reason(data)
    identity, version = data['exercise_id'], data['exercise_version']
    report = impact(scope, identity, version)
    if not report['slot_ids'] or data['mode'] not in ('remove', 'replace'):
        fail('invalid_personal_change', 'Изменение должно относиться к исходному упражнению программы.')
    authorization = next((a for a in assignment['policy']['personal_changes'] if
        (a.get('exercise_id'), a.get('exercise_version'), a.get('mode'), a.get('alternative_id')) ==
        (identity, version, data['mode'], data['alternative_id']) and a.get('slot_ids') == report['slot_ids'] and
        a.get('impact_hash') == digest(canonical(report)) and isinstance(a.get('impact_evidence'), str) and a['impact_evidence'].strip()), None)
    if data['mode'] == 'remove' and report['mandatory_slots']:
        fail('mandatory_structure_change', 'Упражнение выполняет обязательную задачу. Автоматическое удаление недоступно: нужен пересмотр структуры назначения.')
    if not authorization:
        fail('personal_change_not_prepared', 'Изменится объём или структура. Нужна согласованная корректировка с оценкой влияния, исходный шаблон сохранён.')
    replacements = {}
    if data['mode'] == 'replace':
        for slot in slots_for(scope, identity, version):
            replacements[slot['slot_id']] = alternative(scope, assignment['policy'], slot, data['alternative_id'], assignment['inventory'], permanent=True)
    key = f'{identity}@{version}'
    change = {'change_id': data['operation_id'], 'action': data['mode'],
        'original_exercise_id': identity, 'original_version': version, 'reason': data['reason'],
        'replacements': replacements, 'impact': report}
    candidate = deepcopy(assignment)
    candidate['personal_changes'][key] = change
    if any(not any(effective(scope, candidate, slot) for slot in session['slots']) for p in program(scope)['phases'] for session in p['sessions']):
        fail('empty_session', 'Изменение удалит все позиции одной из сессий. Нужен пересмотр структуры программы.')
    assignment['personal_changes'][key] = change
    assignment['personal_revision'] += 1


def apply(scope, state, data, stamp):
    """Pure transition. IDs and actual prescriptions are captured in immutable session snapshots."""
    state = deepcopy(state)
    action = data.get('action')
    assignment_id = data.get('assignment_id')
    if not isinstance(assignment_id, str) or not 8 <= len(assignment_id) <= 120:
        fail('invalid_assignment_id', 'Нужен отдельный идентификатор назначения.')
    if action == 'assign':
        fields(data, 'user_id', 'inventory', 'timezone', 'prerequisites_acknowledged', 'policy', 'declaration_hash')
        if readiness(scope, bool(data['declaration_hash']), data['policy'])['blockers']:
            fail('wrong_snapshot', 'История назначения привязана к другому scope или неподготовленной политике.')
        if assignment_id in state['assignments']:
            fail('assignment_exists', 'Назначение уже существует; история не сбрасывается.')
        if any(a['status'] != 'cycle_completed' for a in state['assignments'].values()):
            fail('active_assignment_exists', 'Текущее назначение ещё не завершено. Для него сохраняются отдельные идентичность и история.')
        if data['prerequisites_acknowledged'] is not True or not isinstance(data['user_id'], str) or not 1 <= len(data['user_id'].strip()) <= 120:
            fail('assignment_context_required', 'Нужны имя локального участника и подтверждение исходных предпосылок.')
        try:
            ZoneInfo(data['timezone'])
        except (ValueError, KeyError, TypeError):
            fail('invalid_timezone', 'Выбери корректный часовой пояс.')
        known = {u['id'] for u in scope['units'].values() if u['kind'] == 'equipment'}
        if not isinstance(data['inventory'], list) or any(not isinstance(i, str) or i not in known for i in data['inventory']):
            fail('invalid_inventory', 'Инвентарь должен содержать точные ID оборудования.')
        for identity in scope['scope']['core_exercises']:
            unit = next(u for u in scope['units'].values() if u['kind'] == 'exercise' and u['id'] == identity)
            check_inventory(scope, data['policy'], identity, unit['version'], data['inventory'])
        kits = program(scope)['equipment']
        if kits['state'] != 'declared' or not any(all(i['equipment_id'] in data['inventory'] for i in k['all_of']) for k in kits['options']):
            fail('program_equipment_unavailable', 'Не подтверждён полный комплект программы.')
        state['assignments'][assignment_id] = {'id': assignment_id, 'user_id': data['user_id'],
            'source_sha256': scope['source_sha256'], 'scope_hash': scope['bundle_hash'], 'program_id': scope['program_id'],
            'program_version': scope['program_version'], 'policy': deepcopy(data['policy']),
            'contract_hash': digest(canonical(data['policy'])), 'declaration_hash': data['declaration_hash'],
            'created_at': stamp, 'timezone': data['timezone'], 'inventory': data['inventory'],
            'week': 1, 'day_index': 0, 'held': False, 'transition_pending': None, 'status': 'active',
            'last_training_at': None, 'next_rest_days': 2, 'scheduled_at': None, 'history': [], 'session': None,
            'personal_changes': {}, 'personal_revision': 1, 'completed_sessions': 0, 'schedule_events': []}
        state['active_assignment_id'] = assignment_id
        return state
    assignment = state['assignments'].get(assignment_id)
    if not assignment or assignment['status'] == 'cycle_completed':
        fail('assignment_unavailable', 'Нет активного назначения. Завершённый цикл не зацикливается автоматически.')
    if action == 'start_session':
        fields(data, 'session_id')
        if assignment['session'] or any(h['id'] == data['session_id'] for h in assignment['history']):
            fail('session_exists', 'Экземпляр тренировки уже существует.')
        if not isinstance(data['session_id'], str) or not 8 <= len(data['session_id']) <= 120:
            fail('invalid_session_id', 'Нужен уникальный экземпляр тренировки.')
        if assignment['transition_pending'] and not assignment['held']:
            fail('phase_transition_required', 'Переход к большей дозе требует явного решения тренера; можно сохранить переносимую фазу.')
        rest_allowed(assignment, stamp)
        if assignment['scheduled_at'] and date(stamp) < date(assignment['scheduled_at']):
            fail('session_postponed', 'Тренировка перенесена на более позднее время.')
        phase = phase_for(scope, assignment['week'])
        source = phase['sessions'][assignment['day_index']]
        entries = []
        for slot in source['slots']:
            current = effective(scope, assignment, slot)
            if current:
                entries.append({'slot_instance_id': f'{data["session_id"]}/{slot["slot_id"]}', 'source_slot': deepcopy(slot),
                    'baseline_effective': deepcopy(current), 'effective': current, 'sets': [], 'load_context': '',
                    'calibrated': False, 'skipped': False, 'reason': None, 'today_alternative': None})
        assignment['session'] = {'id': data['session_id'], 'assignment_id': assignment_id,
            'program_id': scope['program_id'], 'program_version': scope['program_version'], 'source_sha256': scope['source_sha256'],
            'scope_hash': scope['bundle_hash'], 'personal_revision': assignment['personal_revision'],
            'policy_version': assignment['policy']['policy_version'], 'week': assignment['week'], 'phase_id': phase['phase_id'],
            'source_session_id': source['record']['session_id'], 'cycle_day': source['record']['cycle_day'],
            'started_at': stamp, 'slots': entries, 'status': 'in_progress'}
        assignment['scheduled_at'] = None
    elif action == 'save_exercise':
        fields(data, 'slot_id', 'sets', 'context', 'calibrated')
        save_results(scope, assignment, data)
    elif action in ('skip_today', 'replace_today', 'undo_today'):
        fields(data, 'slot_id', 'reason', *(['alternative_id'] if action == 'replace_today' else []))
        reason(data)
        slot = active_slot(assignment, data['slot_id'])
        if action == 'skip_today':
            slot['skipped'], slot['reason'] = True, data['reason']
        elif action == 'replace_today':
            if slot['sets'] or slot['baseline_effective']['alternative_id']:
                fail('results_already_recorded', 'Нельзя переименовать фактические результаты или составить транзитивную замену.')
            slot['effective'] = alternative(scope, assignment['policy'], slot['source_slot'], data['alternative_id'], assignment['inventory'])
            slot.update(load_context='', calibrated=False, skipped=False, reason=data['reason'], today_alternative=data['alternative_id'])
        else:
            if slot['today_alternative'] and slot['sets']:
                fail('results_already_recorded', 'Результаты относятся к фактическому упражнению и не переносятся на исходное.')
            slot['skipped'], slot['reason'] = False, data['reason']
            if slot['today_alternative']:
                slot['effective'] = deepcopy(slot['baseline_effective'])
                slot.update(load_context='', calibrated=False, today_alternative=None)
    elif action in ('finish_session', 'stop_session'):
        fields(data, *(['reason'] if action == 'stop_session' else []))
        if not assignment['session']:
            fail('no_active_session', 'Нет тренировки для сохранения.')
        session = assignment['session']
        if action == 'stop_session':
            reason(data)
            session['status'], session['reason'] = 'stopped', data['reason']
        else:
            for slot in session['slots']:
                if slot['skipped']:
                    continue
                target = slot['effective']
                load = exercise(scope, target['exercise_id'], target['exercise_version'])['record']['load_type']
                if (len(slot['sets']) != target['prescription']['sets'] or any(r['reps'] is None for r in slot['sets']) or
                        (load != 'BODYWEIGHT' and (not slot['calibrated'] or any(r['resistance'] is None for r in slot['sets'])))):
                    fail('incomplete_results', 'Сохрани фактические подходы или явно пропусти позицию. Пустые поля не считаются выполнением.')
            mandatory_skipped = any(s['skipped'] and (s['source_slot']['can_skip'] != 'YES' or s['source_slot']['priority'] == 'PRIMARY') for s in session['slots'])
            session['status'] = 'partial' if mandatory_skipped else 'completed'
        session['ended_at'] = stamp
        session['performed_sets'] = sum(r['reps'] is not None for s in session['slots'] for r in s['sets'])
        if session['performed_sets']:
            assignment['last_training_at'] = stamp
            assignment['next_rest_days'] = 2
        assignment['history'].append(deepcopy(session))
        assignment['session'] = None
        if session['status'] == 'completed':
            assignment['completed_sessions'] += 1
            assignment['day_index'] += 1
            if assignment['day_index'] == len(phase_for(scope, assignment['week'])['sessions']):
                assignment['day_index'] = 0
                if assignment['held']:
                    pass  # Repeat the tolerated source microcycle, without increasing sets/resistance.
                elif assignment['week'] == program(scope)['record']['duration_weeks']:
                    assignment['status'] = 'cycle_completed'
                elif phase_for(scope, assignment['week'])['phase_id'] != phase_for(scope, assignment['week'] + 1)['phase_id']:
                    assignment['transition_pending'] = assignment['week'] + 1
                else:
                    assignment['week'] += 1
            if assignment['status'] != 'cycle_completed':
                next_day = phase_for(scope, assignment['week'])['sessions'][assignment['day_index']]['record']['cycle_day']
                assignment['next_rest_days'] = max(2, (next_day - session['cycle_day']) % program(scope)['record']['cycle_length_days'])
    elif action in ('postpone', 'missed'):
        fields(data, 'reason', 'scheduled_at')
        reason(data)
        if assignment['session']:
            fail('active_session', 'Сначала сохрани или останови открытую тренировку; её данные не удаляются при переносе.')
        if date(data['scheduled_at']) <= date(stamp):
            fail('invalid_time', 'Перенос должен указывать будущее время.')
        rest_allowed(assignment, data['scheduled_at'])
        assignment['scheduled_at'] = data['scheduled_at']
        assignment['schedule_events'].append({'action': action, 'reason': data['reason'], 'timestamp': stamp, 'scheduled_at': data['scheduled_at']})
    elif action in ('hold_phase', 'resume_phase'):
        fields(data, 'reason', 'reviewer', 'acknowledged')
        reason(data)
        if assignment['session'] or data['acknowledged'] is not True or not isinstance(data['reviewer'], str) or not data['reviewer'].strip():
            fail('phase_confirmation_required', 'Тренер явно подтверждает технику, освоение настроек и восстановление между тренировками.')
        if action == 'hold_phase':
            assignment['held'] = True
        else:
            if assignment['transition_pending']:
                if assignment['day_index'] != 0:
                    fail('phase_transition_required', 'Сначала заверши текущий переносимый микроцикл. Переход фазы не должен пропускать его оставшиеся сессии.')
                assignment['week'] = assignment['transition_pending']
                assignment['transition_pending'] = None
            assignment['held'] = False
    elif action == 'personal_change':
        fields(data, 'exercise_id', 'exercise_version', 'mode', 'alternative_id', 'reason')
        personal_change(scope, assignment, data)
        assignment['personal_changes'][f'{data["exercise_id"]}@{data["exercise_version"]}']['timestamp'] = stamp
    elif action == 'undo_personal_change':
        fields(data, 'exercise_id', 'exercise_version', 'reason')
        reason(data)
        key = f'{data["exercise_id"]}@{data["exercise_version"]}'
        if key not in assignment['personal_changes']:
            fail('no_personal_change', 'Для упражнения нет действующего персонального изменения.')
        del assignment['personal_changes'][key]
        assignment['personal_revision'] += 1
    else:
        fail('invalid_command', 'Неизвестное действие; назначение не изменено.')
    return state


def replay(scope, events):
    state = {'assignments': {}, 'active_assignment_id': None}
    for event in events:
        state = apply(scope, state, event['command'], event['timestamp'])
    return state


def dispatch(log, scope, contracts, declaration, command, expected_head, now=None):
    if command.get('action') == 'assign':
        if set(command) != {'operation_id', 'action', 'assignment_id', 'user_id', 'inventory', 'timezone', 'prerequisites_acknowledged'}:
            fail('invalid_command', 'Нельзя передавать технические разрешения из браузера.')
        ready = readiness(scope, declaration, contracts)
        if ready['blockers']:
            fail('technical_readiness_blocked', 'Исполнение заблокировано: ' + ', '.join(ready['blockers']))
        command = {**command, 'policy': deepcopy(contracts), 'declaration_hash': declaration['event_hash']}
    def validate(events, data, stamp):
        state = replay(scope, events)
        if data.get('action') != 'assign':
            assignment = state['assignments'].get(data.get('assignment_id'))
            if assignment and assignment['contract_hash'] != digest(canonical(contracts)):
                fail('assignment_policy_changed', 'Политика изменилась. История сохранена, продолжение требует отдельной версии назначения.')
        apply(scope, state, data, stamp)
    events = log.transact(command, expected_head, validate, now)
    return replay(scope, events)


def progression(scope, assignment, identity, version):
    attempts = [(h, s) for h in assignment['history'] for s in h['slots'] if
                (s['effective']['exercise_id'], s['effective']['exercise_version']) == (identity, version)]
    if len(attempts) < 2:
        return {'action': 'hold', 'reason': 'Нужны два сопоставимых фактических выполнения.'}
    pair = attempts[-2:]
    def signature(item):
        history, slot = item
        return (history['phase_id'], history['personal_revision'], slot['load_context'],
                slot['source_slot']['exercise_id'], slot['source_slot']['exercise_version'],
                slot['source_slot']['priority'], slot['source_slot']['order_index'],
                canonical(slot['effective']['prescription']), tuple(r['resistance'] for r in sorted(slot['sets'], key=lambda r: r['set_number'])))
    if signature(pair[0]) != signature(pair[1]):
        return {'action': 'recalibrate', 'reason': 'Изменились фаза, назначение, устройство/настройки, помощь, стороны или рабочее сопротивление.'}
    for history, slot in pair:
        rows, target = slot['sets'], slot['effective']['prescription']
        if history['status'] != 'completed' or slot['skipped'] or not slot['calibrated'] or len(rows) != target['sets'] or any(r['reps'] is None or r['quality'] != 'good' for r in rows):
            return {'action': 'hold', 'reason': 'Нужны все рабочие подходы с подтверждённой техникой и калибровкой.'}
    if all(all(r['reps'] < slot['effective']['prescription']['rep_min'] for r in slot['sets']) for _, slot in pair):
        return {'action': 'recovery_review', 'reason': 'Два сопоставимых выполнения ниже нижней границы. Остановить прогрессию и пересмотреть восстановление и дозу с тренером.'}
    if exercise(scope, identity, version)['record']['load_type'] == 'BODYWEIGHT':
        return {'action': 'technique_review', 'reason': 'Для массы тела сначала качество и рычаг; новый вариант выбирается отдельно.'}
    for _, slot in pair:
        target = slot['effective']['prescription']
        if target['rir_min'] is None or any(r['reps'] < target['rep_max'] or r['rir'] is None or not target['rir_min'] <= r['rir'] <= target['rir_max'] for r in slot['sets']):
            return {'action': 'hold', 'reason': 'Верх диапазона, заданный RIR и техника должны совпасть в обоих выполнениях. Неизвестный RIR не равен нулю.'}
    slot = pair[-1][1]
    weights = [r['resistance'] for r in slot['sets']]
    step = assignment['policy']['progression'].get('steps', {}).get(f'{identity}@{version}|{slot["load_context"]}')
    if not weights or weights[0] is None or len(set(weights)) != 1 or not finite_number(step, minimum=0.001):
        return {'action': 'hold', 'reason': 'Нужны одинаковое рабочее сопротивление и подтверждённый минимальный шаг конкретного устройства.'}
    return {'action': 'increase_suggestion', 'resistance': weights[0] + step,
            'rep_target': slot['effective']['prescription']['rep_min'], 'sets': slot['effective']['prescription']['sets'],
            'reason': 'Только предложение: минимальный шаг после двух сопоставимых выполнений. Число подходов не повышается.'}
