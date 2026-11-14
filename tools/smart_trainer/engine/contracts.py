"""Technical readiness is independent of content declarations and auxiliary card reviews."""

from datetime import datetime
import math
import re

from ..review.pilot import structural_errors, validate_bundle
from ..review.workflow import ReviewError
from ..xlsx_source import canonical, digest

CAPABILITIES = ('versioned_assignment', 'finite_phase_cycle', 'immutable_session_results',
                'skip_without_completion_credit', 'rest_day_and_postponement', 'contextual_replacement',
                'personal_revision_and_undo', 'two_comparable_exposures')
DOSE_FIELDS = ('sets', 'minimum_sets', 'rep_min', 'rep_max', 'rir_min', 'rir_max', 'rest_min_seconds', 'rest_max_seconds')


def fail(code, message):
    raise ReviewError(code, message)


def receipt(value, scope, decision):
    try:
        return (isinstance(value, dict) and value['decision'] == decision and
                value['source_sha256'] == scope['source_sha256'] and value['scope_hash'] == scope['bundle_hash'] and
                isinstance(value['reviewer'], str) and bool(value['reviewer'].strip()) and
                isinstance(value['evidence'], str) and bool(value['evidence'].strip()) and
                datetime.fromisoformat(value['timestamp']).tzinfo is not None)
    except (KeyError, ValueError, TypeError):
        return False


def exercise(scope, identity, version):
    unit = scope['units'].get(f'exercise:{identity}@{version}')
    if not unit:
        fail('exercise_outside_scope', 'Упражнение или его версия отсутствует в этом назначении.')
    return unit['payload']


def dose(slot):
    return {field: slot[field] for field in DOSE_FIELDS}


def validate_dose(value):
    if not isinstance(value, dict) or set(value) != set(DOSE_FIELDS):
        fail('unsupported_prescription', 'Нужно явное назначение REPS: подходы, диапазон, RIR и отдых.')
    for field in DOSE_FIELDS:
        if field.startswith('rir') and value[field] is None:
            continue
        if type(value[field]) is not int or value[field] < 0:
            fail('unsupported_prescription', 'Назначение содержит некорректное число.')
    if not 1 <= value['minimum_sets'] <= value['sets'] or not 1 <= value['rep_min'] <= value['rep_max']:
        fail('unsupported_prescription', 'Нарушены границы подходов или повторений.')
    for low, high in [('rir_min', 'rir_max'), ('rest_min_seconds', 'rest_max_seconds')]:
        if (value[low] is None) != (value[high] is None) or (value[low] is not None and value[low] > value[high]):
            fail('unsupported_prescription', 'Нарушены границы RIR или отдыха.')
    return value


def requirements(scope, contracts, identity, version):
    equipment = exercise(scope, identity, version)['equipment']
    if equipment['state'] == 'declared':
        kits = [[item['equipment_id'] for item in kit['all_of']] for kit in equipment['options']]
    else:
        overlay = contracts.get('equipment', {}).get(f'{identity}@{version}', {})
        if overlay.get('state') == 'explicit_none':
            return [[]]
        if overlay.get('state') != 'declared':
            fail('equipment_contract_unresolved', f'{identity}: оборудование неизвестно; это не пустой комплект.')
        kits = overlay.get('kits')
    known = {u['id'] for u in scope['units'].values() if u['kind'] == 'equipment'}
    if not isinstance(kits, list) or not kits or any(not isinstance(kit, list) or not kit or any(item not in known for item in kit) for kit in kits):
        fail('equipment_contract_unresolved', f'{identity}: требуется явный комплект оборудования.')
    return kits


def check_inventory(scope, contracts, identity, version, inventory):
    if not any(set(kit) <= set(inventory) for kit in requirements(scope, contracts, identity, version)):
        fail('equipment_unavailable', f'{identity}: доступный инвентарь не покрывает ни один полный комплект.')


