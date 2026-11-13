from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.smart_trainer.catalog import normalize, preview_catalog
from tools.smart_trainer.review.pilot import extract_pilot, load_pilot, seal_bundle, validate_bundle
from tools.smart_trainer.review.release import REQUIRED_CAPABILITIES, authorize_offline_release, prepare_candidate
from tools.smart_trainer.review.workflow import EMPTY_HEAD, Journal, ReviewError, decide, review_state
from tools.smart_trainer.xlsx_source import SourceError, canonical, digest
from .fixtures import book

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)


def synthetic_pilot():
    workbook = book()
    tables = normalize(workbook)
    support = {
        'pattern': {'SQUAT': {'id': 'SQUAT', 'title': 'Synthetic pattern', 'review_status': 'NEEDS_REVIEW', '_source': {'sheet': '03_Паттерны', 'row': 4}}},
        'family': {'FAM_000001': {'id': 'FAM_000001', 'title': 'Synthetic family', 'primary_pattern': 'SQUAT', 'review_status': 'NEEDS_REVIEW', '_source': {'sheet': '04_Семейства', 'row': 4}}},
        'evidence': {},
    }
    return extract_pilot(preview_catalog(tables), support, workbook.sha256, 'PRG_000001', 1), tables, support


def decision(bundle, events, items, action='approve', **kwargs):
    data = {'items': items, 'action': action, 'reviewer': 'Synthetic reviewer only', 'comment': 'Synthetic test decision',
            'expected_head': review_state(bundle, events)['head'], 'source_sha256': bundle['source_sha256'],
            'bundle_hash': bundle['bundle_hash'], 'acknowledged': True, 'now': NOW}
    data.update(kwargs)
    return data


def approve_all(bundle):
    events = []
    while review_state(bundle, events)['approved'] < len(bundle['units']):
        state = review_state(bundle, events)
        ready = [key for key, unit in bundle['units'].items() if state['units'][key]['status'] != 'approved' and all(state['units'][dep]['status'] == 'approved' for dep in unit['dependencies'])]
        if not ready:
            raise AssertionError('No dependency progress')
        # Explicit synthetic actions in dependency order, never a production auto-approval helper.
        events = decide(bundle, events, **decision(bundle, events, ready))
    return events


def receipts(bundle):
    base = {'source_sha256': bundle['source_sha256'], 'bundle_hash': bundle['bundle_hash'],
            'reviewer': 'Synthetic release owner', 'timestamp': NOW.isoformat(), 'evidence': 'Synthetic test evidence, not a real attestation'}
    engine = {**base, 'decision': 'engine_supported', 'engine_commit': '1' * 40, 'capabilities': {k: True for k in REQUIRED_CAPABILITIES}}
    rights = {**base, 'decision': 'publication_rights_confirmed'}
    return engine, rights


