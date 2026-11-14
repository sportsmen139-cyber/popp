"""Explicit synthetic content/receipts for engine tests. Never used by the Mac launcher."""

from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path

from tools.smart_trainer.catalog import preview_catalog
from tools.smart_trainer.engine.contracts import CAPABILITIES, dose
from tools.smart_trainer.engine.runtime import impact
from tools.smart_trainer.engine.scope import execution_scope
from tools.smart_trainer.review.pilot import extract_pilot
from tools.smart_trainer.xlsx_source import canonical, digest
from .test_review import synthetic_pilot

NOW = datetime(2026, 11, 14, 9, tzinfo=timezone.utc)


def engine_fixture(alternatives=False, upper=12):
    _, tables, support = synthetic_pilot()
    base_ex, base_bio = deepcopy(tables['exercises'][0]), deepcopy(tables['biomechanics'][0])
    tables['exercises'], tables['biomechanics'] = [], []
    relations = deepcopy(tables['relations'])
    for number in range(1, 5):
        identity = f'EX_{number:06}'
        ex, bio = deepcopy(base_ex), deepcopy(base_bio)
        ex.update(exercise_id=identity, name_ru=f'Synthetic engine exercise {number}',
                  load_type='BODYWEIGHT' if number == 2 else 'MACHINE', assistance_mode='NONE',
                  measurement_unit='SECONDS' if number == 4 else 'REPS')
        bio['exercise_id'] = identity
        tables['exercises'].append(ex); tables['biomechanics'].append(bio)
        if number > 1:
            for original in relations:
                if original['source_id'] == 'EX_000001':
                    row = deepcopy(original)
                    row.update(link_id=f'LNK_{len(tables["relations"]) + 1:06}', source_id=identity)
                    tables['relations'].append(row)
    tables['programs'][0].update(duration_weeks=8, days_per_week=3, name_ru='Synthetic isolated eight-week cycle')
    base_session, base_slot = deepcopy(tables['sessions'][0]), deepcopy(tables['slots'][0])
    tables['sessions'], tables['slots'], tables['alternatives'] = [], [], []
    for phase, start, end in [(1, 1, 2), (2, 3, 5), (3, 6, 8)]:
        for day in (1, 3, 5):
            sid = f'SES_{len(tables["sessions"]) + 1:06}'
            session = deepcopy(base_session)
            session.update(session_id=sid, phase_id=f'PHASE_0{phase}', phase_name=f'Synthetic phase {phase}',
                           phase_week_start=start, phase_week_end=end, cycle_day=day, session_name=f'Synthetic day {day}')
            tables['sessions'].append(session)
            for number in (1, 2):
                slot = deepcopy(base_slot)
                slot.update(slot_id=f'SLOT_{len(tables["slots"]) + 1:06}', session_id=sid,
                            exercise_id=f'EX_{number:06}', order_index=number, sets=1 if phase == 1 else 2,
                            rep_min=8 if phase > 1 else 10, rep_max=upper,
                            rir_min=3, rir_max=4, priority='PRIMARY' if number == 1 else 'ACCESSORY',
                            can_skip='NO' if number == 1 else 'YES')
                tables['slots'].append(slot)
    for number, category in [(1, 'A'), (2, 'B'), (3, 'C'), (4, 'B')]:
        aid = f'ALT_{number:06}'
        tables['alternatives'].append({'alternative_id': aid, 'source_exercise_id': 'EX_000001', 'source_version': 1,
            'target_exercise_id': 'EX_000004' if number == 4 else 'EX_000003', 'target_version': 1,
            'equivalence': category, 'goal': 'GENERAL_FITNESS', 'program_role': 'PRIMARY', 'level': 'BEGINNER',
            'load_history_policy': 'RECALIBRATE', 'differences': 'Synthetic target device and setup differ',
            'review_status': 'NEEDS_REVIEW', '_source': {'sheet': '15_Замены', 'row': number + 4}})
        for slot in tables['slots']:
            if slot['exercise_id'] == 'EX_000001':
                tables['relations'].append({'link_id': f'LNK_{len(tables["relations"]) + 1:06}', 'relation_type': 'SLOT_ALTERNATIVE',
                    'source_id': slot['slot_id'], 'source_version': 1, 'target_id': aid, 'review_status': 'NEEDS_REVIEW',
                    '_source': {'sheet': '14_Связи', 'row': len(tables['relations']) + 5}})
    full = extract_pilot(preview_catalog(tables), support, 'f' * 64, 'PRG_000001')
    scope = execution_scope(full, ('ALT_000001', 'ALT_000002', 'ALT_000003') if alternatives else ())
    base = {'source_sha256': scope['source_sha256'], 'scope_hash': scope['bundle_hash'], 'reviewer': 'Synthetic contract owner',
            'timestamp': NOW.isoformat(), 'evidence': 'Synthetic tests only, not a real trainer attestation'}
    policy = {**base, 'decision': 'technical_policy_confirmed', 'policy_version': 'synthetic-policy-v1', 'equipment': {},
        'cycle': {'week_advance': 'completed_microcycle', 'phase_transition': 'explicit_trainer', 'missed_session': 'resume_pending_with_rest_day'},
        'progression': {'rule': 'two_comparable_exposures', 'steps': {'EX_000001@1|device-A': 2.5, 'EX_000003@1|device-B': 1}},
        'engine_report': {**base, 'decision': 'engine_supported', 'engine_commit': '1' * 40, 'capabilities': {k: True for k in CAPABILITIES}},
        'rights_receipt': {**base, 'decision': 'publication_rights_confirmed'}, 'alternatives': {}, 'personal_changes': []}
    for slot in tables['slots']:
        if slot['exercise_id'] == 'EX_000001':
            for aid in scope['scope']['alternatives']:
                policy['alternatives'][f'{aid}:{slot["slot_id"]}'] = {'context_reviewed': True, 'program_change_reviewed': aid == 'ALT_000003', 'prescription': dose(slot)}
    for identity, mode, alt in [('EX_000002', 'remove', None), ('EX_000001', 'replace', 'ALT_000001'), ('EX_000001', 'replace', 'ALT_000002'), ('EX_000001', 'replace', 'ALT_000003')]:
        report = impact(scope, identity, 1)
        policy['personal_changes'].append({'exercise_id': identity, 'exercise_version': 1, 'mode': mode, 'alternative_id': alt,
            'slot_ids': report['slot_ids'], 'impact_hash': digest(canonical(report)), 'impact_evidence': 'Synthetic approved impact assessment'})
    return full, scope, policy


if __name__ == '__main__':
    import sys
    folder = Path(sys.argv[1]); folder.mkdir(parents=True, exist_ok=True)
    full, scope, policy = engine_fixture(alternatives=True)
    (folder / 'synthetic-bundle.json').write_bytes(canonical(full))
    (folder / 'synthetic-contracts.json').write_bytes(canonical(policy))
    print(json.dumps({'bundle': str(folder / 'synthetic-bundle.json'), 'contracts': str(folder / 'synthetic-contracts.json')}))
