"""Owner-approved preparation overlay. Never mutates the registered source."""

from copy import deepcopy
import json

from .import_preview import ROOT
from .review.pilot import seal_bundle, structural_errors, validate_bundle
from .xlsx_source import SourceError, canonical, digest

DECISION = ROOT / 'docs/smart-trainer/decisions/EX_000135-six-programs-v1.json'


def deadbug_projection(original):
    validate_bundle(original)
    decision = json.loads(DECISION.read_text())
    pid = original['program_id']
    if pid not in decision['programs']:
        raise SourceError('Dead Bug correction is limited to the six approved programs')
    if (original['source_sha256'] != decision['source_sha256'] or
            original['program_version'] != decision['source_program_version'] or
            'methodical_corrections' in original):
        raise SourceError('Correction requires the original, exact registered revision')
    result = deepcopy(original)
    payload = result['units'][result['program_key']]['payload']
    changed = []
    for phase in payload['phases']:
        target = decision['phases'][phase['phase_id']]
        for session in phase['sessions']:
            for slot in session['slots']:
                if slot['exercise_id'] != decision['exercise_id']:
                    continue
                if (slot['slot_id'] != decision['programs'][pid][phase['phase_id']] or
                        slot['exercise_version'] != decision['exercise_version'] or
                        slot['sets'] != target['sets'] or slot['rep_min'] is not None or
                        slot['rep_max'] is not None or slot['distance_meters'] is not None or
                        slot['time_seconds'] != target['original_time_seconds']):
                    raise SourceError('Original Dead Bug prescription differs from the approved scope')
                before = deepcopy(slot)
                slot.update(rep_min=target['reps_per_side'], rep_max=target['reps_per_side'], time_seconds=None)
                changed.append({'slot_id': slot['slot_id'], 'phase_id': phase['phase_id'],
                                'original': before, 'prepared': deepcopy(slot), 'counting_basis': 'PER_SIDE'})
    if (len(changed) != 3 or {c['slot_id'] for c in changed} != set(decision['programs'][pid].values())):
        raise SourceError('Correction must cover exactly the three approved phase slots')
    result['parent_source_bundle_hash'] = original['bundle_hash']
    result['methodical_corrections'] = [{'decision': decision, 'decision_hash': digest(canonical(decision)),
                                        'changes': changed, 'source_edited': False}]
    result['original_structural_diagnostics'] = {
        'validation': original['structural_validation'], 'issues': original['structural_issues']}
    result['scope']['timed_slots'] -= len(changed)
    errors = structural_errors(result)
    result['structural_validation'] = 'failed' if errors else 'passed'
    result['structural_issues'] = errors
    seal_bundle(result)
    validate_bundle(result)
    return result