def readiness(scope, declaration, contracts):
    validate_bundle(scope)
    blockers = []
    if not declaration:
        blockers.append('author_declaration_missing')
    if structural_errors(scope):
        blockers.append('structural_validation_failed')
    valid = (receipt(contracts, scope, 'technical_policy_confirmed') and isinstance(contracts.get('policy_version'), str) and bool(contracts['policy_version'].strip()) and
             all(isinstance(contracts.get(key), dict) for key in ('equipment', 'cycle', 'progression', 'alternatives')) and
             isinstance(contracts.get('personal_changes'), list) and all(isinstance(row, dict) for row in contracts['personal_changes']) and
             all(isinstance(row, dict) for row in contracts['alternatives'].values()) and
             all(isinstance(row, dict) for row in contracts['equipment'].values()) and
             isinstance(contracts['progression'].get('steps'), dict))
    if not valid:
        blockers.append('technical_policy_unconfirmed')
    safe = contracts if valid else {}
    cycle = safe.get('cycle', {})
    if cycle != {'week_advance': 'completed_microcycle', 'phase_transition': 'explicit_trainer',
                 'missed_session': 'resume_pending_with_rest_day'}:
        blockers.append('cycle_policy_unresolved')
    if safe.get('progression', {}).get('rule') != 'two_comparable_exposures':
        blockers.append('progression_policy_unresolved')
    for unit in scope['units'].values():
        if unit['kind'] != 'exercise':
            continue
        if unit['payload']['record']['measurement_unit'] != 'REPS':
            blockers.append('unsupported_measurement_unit:' + unit['id'])
        try:
            requirements(scope, safe, unit['id'], unit['version'])
        except (ReviewError, TypeError, AttributeError):
            blockers.append('equipment_contract_unresolved:' + unit['id'])
    if scope['units'][scope['program_key']]['payload']['equipment']['state'] != 'declared':
        blockers.append('program_equipment_contract_unresolved')
    engine = safe.get('engine_report', {})
    if not (receipt(engine, scope, 'engine_supported') and isinstance(engine.get('capabilities'), dict) and re.fullmatch(r'[a-f0-9]{40}', str(engine.get('engine_commit', ''))) and
            all(engine.get('capabilities', {}).get(k) is True for k in CAPABILITIES)):
        blockers.append('engine_support_not_verified')
    if not receipt(safe.get('rights_receipt'), scope, 'publication_rights_confirmed'):
        blockers.append('publication_rights_not_confirmed')
    return {'blockers': sorted(set(blockers)), 'isolated_assignment_ready': not blockers,
            'scope_hash': scope['bundle_hash'], 'contract_hash': digest(canonical(contracts)),
            'individual_approvals_required': False, 'live_activation_enabled': False, 'publication_performed': False}


def alternative(scope, contracts, slot, alternative_id, inventory, permanent=False):
    unit = next((u for u in scope['units'].values() if u['kind'] == 'alternative' and u['id'] == alternative_id), None)
    if not unit:
        fail('alternative_disabled', 'Эта замена не включена в подготовленный scope. Произвольная подстановка недоступна.')
    row = unit['payload']['record']
    record = scope['units'][scope['program_key']]['payload']['record']
    if ((row['source_exercise_id'], row['source_version']) != (slot['exercise_id'], slot['exercise_version']) or
            not any(link['source_id'] == slot['slot_id'] and link['source_version'] == scope['program_version'] for link in unit['payload']['slot_links']) or
            (row['goal'], row['program_role'], row['level']) != (record['primary_goal'], slot['priority'], record['level']) or
            row['equivalence'] not in ('A', 'B', 'C') or row['load_history_policy'] != 'RECALIBRATE'):
        fail('alternative_context_mismatch', 'Направление, версия или контекст замены не подходит этой позиции.')
    if row['equivalence'] == 'C' and not permanent:
        fail('program_change_required', 'C требует пересмотра программы; простой замены сегодня нет.')
    target = exercise(scope, row['target_exercise_id'], row['target_version'])
    levels = {'BEGINNER': 0, 'INTERMEDIATE': 1, 'ADVANCED': 2}
    if (target['record']['minimum_level'] not in levels or
            levels[target['record']['minimum_level']] > levels[record['level']] or
            not any(r['relation_type'] == 'LOCATION' and r['target_id'] == record['primary_location'] for r in target['relations'])):
        fail('alternative_context_mismatch', 'Уровень или среда целевого упражнения не соответствует назначению.')
    if target['record']['measurement_unit'] != 'REPS':
        fail('unsupported_prescription', 'Нет подготовленного logger для этой единицы. Повторы и секунды не конвертируются.')
    authorization = contracts.get('alternatives', {}).get(f'{alternative_id}:{slot["slot_id"]}', {})
    if authorization.get('context_reviewed') is not True or (row['equivalence'] == 'C' and authorization.get('program_change_reviewed') is not True):
        fail('alternative_not_prepared', 'Контекст и новое назначение замены ещё не подготовлены.')
    prescription = validate_dose(authorization.get('prescription'))
    check_inventory(scope, contracts, row['target_exercise_id'], row['target_version'], inventory)
    return {'exercise_id': row['target_exercise_id'], 'exercise_version': row['target_version'],
            'prescription': prescription, 'alternative_id': alternative_id, 'equivalence': row['equivalence'],
            'differences': row['differences'], 'equipment': target['equipment'],
            'setup': target['record']['setup'], 'execution_standard': target['record']['execution_standard']}


def finite_number(value, minimum=0):
    return type(value) in (int, float) and math.isfinite(value) and value >= minimum