class PilotExtractionTests(unittest.TestCase):
    def test_exact_scope_and_source_statuses_are_unchanged(self):
        bundle, tables, _ = synthetic_pilot()
        self.assertEqual(bundle['scope']['core_exercises'], ['EX_000001'])
        self.assertEqual(bundle['scope']['slots'], 1)
        self.assertEqual(bundle['structural_validation'], 'passed')
        self.assertTrue(all(r['review_status'] == 'NEEDS_REVIEW' for u in bundle['units'].values() for r in u['covers']))
        self.assertEqual(tables['exercises'][0]['review_status'], 'NEEDS_REVIEW')

    def test_no_transitive_or_unrelated_alternatives_are_included(self):
        _, tables, support = synthetic_pilot()
        for n in (2, 3):
            exercise = deepcopy(tables['exercises'][0])
            exercise.update(exercise_id=f'EX_{n:06}', name_ru=f'Synthetic exercise {n}')
            tables['exercises'].append(exercise)
            bio = deepcopy(tables['biomechanics'][0])
            bio['exercise_id'] = exercise['exercise_id']
            tables['biomechanics'].append(bio)
        for n in (1, 2):
            tables['alternatives'].append({'alternative_id': f'ALT_{n:06}', 'source_exercise_id': f'EX_{n:06}',
                'source_version': 1, 'target_exercise_id': f'EX_{n + 1:06}', 'target_version': 1,
                'equivalence': 'B', 'review_status': 'NEEDS_REVIEW', '_source': {'sheet': '15_Замены', 'row': n + 4}})
        tables['relations'].append({'link_id': 'LNK_999999', 'relation_type': 'SLOT_ALTERNATIVE', 'source_id': 'SLOT_000001',
            'source_version': 1, 'target_id': 'ALT_000001', 'review_status': 'NEEDS_REVIEW', '_source': {'sheet': '14_Связи', 'row': 99}})
        b = extract_pilot(preview_catalog(tables), support, 'f' * 64, 'PRG_000001')
        self.assertEqual(b['scope']['alternative_exercises'], ['EX_000002'])
        self.assertEqual(b['scope']['alternatives'], ['ALT_000001'])
        self.assertFalse(any(u['id'] == 'EX_000003' for u in b['units'].values()))

    def test_missing_snapshot_does_not_reconstruct_content(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaises(SourceError):
            load_pilot(folder)

    def test_rejected_nested_source_record_is_not_silently_filtered(self):
        bundle, _, _ = synthetic_pilot()
        exercise = next(u for u in bundle['units'].values() if u['kind'] == 'exercise')
        exercise['covers'][1]['review_status'] = 'REJECTED'
        seal_bundle(bundle)
        with self.assertRaises(SourceError):
            validate_bundle(bundle)

    def test_graph_cycles_and_changed_payload_are_detected(self):
        b, _, _ = synthetic_pilot()
        leaf = next(key for key, u in b['units'].items() if not u['dependencies'])
        b['units'][leaf]['dependencies'] = [b['program_key']]
        seal_bundle(b)
        with self.assertRaises(SourceError):
            validate_bundle(b)
        b, _, _ = synthetic_pilot()
        b['units'][b['program_key']]['title'] = 'Changed without hashing'
        with self.assertRaises(SourceError):
            validate_bundle(b)


class ReviewWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.bundle, _, _ = synthetic_pilot()
        self.leaf = next(key for key, u in self.bundle['units'].items() if not u['dependencies'])

    def test_loading_has_no_approved_decisions(self):
        state = review_state(self.bundle, [])
        self.assertEqual(state['approved'], 0)
        self.assertFalse(state['program_approved'])
        self.assertEqual(state['head'], EMPTY_HEAD)

    def test_manual_reviewer_and_acknowledgement_are_required(self):
        for override in [{'reviewer': ''}, {'acknowledged': False}, {'action': 'APPROVED'}, {'items': []}]:
            with self.subTest(), self.assertRaises(ReviewError):
                data = decision(self.bundle, [], [self.leaf])
                data.update(override)
                decide(self.bundle, [], **data)

    def test_program_cannot_be_approved_with_unreviewed_dependencies_even_in_one_batch(self):
        for items in [[self.bundle['program_key']], list(self.bundle['units'])]:
            with self.subTest(), self.assertRaises(ReviewError) as caught:
                decide(self.bundle, [], **decision(self.bundle, [], items))
            self.assertEqual(caught.exception.code, 'dependencies_unreviewed')

    def test_comment_does_not_approve(self):
        events = decide(self.bundle, [], **decision(self.bundle, [], [self.leaf], 'comment'))
        self.assertEqual(review_state(self.bundle, events)['units'][self.leaf]['status'], 'pending')

    def test_snapshot_change_requires_a_fresh_review(self):
        events = approve_all(self.bundle)
        changed = deepcopy(self.bundle)
        changed['source_sha256'] = 'a' * 64
        seal_bundle(changed)
        self.assertEqual(review_state(changed, events)['approved'], 0)
        with self.assertRaises(ReviewError):
            decide(changed, events, **decision(self.bundle, events, [self.leaf]))

    def test_entity_version_and_exact_coverage_are_checked(self):
        events = decide(self.bundle, [], **decision(self.bundle, [], [self.leaf]))
        for patch_value in [{'entity_version': 9}, {'covered_records': []}, {'manual_acknowledgement': False}]:
            changed = deepcopy(events)
            changed[0].update(patch_value)
            changed[0]['event_hash'] = digest(canonical({k: v for k, v in changed[0].items() if k != 'event_hash'}))
            self.assertEqual(review_state(self.bundle, changed)['approved'], 0)

    def test_updated_dependency_invalidates_parent_without_automatic_reapproval(self):
        events = approve_all(self.bundle)
        self.assertTrue(review_state(self.bundle, events)['program_approved'])
        events = decide(self.bundle, events, **decision(self.bundle, events, [self.leaf], 'needs_correction'))
        self.assertFalse(review_state(self.bundle, events)['program_approved'])
        events = decide(self.bundle, events, **decision(self.bundle, events, [self.leaf]))
        self.assertFalse(review_state(self.bundle, events)['program_approved'])

    def test_comment_preserves_an_existing_explicit_approval(self):
        events = approve_all(self.bundle)
        events = decide(self.bundle, events, **decision(self.bundle, events, [self.leaf], 'comment'))
        self.assertTrue(review_state(self.bundle, events)['program_approved'])

    def test_journal_survives_restart_and_keeps_source_immutable(self):
        original = canonical(self.bundle)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'private-journal.json'
            Journal(path).append(self.bundle, **decision(self.bundle, [], [self.leaf]))
            recovered = Journal(path).read()
            self.assertEqual(review_state(self.bundle, recovered)['units'][self.leaf]['status'], 'approved')
            self.assertEqual(canonical(self.bundle), original)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_stale_window_and_failed_disk_write_do_not_overwrite_journal(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'journal.json'
            journal = Journal(path)
            first = decision(self.bundle, [], [self.leaf])
            journal.append(self.bundle, **first)
            before = path.read_bytes()
            with self.assertRaises(ReviewError):
                journal.append(self.bundle, **first)
            current = journal.read()
            with patch('tools.smart_trainer.review.workflow.os.replace', side_effect=OSError('synthetic disk failure')):
                with self.assertRaises(OSError):
                    journal.append(self.bundle, **decision(self.bundle, current, [self.leaf], 'comment'))
            self.assertEqual(path.read_bytes(), before)

    def test_corrupt_journal_is_refused_without_modifying_it(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'journal.json'
            journal = Journal(path)
            journal.append(self.bundle, **decision(self.bundle, [], [self.leaf]))
            data = json.loads(path.read_text())
            data['events'][0]['comment'] = 'tampered'
            path.write_text(json.dumps(data))
            before = path.read_bytes()
            with self.assertRaises(ReviewError):
                journal.read()
            self.assertEqual(path.read_bytes(), before)


class ReleaseGateTests(unittest.TestCase):
    def setUp(self):
        self.bundle, _, _ = synthetic_pilot()

    def test_approval_alone_never_publishes_or_verifies_engine_and_rights(self):
        candidate = prepare_candidate(self.bundle, approve_all(self.bundle), release_version='1.0.0')
        self.assertIn('engine_support_not_verified', candidate['blockers'])
        self.assertIn('publication_rights_not_confirmed', candidate['blockers'])
        self.assertFalse(candidate['runtime_enabled'])
        self.assertFalse(candidate['publication_performed'])

    def test_pending_and_rejected_content_cannot_be_released(self):
        candidate = prepare_candidate(self.bundle, [], release_version='1.0.0')
        self.assertIn('mandatory_dependencies_not_approved', candidate['blockers'])
        self.assertIn('program_not_approved', candidate['blockers'])
        self.bundle['units'][self.bundle['program_key']]['covers'][0]['review_status'] = 'REJECTED'
        seal_bundle(self.bundle)
        with self.assertRaises(SourceError):
            prepare_candidate(self.bundle, [], release_version='1.0.0')

    def test_engine_receipt_must_cover_every_capability_and_exact_snapshot(self):
        events = approve_all(self.bundle)
        engine, rights = receipts(self.bundle)
        for invalid in [{**engine, 'capabilities': {}}, {**engine, 'source_sha256': 'a' * 64}, {**engine, 'engine_commit': 'unverified'}]:
            candidate = prepare_candidate(self.bundle, events, release_version='1.0.0', engine_report=invalid, rights_receipt=rights)
            self.assertIn('engine_support_not_verified', candidate['blockers'])

    def test_release_recomputes_structure_instead_of_trusting_a_passed_flag(self):
        slot = self.bundle['units'][self.bundle['program_key']]['payload']['phases'][0]['sessions'][0]['slots'][0]
        slot['sets'] = -1
        seal_bundle(self.bundle)
        engine, rights = receipts(self.bundle)
        candidate = prepare_candidate(self.bundle, approve_all(self.bundle), release_version='1.0.0', engine_report=engine, rights_receipt=rights)
        self.assertIn('structural_validation_failed', candidate['blockers'])

    def test_unknown_equipment_or_untyped_alternative_dose_is_not_resolved_by_a_comment(self):
        for code in ['EQUIPMENT_REQUIREMENTS_UNKNOWN', 'ALTERNATIVE_UNIT_CHANGE']:
            bundle = deepcopy(self.bundle)
            bundle['review_questions'] = [{'code': code, 'entity': 'synthetic'}]
            seal_bundle(bundle)
            engine, rights = receipts(bundle)
            candidate = prepare_candidate(bundle, approve_all(bundle), release_version='1.0.0', engine_report=engine, rights_receipt=rights)
            self.assertTrue(candidate['blockers'])

    def test_separate_activation_is_bound_to_the_exact_candidate_and_never_deploys(self):
        events = approve_all(self.bundle)
        engine, rights = receipts(self.bundle)
        candidate = prepare_candidate(self.bundle, events, release_version='1.0.0', engine_report=engine, rights_receipt=rights)
        self.assertEqual(candidate['blockers'], [])
        with self.assertRaises(ValueError):
            authorize_offline_release(self.bundle, events, candidate, {})
        activation = {**rights, 'decision': 'activate_release', 'candidate_hash': candidate['candidate_hash']}
        result = authorize_offline_release(self.bundle, events, candidate, activation)
        self.assertEqual(result['state'], 'activation_authorized_offline')
        self.assertFalse(result['runtime_enabled'])
        self.assertFalse(result['publication_performed'])
        later = decide(self.bundle, events, **decision(self.bundle, events, [self.bundle['program_key']], 'comment'))
        with self.assertRaises(ValueError):
            authorize_offline_release(self.bundle, later, candidate, activation)


if __name__ == '__main__':
    unittest.main()
