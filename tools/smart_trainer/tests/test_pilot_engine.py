from copy import deepcopy
from datetime import timedelta
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

from tools.smart_trainer.engine.contracts import readiness
from tools.smart_trainer.engine.declarations import STATEMENT, accepted_declaration, declare
from tools.smart_trainer.engine.runtime import dispatch, progression, replay
from tools.smart_trainer.engine.scope import execution_scope, source_overview
from tools.smart_trainer.engine.storage import EventLog
from tools.smart_trainer.review.pilot import seal_bundle
from tools.smart_trainer.review.workflow import ReviewError
from tools.smart_trainer.xlsx_source import SourceError, canonical
from .engine_fixtures import NOW, engine_fixture


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.full, self.scope, self.policy = engine_fixture(alternatives=True)
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.author = EventLog(Path(self.temp.name) / 'author.json', 'author_content_declarations')
        self.log = EventLog(Path(self.temp.name) / 'engine.json', 'isolated_pilot_assignments')
        self.overview = source_overview(self.scope)
        self.now = NOW
        self.aid = 'synthetic-assignment-1'
        self.owner_command = {'operation_id': str(uuid.uuid4()), 'source_sha256': self.scope['source_sha256'],
            'overview_hash': self.overview['overview_hash'], 'reviewer': 'Synthetic content owner', 'statement': STATEMENT, 'acknowledged': True}
        declare(self.author, self.overview, self.owner_command, self.author.head([]), NOW)

    def state(self):
        return replay(self.scope, self.log.read())

    def assignment(self):
        return self.state()['assignments'][self.aid]

    def send(self, action, **extra):
        data = {'operation_id': str(uuid.uuid4()), 'action': action, 'assignment_id': self.aid, **extra}
        return dispatch(self.log, self.scope, self.policy, accepted_declaration(self.author.read(), self.overview),
                        data, self.log.head(self.log.read()), self.now)

    def assign(self):
        return self.send('assign', user_id='Synthetic local participant', inventory=['EQ_000001'], timezone='Europe/Moscow', prerequisites_acknowledged=True)

    def start(self):
        self.send('start_session', session_id=str(uuid.uuid4()))

    def record(self, slot_id, *, context='device-A', reps=None, rir=3, weight=20, quality='good'):
        slot = next(s for s in self.assignment()['session']['slots'] if s['source_slot']['slot_id'] == slot_id)
        target = slot['effective']['prescription']
        return self.send('save_exercise', slot_id=slot_id, context=context, calibrated=True,
            sets=[{'set_number': n + 1, 'reps': target['rep_max'] if reps is None else reps, 'resistance': weight, 'rir': rir, 'quality': quality} for n in range(target['sets'])])

    def finish(self):
        for slot in self.assignment()['session']['slots']:
            if not slot['skipped']:
                self.record(slot['source_slot']['slot_id'])
        return self.send('finish_session')

    def test_content_declaration_is_separate_once_and_does_not_make_technical_approvals(self):
        before = canonical(self.full)
        self.assertTrue(accepted_declaration(self.author.read(), self.overview))
        self.assertEqual(self.log.read(), [])
        self.assertTrue(all(c['review_status'] == 'NEEDS_REVIEW' for u in self.full['units'].values() for c in u['covers']))
        declare(self.author, self.overview, self.owner_command, '0' * 64, NOW)
        self.assertEqual(len(self.author.read()), 1)
        with self.assertRaises(ReviewError):
            declare(self.author, self.overview, {**self.owner_command, 'operation_id': str(uuid.uuid4())}, self.author.head(self.author.read()), NOW)
        for patch_data in [{'source_sha256': 'a' * 64}, {'acknowledged': False}, {'reviewer': ''}]:
            other = EventLog(Path(self.temp.name) / (str(uuid.uuid4()) + '.json'), 'author_content_declarations')
            with self.assertRaises(ReviewError):
                declare(other, self.overview, {**self.owner_command, **patch_data}, other.head([]), NOW)
        self.assertEqual(canonical(self.full), before)

    def test_core_projection_excludes_optional_units_and_their_unit_blocker_without_changing_source(self):
        before = canonical(self.full)
        core = execution_scope(self.full)
        self.assertEqual(core['scope']['core_exercises'], ['EX_000001', 'EX_000002'])
        self.assertEqual(core['scope']['alternatives'], [])
        self.assertEqual(core['scope']['alternative_exercises'], [])
        self.assertFalse(any(u['kind'] == 'alternative' for u in core['units'].values()))
        self.assertFalse(any(q['code'] == 'ALTERNATIVE_UNIT_CHANGE' for q in core['review_questions']))
        self.assertEqual(canonical(self.full), before)
        with self.assertRaises(SourceError): execution_scope(self.full, ['ALT_999999'])

    def test_rejected_or_explicitly_excluded_content_cannot_enter_scope(self):
        bad = deepcopy(self.full)
        unit = next(u for u in bad['units'].values() if u['kind'] == 'exercise' and u['role'] == 'core')
        unit['payload']['record']['review_status'] = 'REJECTED'; seal_bundle(bad)
        with self.assertRaises(SourceError): execution_scope(bad)
        bad = deepcopy(self.full)
        old = 'exercise:EX_000002@1'; new = 'exercise:EX_000072@1'
        bad['units'][new] = bad['units'].pop(old); bad['units'][new].update(key=new, id='EX_000072')
        bad['units'][bad['program_key']]['dependencies'] = [new if key == old else key for key in bad['units'][bad['program_key']]['dependencies']]
        seal_bundle(bad)
        with self.assertRaises(SourceError): execution_scope(bad)

    def test_owner_declaration_never_bypasses_equipment_rights_policy_engine_or_units(self):
        self.assertEqual(readiness(self.scope, self.author.read()[0], self.policy)['blockers'], [])
        for field in ['rights_receipt', 'engine_report', 'cycle', 'progression']:
            policy = deepcopy(self.policy); policy.pop(field)
            self.assertTrue(readiness(self.scope, self.author.read()[0], policy)['blockers'])
        policy = deepcopy(self.policy); policy['scope_hash'] = 'a' * 64
        self.assertIn('technical_policy_unconfirmed', readiness(self.scope, self.author.read()[0], policy)['blockers'])
        for field, value in [('personal_changes', ['malformed']), ('alternatives', {'ALT_000001': 'malformed'}), ('equipment', {'EX_000001@1': 'malformed'})]:
            policy = deepcopy(self.policy); policy[field] = value
            self.assertIn('technical_policy_unconfirmed', readiness(self.scope, self.author.read()[0], policy)['blockers'])
        old = self.policy; self.policy = {}
        with self.assertRaises(ReviewError): self.assign()
        self.assertEqual(self.log.read(), []); self.policy = old
        timed = execution_scope(self.full, ['ALT_000004'])
        self.assertIn('unsupported_measurement_unit:EX_000004', readiness(timed, self.author.read()[0], {})['blockers'])

    def test_finite_eight_week_cycle_phase_confirmation_hold_resume_and_explicit_new_assignment(self):
        self.assign()
        for index in range(24):
            a = self.assignment()
            if a['transition_pending']:
                with self.assertRaises(ReviewError): self.start()
                self.send('hold_phase', reason='Synthetic keep tolerated phase', reviewer='Synthetic trainer', acknowledged=True)
                self.assertTrue(self.assignment()['held'])
                self.send('resume_phase', reason='Synthetic recovered, technique and setup confirmed', reviewer='Synthetic trainer', acknowledged=True)
            self.start()
            s = self.assignment()['session']
            self.assertEqual(s['cycle_day'], [1, 3, 5][index % 3])
            self.assertEqual(s['week'], index // 3 + 1)
            self.assertEqual(s['slots'][0]['effective']['prescription']['sets'], 1 if index < 6 else 2)
            self.finish(); self.now += timedelta(days=self.assignment()['next_rest_days'])
        a = self.assignment()
        self.assertEqual(a['completed_sessions'], 24); self.assertEqual(a['status'], 'cycle_completed')
        self.assertEqual(len({h['id'] for h in a['history']}), 24)
        with self.assertRaises(ReviewError): self.start()
        self.aid = 'synthetic-assignment-2'; self.assign()
        self.assertEqual(len(self.state()['assignments']), 2)

    def test_manual_primary_skip_records_partial_without_credit_or_doubled_compensation(self):
        self.assign(); self.start()
        before = self.assignment()['session']['slots']
        self.send('skip_today', slot_id=before[0]['source_slot']['slot_id'], reason='Synthetic unavailable today')
        after = self.assignment()['session']['slots']
        self.assertEqual(after[1], before[1])
        self.assertEqual(after[0]['sets'], [])
        self.finish()
        a = self.assignment(); self.assertEqual(a['completed_sessions'], 0); self.assertEqual(a['day_index'], 0)
        self.assertEqual(a['history'][0]['status'], 'partial'); self.assertEqual(a['history'][0]['performed_sets'], 1)
        self.now += timedelta(days=2); self.start()
        self.assertEqual(self.assignment()['session']['slots'][0]['effective']['prescription']['sets'], 1)
        self.assertFalse(self.assignment()['session']['slots'][0]['skipped'])

    def test_optional_skip_and_stop_preserve_actual_results_and_do_not_fabricate_sets(self):
        self.assign(); self.start(); slots = self.assignment()['session']['slots']
        self.send('skip_today', slot_id=slots[1]['source_slot']['slot_id'], reason='Synthetic optional skip')
        self.finish(); a = self.assignment()
        self.assertEqual(a['history'][0]['performed_sets'], 1); self.assertEqual(a['completed_sessions'], 1)
        self.now += timedelta(days=2); self.start()
        first = self.assignment()['session']['slots'][0]['source_slot']['slot_id']; self.record(first, reps=0)
        self.send('stop_session', reason='Synthetic stop')
        self.assertEqual(self.assignment()['history'][-1]['slots'][0]['sets'][0]['reps'], 0)
        self.assertEqual(self.assignment()['completed_sessions'], 1)

    def test_today_replacement_is_direct_contextual_fresh_and_not_permanent(self):
        self.assign(); self.start(); slot = self.assignment()['session']['slots'][0]['source_slot']['slot_id']
        self.send('replace_today', slot_id=slot, alternative_id='ALT_000001', reason='Synthetic other device')
        current = self.assignment()['session']['slots'][0]
        self.assertEqual(current['effective']['exercise_id'], 'EX_000003'); self.assertEqual(current['sets'], [])
        self.assertFalse(current['calibrated']); self.assertEqual(current['load_context'], '')
        self.record(slot, context='device-B', weight=3)
        with self.assertRaises(ReviewError): self.send('undo_today', slot_id=slot, reason='Cannot rename actual results')
        self.record(self.assignment()['session']['slots'][1]['source_slot']['slot_id']); self.send('finish_session')
        saved = self.assignment()['history'][0]['slots'][0]
        self.assertEqual(saved['source_slot']['exercise_id'], 'EX_000001'); self.assertEqual(saved['effective']['exercise_id'], 'EX_000003')
        self.now += timedelta(days=2); self.start()
        self.assertEqual(self.assignment()['session']['slots'][0]['effective']['exercise_id'], 'EX_000001')
        self.assertEqual(self.assignment()['session']['slots'][0]['sets'], [])

    def test_c_is_not_a_today_substitution_and_unprepared_reverse_transitive_or_wrong_units_are_blocked(self):
        self.assign(); self.start(); slot = self.assignment()['session']['slots'][0]['source_slot']['slot_id']
        for aid in ['ALT_000003', 'ALT_000004', 'ALT_999999']:
            with self.subTest(aid=aid), self.assertRaises(ReviewError):
                self.send('replace_today', slot_id=slot, alternative_id=aid, reason='Synthetic prohibited variant')
        accessory = self.assignment()['session']['slots'][1]['source_slot']['slot_id']
        with self.assertRaises(ReviewError): self.send('replace_today', slot_id=accessory, alternative_id='ALT_000001', reason='Wrong source context')
        self.policy['alternatives'].pop('ALT_000001:' + slot)
        with self.assertRaises(ReviewError): self.send('replace_today', slot_id=slot, alternative_id='ALT_000001', reason='Policy changed')

    def test_permanent_removal_requires_volume_review_and_undo_changes_only_future_sessions(self):
        self.assign(); self.start(); original = deepcopy(self.assignment()['session'])
        with self.assertRaises(ReviewError): self.send('personal_change', exercise_id='EX_000001', exercise_version=1, mode='remove', alternative_id=None, reason='Primary cannot be removed automatically')
        self.send('personal_change', exercise_id='EX_000002', exercise_version=1, mode='remove', alternative_id=None, reason='Synthetic approved personal volume change')
        self.assertEqual(self.assignment()['session'], original)
        self.finish(); history = deepcopy(self.assignment()['history'])
        self.now += timedelta(days=2); self.start(); self.assertEqual(len(self.assignment()['session']['slots']), 1)
        self.send('undo_personal_change', exercise_id='EX_000002', exercise_version=1, reason='Synthetic restore author plan')
        self.assertEqual(len(self.assignment()['session']['slots']), 1)
        self.finish(); self.now += timedelta(days=2); self.start()
        self.assertEqual(len(self.assignment()['session']['slots']), 2)
        self.assertEqual(self.assignment()['history'][:1], history)

    def test_c_permanent_replacement_uses_reviewed_new_dose_and_reversible_personal_revision(self):
        self.assign()
        self.send('personal_change', exercise_id='EX_000001', exercise_version=1, mode='replace', alternative_id='ALT_000003', reason='Synthetic C reviewed program change')
        self.start(); slot = self.assignment()['session']['slots'][0]
        self.assertEqual(slot['effective']['exercise_id'], 'EX_000003'); self.assertFalse(slot['calibrated'])
        self.assertEqual(self.assignment()['personal_revision'], 2)
        self.assertIn('timestamp', self.assignment()['personal_changes']['EX_000001@1'])

    def test_rest_day_postponement_missed_sequence_and_hold_do_not_advance_from_calendar(self):
        self.assign(); self.start(); self.finish()
        with self.assertRaises(ReviewError): self.start()
        self.now += timedelta(days=1)
        with self.assertRaises(ReviewError): self.start()
        target = (self.now + timedelta(days=5)).isoformat()
        self.send('missed', reason='Synthetic missed visit', scheduled_at=target)
        self.assertEqual(self.assignment()['day_index'], 1); self.assertEqual(self.assignment()['week'], 1)
        self.now += timedelta(days=40); self.start()
        self.assertEqual(self.assignment()['session']['week'], 1); self.assertEqual(self.assignment()['session']['cycle_day'], 3)

    def test_progression_uses_two_exact_exposures_no_missing_rir_or_device_transfer(self):
        self.assign()
        for _ in range(2): self.start(); self.finish(); self.now += timedelta(days=2)
        a = self.assignment()
        suggested = progression(self.scope, a, 'EX_000001', 1)
        self.assertEqual(suggested['action'], 'increase_suggestion'); self.assertEqual(suggested['resistance'], 22.5)
        for patch_data in [{'rir': None}, {'quality': 'unknown'}, {'resistance': 30}]:
            changed = deepcopy(a); changed['history'][-1]['slots'][0]['sets'][0].update(patch_data)
            self.assertNotEqual(progression(self.scope, changed, 'EX_000001', 1)['action'], 'increase_suggestion')
        for field, value in [('load_context', 'different-device'), ('calibrated', False)]:
            changed = deepcopy(a); changed['history'][-1]['slots'][0][field] = value
            self.assertNotEqual(progression(self.scope, changed, 'EX_000001', 1)['action'], 'increase_suggestion')
        changed = deepcopy(a); changed['history'][-1]['personal_revision'] += 1
        self.assertEqual(progression(self.scope, changed, 'EX_000001', 1)['action'], 'recalibrate')
        self.assertEqual(progression(self.scope, a, 'EX_000002', 1)['action'], 'technique_review')

    def test_zero_missing_measurement_units_and_duplicate_completion_are_distinct(self):
        self.assign(); self.start(); slot = self.assignment()['session']['slots'][0]['source_slot']['slot_id']
        with self.assertRaises(ReviewError): self.send('save_exercise', slot_id=slot, context='device-A', calibrated=True, sets=[{'set_number': 1, 'seconds': 12}])
        self.send('save_exercise', slot_id=slot, context='device-A', calibrated=True, sets=[{'set_number': 1, 'reps': None, 'resistance': 0, 'rir': None, 'quality': 'unknown'}])
        with self.assertRaises(ReviewError): self.send('finish_session')
        self.assertIsNone(self.assignment()['session']['slots'][0]['sets'][0]['reps'])
        self.finish(); before = deepcopy(self.assignment()['history'])
        with self.assertRaises(ReviewError): self.send('finish_session')
        self.assertEqual(self.assignment()['history'], before)

    def test_phase_hold_repeats_tolerated_dose_and_never_promotes_from_dates(self):
        self.assign()
        for _ in range(6): self.start(); self.finish(); self.now += timedelta(days=self.assignment()['next_rest_days'])
        self.assertEqual(self.assignment()['transition_pending'], 3)
        self.send('hold_phase', reason='Synthetic not ready for increased dose', reviewer='Synthetic trainer', acknowledged=True)
        self.now += timedelta(days=60)
        for _ in range(3):
            self.start(); self.assertEqual(self.assignment()['session']['week'], 2)
            self.assertEqual(self.assignment()['session']['slots'][0]['effective']['prescription']['sets'], 1)
            self.finish(); self.now += timedelta(days=self.assignment()['next_rest_days'])
            if self.assignment()['day_index']:
                with self.assertRaises(ReviewError):
                    self.send('resume_phase', reason='Cannot skip remaining held sessions', reviewer='Synthetic trainer', acknowledged=True)
        self.assertEqual(self.assignment()['week'], 2)
        self.send('resume_phase', reason='Synthetic recovery and technique checked', reviewer='Synthetic trainer', acknowledged=True)
        self.start(); self.assertEqual(self.assignment()['session']['week'], 3)
        self.assertEqual(self.assignment()['session']['slots'][0]['effective']['prescription']['sets'], 2)
        self.assertEqual(self.assignment()['session']['slots'][0]['sets'], [])

    def test_progression_uses_15_and_20_upper_bounds_and_two_failures_request_recovery_review(self):
        self.assign()
        for _ in range(2): self.start(); self.finish(); self.now += timedelta(days=2)
        original = self.assignment()
        for upper in (15, 20):
            a = deepcopy(original)
            for history in a['history']:
                history['slots'][0]['effective']['prescription']['rep_max'] = upper
            self.assertEqual(progression(self.scope, a, 'EX_000001', 1)['action'], 'hold')
            for history in a['history']:
                history['slots'][0]['sets'][0]['reps'] = upper
            self.assertEqual(progression(self.scope, a, 'EX_000001', 1)['action'], 'increase_suggestion')
        a = deepcopy(original)
        for history in a['history']:
            history['slots'][0]['sets'][0]['reps'] = 1
        self.assertEqual(progression(self.scope, a, 'EX_000001', 1)['action'], 'recovery_review')

    def test_atomic_idempotent_events_conflicts_corruption_and_restart(self):
        self.assign(); before = self.log.path.read_bytes(); state = self.state()
        command = {'operation_id': 'synthetic-operation-stable', 'action': 'start_session', 'assignment_id': self.aid, 'session_id': 'synthetic-session-stable'}
        head = self.log.head(self.log.read())
        dispatch(self.log, self.scope, self.policy, self.author.read()[0], command, head, self.now)
        dispatch(self.log, self.scope, self.policy, self.author.read()[0], command, head, self.now)
        self.assertEqual(len(self.log.read()), 2)
        with self.assertRaises(ReviewError): dispatch(self.log, self.scope, self.policy, self.author.read()[0], {**command, 'session_id': 'different-session'}, head, self.now)
        self.assertEqual(replay(self.scope, EventLog(self.log.path, self.log.purpose).read()), self.state())
        with patch('tools.smart_trainer.review.workflow.os.replace', side_effect=OSError('Synthetic disk failure')):
            with self.assertRaises(OSError): self.send('skip_today', slot_id=self.assignment()['session']['slots'][0]['source_slot']['slot_id'], reason='Synthetic failure')
        self.assertEqual(len(self.log.read()), 2)
        self.log.path.write_bytes(before); self.assertEqual(self.state(), state)
        self.log.path.write_text('{corrupt')
        with self.assertRaises(ReviewError): self.log.read()

    def test_export_restore_keeps_prefix_identity_and_refuses_rollback_wrong_scope_or_corruption(self):
        self.assign(); self.log.backup()
        first = self.log.files.path.parent / 'backups' / f'{self.log.path.stem}-{self.log.head(self.log.read())}.json'
        recovered = EventLog(Path(self.temp.name) / 'recovered/events.json', self.log.purpose)
        recovered.restore(first, lambda events: replay(self.scope, events))
        self.assertEqual(recovered.read(), self.log.read())
        self.start(); self.log.backup()
        latest = self.log.files.path.parent / 'backups' / f'{self.log.path.stem}-{self.log.head(self.log.read())}.json'
        recovered.restore(latest, lambda events: replay(self.scope, events))
        self.assertEqual(recovered.read(), self.log.read())
        before = recovered.path.read_bytes()
        with self.assertRaises(ReviewError): recovered.restore(first, lambda events: replay(self.scope, events))
        other_scope = execution_scope(self.full)
        other = EventLog(Path(self.temp.name) / 'wrong-scope.json', self.log.purpose)
        with self.assertRaises(ReviewError): other.restore(latest, lambda events: replay(other_scope, events))
        latest.write_text('{corrupt')
        with self.assertRaises(ReviewError): recovered.restore(latest, lambda events: replay(self.scope, events))
        self.assertEqual(recovered.path.read_bytes(), before)


if __name__ == '__main__': unittest.main()
