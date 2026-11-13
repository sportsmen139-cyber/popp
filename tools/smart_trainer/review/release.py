"""Offline release gates only. This module cannot deploy or enable runtime content."""

from datetime import datetime
import re

from ..xlsx_source import canonical, digest
from .pilot import structural_errors, validate_bundle
from .workflow import review_state

REQUIRED_CAPABILITIES = (
    'versioned_program_assignment', 'finite_eight_week_cycle', 'phase_hold_and_resume',
    'source_cycle_day_order', 'rir_capture_and_comparability', 'two_exposure_progression',
    'device_load_recalibration', 'source_fatigue_missed_session_rules', 'source_adaptation_limits',
    'immutable_versioned_history', 'contextual_alternatives_b_c', 'typed_alternative_unit_changes',
)


def _valid_receipt(receipt, bundle, decision):
    if not isinstance(receipt, dict):
        return False
    try:
        stamp = datetime.fromisoformat(receipt['timestamp'])
        return (receipt['decision'] == decision and receipt['source_sha256'] == bundle['source_sha256'] and
                receipt['bundle_hash'] == bundle['bundle_hash'] and bool(receipt['reviewer'].strip()) and
                bool(receipt['evidence'].strip()) and stamp.tzinfo is not None)
    except (KeyError, TypeError, ValueError, AttributeError):
        return False


def prepare_candidate(bundle, events, *, release_version, engine_report=None, rights_receipt=None):
    validate_bundle(bundle)
    if not isinstance(release_version, str) or not re.fullmatch(r'[1-9][0-9]*\.[0-9]+\.[0-9]+', release_version):
        raise ValueError('Release version must be explicit semver, separately from program version')
    state = review_state(bundle, events)
    blockers = []
    if bundle['structural_validation'] != 'passed' or structural_errors(bundle):
        blockers.append('structural_validation_failed')
    if not state['program_approved']:
        blockers.append('program_not_approved')
    if state['approved'] != state['total']:
        blockers.append('mandatory_dependencies_not_approved')
    if any(q['code'] == 'EQUIPMENT_REQUIREMENTS_UNKNOWN' for q in bundle['review_questions']):
        blockers.append('equipment_contract_unresolved')
    if any(q['code'] == 'ALTERNATIVE_UNIT_CHANGE' for q in bundle['review_questions']):
        blockers.append('typed_alternative_prescription_unresolved')
    engine_valid = _valid_receipt(engine_report, bundle, 'engine_supported')
    if engine_valid:
        capabilities = engine_report.get('capabilities', {})
        engine_valid = (isinstance(capabilities, dict) and
                        all(capabilities.get(capability) is True for capability in REQUIRED_CAPABILITIES) and
                        re.fullmatch(r'[a-f0-9]{40}', str(engine_report.get('engine_commit', ''))) is not None)
    if not engine_valid:
        blockers.append('engine_support_not_verified')
    if not _valid_receipt(rights_receipt, bundle, 'publication_rights_confirmed'):
        blockers.append('publication_rights_not_confirmed')
    descriptor = {
        'release_version': release_version, 'source_sha256': bundle['source_sha256'],
        'bundle_hash': bundle['bundle_hash'], 'program_id': bundle['program_id'],
        'program_version': bundle['program_version'], 'review_head': state['head'],
        'record_hashes': {key: unit['record_hash'] for key, unit in sorted(bundle['units'].items())},
        'engine_report': engine_report, 'rights_receipt': rights_receipt,
    }
    return {'state': 'candidate', 'runtime_enabled': False, 'publication_performed': False,
            'descriptor': descriptor, 'candidate_hash': digest(canonical(descriptor)),
            'blockers': blockers, 'requires_separate_activation': True}


def authorize_offline_release(bundle, events, candidate, activation):
    """Record a separate owner activation decision; still no live publication."""
    descriptor = candidate['descriptor']
    current = prepare_candidate(bundle, events, release_version=descriptor['release_version'],
                                engine_report=descriptor['engine_report'], rights_receipt=descriptor['rights_receipt'])
    if current != candidate or current['blockers']:
        raise ValueError('Candidate is stale or required release gates are blocked')
    if not _valid_receipt(activation, bundle, 'activate_release') or activation.get('candidate_hash') != candidate['candidate_hash']:
        raise ValueError('Separate activation decision must bind this exact candidate hash')
    return {'format_version': 1, 'state': 'activation_authorized_offline',
            'release_version': descriptor['release_version'], 'descriptor': descriptor,
            'activation': activation, 'units': bundle['units'],
            'runtime_enabled': False, 'publication_performed': False,
            'release_hash': digest(canonical({'candidate': candidate['candidate_hash'], 'activation': activation}))}
