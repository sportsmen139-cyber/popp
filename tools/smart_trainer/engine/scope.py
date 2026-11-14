"""A new execution projection; the original review bundle and source remain immutable."""

from copy import deepcopy
import json

from ..import_preview import ROOT
from ..review.pilot import seal_bundle, structural_errors, validate_bundle
from ..xlsx_source import SourceError, canonical, digest

EXCLUDED = ('EX_000072', 'EX_000095', 'EX_000098')


def execution_scope(full, alternative_ids=()):
    validate_bundle(full)
    requested = set(alternative_ids)
    if not requested <= set(full['scope']['alternatives']):
        raise SourceError('Only explicit source slot alternatives may enter an execution scope')
    roots = {u['key'] for u in full['units'].values() if u['kind'] == 'exercise' and u['role'] == 'core'}
    for unit in full['units'].values():
        if unit['kind'] == 'alternative' and unit['id'] in requested:
            if not unit['payload']['slot_links']:
                raise SourceError('Alternative has no explicit slot context')
            roots.add(unit['key'])
    program = full['units'][full['program_key']]
    own = program['payload']
    # Include definitions required by the program itself, not definitions used only by disabled ALT.
    types = {'PROGRAM_TARGET': 'muscle', 'EQUIPMENT_REQUIRED': 'equipment',
             'EQUIPMENT_OPTIONAL': 'equipment', 'EVIDENCE': 'evidence'}
    for row in own['relations']:
        kind = types.get(row['relation_type'])
        if kind:
            roots.update(u['key'] for u in full['units'].values() if u['kind'] == kind and u['id'] == row['target_id'])
    for row in own['weekly_volume_source']:
        roots.update(u['key'] for u in full['units'].values() if u['kind'] == 'muscle' and u['id'] == row['target_id'])
    keep = set()

    def visit(key):
        if key in keep:
            return
        keep.add(key)
        for dependency in full['units'][key]['dependencies']:
            visit(dependency)
    for key in roots:
        visit(key)
    result = deepcopy(full)
    result['units'] = {key: deepcopy(full['units'][key]) for key in sorted(keep | {full['program_key']})}
    result['units'][full['program_key']]['dependencies'] = sorted(keep)
    result['parent_review_bundle_hash'] = full['bundle_hash']
    result['execution_profile'] = 'core_only' if not requested else 'explicit_alternatives'
    result['scope']['alternatives'] = sorted(requested)
    result['scope']['alternative_exercises'] = sorted(u['id'] for u in result['units'].values() if u['kind'] == 'exercise' and u['role'] != 'core')
    result['scope']['alternative_slot_links'] = sum(len(u['payload']['slot_links']) for u in result['units'].values() if u['kind'] == 'alternative')
    entities = {u['id'] for u in result['units'].values()}
    if entities.intersection(EXCLUDED):
        raise SourceError('Explicitly excluded exercise in execution scope')
    result['review_questions'] = [q for q in full['review_questions'] if q['entity'] in entities]
    seal_bundle(result)
    validate_bundle(result)
    if structural_errors(result):
        raise SourceError('Execution scope has invalid structure')
    return result


def source_overview(scope):
    receipt = json.loads((ROOT / 'docs/smart-trainer/audit/snapshot-receipt.json').read_text())
    if scope['source_sha256'] == receipt['source_sha256']:
        audit = json.loads((ROOT / 'docs/smart-trainer/audit/summary.json').read_text())
        counts = {'programs': audit['tables']['programs']['rows'], 'exercises': audit['tables']['exercises']['rows'],
                  'eligible_exercises': audit['tables']['exercises']['review_status']['NEEDS_REVIEW']}
        diagnostics = audit['diagnostic_counts']
        registered = True
    else:
        counts = {'programs': 1, 'exercises': len([u for u in scope['units'].values() if u['kind'] == 'exercise']),
                  'eligible_exercises': len([u for u in scope['units'].values() if u['kind'] == 'exercise'])}
        diagnostics, registered = {}, False
    value = {'source_sha256': scope['source_sha256'], 'counts': counts, 'excluded_exercises': list(EXCLUDED),
             'known_technical_diagnostics': diagnostics, 'registered_source': registered,
             'bounds': ['Ранее выполненная содержательная проверка авторской методики',
                        'Не утверждает технические зависимости и корректность машинных назначений',
                        'Не меняет NEEDS_REVIEW и не возвращает REJECTED в исполнение',
                        'Не подтверждает права распространения, совместимость Engine или активацию']}
    return {**value, 'overview_hash': digest(canonical(value))}
