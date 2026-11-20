"""Two-day execution with explicit synthetic receipts; real programs stay gated."""

from datetime import timedelta
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid

from tools.smart_trainer.author_programs import AuthorPrograms, TWO_DAY_PROGRAMS
from tools.smart_trainer.engine.declarations import STATEMENT, declare
from tools.smart_trainer.engine.scope import execution_scope, source_overview
from tools.smart_trainer.engine.service import PilotService
from tools.smart_trainer.review.pilot import seal_bundle
from tools.smart_trainer.review.server import create_server
from tools.smart_trainer.review.workflow import ReviewError
from tools.smart_trainer.xlsx_source import canonical
from .engine_fixtures import NOW, engine_fixture
from .test_author_programs import SNAPSHOT

PROFILE = {'environment': 'gym', 'daysPerWeek': '2', 'level': 'beginner',
           'goalType': 'general_fitness', 'targetType': 'whole_body', 'targetId': None}


def two_day_fixture():
    full, _, policy = engine_fixture(days=(1, 4))
    full['units'][full['program_key']]['payload']['record'].update(specialization='NONE', level='BEGINNER')
    for unit in full['units'].values():
        if unit['kind'] == 'exercise':
            for row in unit['payload']['biomechanics']:
                row['laterality'] = 'BILATERAL'  # Explicit synthetic fixture, not a source correction.
    seal_bundle(full)
    full = execution_scope(full)  # Only synthetic core; same source-wide counts at every projection.
    scope = execution_scope(full)
    for receipt in (policy, policy['engine_report'], policy['rights_receipt']):
        receipt['scope_hash'] = scope['bundle_hash']
    return full, scope, policy


def declare_synthetic(service):
    declare(service.author_log, service.overview, {'operation_id': str(uuid.uuid4()),
        'source_sha256': service.scope['source_sha256'], 'overview_hash': service.overview['overview_hash'],
        'reviewer': 'Synthetic test owner', 'statement': STATEMENT, 'acknowledged': True}, service.author_log.head([]), NOW)


class TwoDayRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.full, self.scope, self.policy = two_day_fixture()
        self.folder = Path(self.temp.name)
        self.service = PilotService(self.full, self.folder, self.policy)
        declare_synthetic(self.service)
        self.now = NOW
        self.aid = 'synthetic-two-day-assignment'

    def send(self, action, **extra):
        return self.service.handle('engine', {'expected_head': self.service.payload()['engine_head'],
            'command': {'operation_id': str(uuid.uuid4()), 'action': action, 'assignment_id': self.aid, **extra}})

    def timed_send(self, action, **extra):
        from tools.smart_trainer.engine.runtime import dispatch
        return dispatch(self.service.engine_log, self.scope, self.policy, self.service.declaration(),
            {'operation_id': str(uuid.uuid4()), 'action': action, 'assignment_id': self.aid, **extra},
            self.service.engine_log.head(self.service.engine_log.read()), self.now)

    def assignment(self):
        return self.service.payload()['state']['assignments'][self.aid]

    def assign(self):
        self.timed_send('assign', user_id='Synthetic participant', inventory=['EQ_000001'],
                        timezone='Europe/Moscow', prerequisites_acknowledged=True)

    def fill(self):
        for slot in self.assignment()['session']['slots']:
            dose = slot['effective']['prescription']
            self.timed_send('save_exercise', slot_id=slot['source_slot']['slot_id'], context='device-A', calibrated=True,
                sets=[{'set_number': n + 1, 'reps': dose['rep_max'], 'resistance': 20, 'rir': 3, 'quality': 'good'}
                      for n in range(dose['sets'])])

    def test_sixteen_actual_completions_keep_two_source_days_gaps_phases_and_history(self):
        original = canonical(self.full)
        self.assign()
        for index in range(16):
            if self.assignment()['transition_pending']:
                with self.assertRaises(ReviewError):
                    self.timed_send('resume_phase', reason='Synthetic phase check', reviewer='', acknowledged=False)
                self.timed_send('resume_phase', reason='Synthetic phase check', reviewer='Synthetic trainer', acknowledged=True)
            self.timed_send('start_session', session_id=str(uuid.uuid4()))
            self.assertEqual(self.assignment()['session']['cycle_day'], (1, 4)[index % 2])
            self.fill(); self.timed_send('finish_session')
            a = self.assignment()
            self.assertEqual(a['completed_sessions'], index + 1)
            if index < 15:
                self.assertEqual(a['next_rest_days'], 3 if index % 2 == 0 else 4)
                with self.assertRaises(ReviewError): self.timed_send('start_session', session_id=str(uuid.uuid4()))
                self.now += timedelta(days=a['next_rest_days'])
        a = self.assignment()
        self.assertEqual(a['status'], 'cycle_completed'); self.assertEqual(len(a['history']), 16)
        self.assertEqual([s['cycle_day'] for s in a['history']], [1, 4] * 8)
        self.assertEqual(canonical(self.full), original)

    def test_saved_active_session_survives_service_restart_and_missed_day_does_not_advance(self):
        self.assign()
        self.timed_send('missed', reason='Synthetic time shortage', scheduled_at=(self.now + timedelta(days=3)).isoformat())
        self.assertEqual((self.assignment()['week'], self.assignment()['day_index'], self.assignment()['completed_sessions']), (1, 0, 0))
        self.now += timedelta(days=3)
        self.timed_send('start_session', session_id='synthetic-resumable-session')
        self.fill(); before = self.assignment()['session']
        restarted = PilotService(self.full, self.folder, self.policy)
        self.assertEqual(restarted.payload()['state']['assignments'][self.aid]['session'], before)
        self.service = restarted
        self.timed_send('finish_session')
        self.assertEqual(self.assignment()['day_index'], 1)
        self.assertTrue(self.assignment()['history'][0]['slots'][0]['sets'])

    def test_missing_inventory_and_readiness_cannot_create_an_assignment(self):
        with self.assertRaises(ReviewError):
            self.timed_send('assign', user_id='Synthetic', inventory=[], timezone='Europe/Moscow', prerequisites_acknowledged=True)
        self.assertEqual(self.service.payload()['state']['assignments'], {})
        blocked = AuthorPrograms([self.full], self.folder)
        with self.assertRaises(ReviewError) as error: blocked.service('PRG_000001', PROFILE)
        self.assertEqual(error.exception.code, 'technical_readiness_blocked')


class TwoDayHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.full, self.scope, policy = two_day_fixture()
        self.catalog = AuthorPrograms([self.full], Path(self.temp.name), {'PRG_000001': policy})
        declare_synthetic(PilotService(self.full, Path(self.temp.name), policy))
        self.server = create_server(self.full, Path(self.temp.name) / 'review.json', 0, author_programs=self.catalog)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.csrf = self.request('GET', '/api/author-programs')[1]['csrf']

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        h = {'Origin': self.origin, 'Content-Type': 'application/json', 'X-Review-CSRF': getattr(self, 'csrf', '')}
        h.update(headers or {})
        connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=h)
        response = connection.getresponse(); raw = response.read(); status = response.status
        mime = response.getheader('Content-Type'); connection.close()
        return status, json.loads(raw) if mime.startswith('application/json') else raw.decode()

    def test_open_uses_existing_engine_without_auto_assignment_and_routes_its_history(self):
        data = {'programId': 'PRG_000001', 'profile': PROFILE}
        status, opened = self.request('POST', '/api/author-programs/open', data)
        self.assertEqual(status, 200); self.assertFalse(opened['assignmentCreated'])
        page = self.request('GET', opened['url'])[1]
        token = opened['url'].rsplit('/', 1)[1]; root = '/api/author-pilot/' + token
        self.assertIn('data-pilot-api-root="' + root + '"', page)
        model = self.request('GET', root)[1]
        self.assertEqual(model['state']['assignments'], {})
        command = {'expected_head': model['engine_head'], 'command': {'operation_id': str(uuid.uuid4()),
            'action': 'assign', 'assignment_id': 'synthetic-http-two-day', 'user_id': 'Synthetic', 'inventory': ['EQ_000001'],
            'timezone': 'Europe/Moscow', 'prerequisites_acknowledged': True}}
        self.assertEqual(self.request('POST', root + '/command', command)[0], 200)
        self.assertEqual(len(self.request('GET', root + '/export')[1]['events']), 1)
        self.assertEqual(self.request('POST', '/api/author-programs/open', data)[1]['url'], opened['url'])
        # A previously opened tab cannot bypass a later admission failure.
        self.catalog.contracts = {}
        self.assertNotEqual(self.request('POST', root + '/command', command)[0], 200)

    def test_origin_csrf_profile_and_unknown_context_are_rejected(self):
        data = {'programId': 'PRG_000001', 'profile': PROFILE}
        for headers in [{'Origin': 'https://foreign.invalid'}, {'Host': 'foreign.invalid'}, {'X-Review-CSRF': ''}]:
            self.assertEqual(self.request('POST', '/api/author-programs/open', data, headers)[0], 403)
        for patch in [{'level': 'intermediate'}, {'daysPerWeek': '3'}, {'environment': 'home'}]:
            self.assertEqual(self.request('POST', '/api/author-programs/open', {**data, 'profile': {**PROFILE, **patch}})[0], 422)
        self.assertEqual(self.request('GET', '/author-pilot/' + 'a' * 32)[0], 404)
        self.assertEqual(self.catalog.service('PRG_000001', PROFILE).payload()['state']['assignments'], {})


@unittest.skipUnless((SNAPSHOT / 'source.xlsx').exists(), 'Private registered snapshot missing')
class RegisteredTwoDayTests(unittest.TestCase):
    def test_three_source_programs_are_exact_and_unsafe_approvals_are_not_created(self):
        catalog = AuthorPrograms.registered(batch='two-day')
        self.assertEqual(tuple(catalog.bundles), TWO_DAY_PROGRAMS)
        self.assertEqual(catalog.library.manifest()['eligible_count'], 200)
        for pid in TWO_DAY_PROGRAMS:
            result = catalog.inspect(pid)
            self.assertEqual((result['daysPerWeek'], result['cycleDays'], result['weeks'], result['sessionCount'], result['slotCount']), (2, [1, 4], 8, 6, 36))
            self.assertFalse(result['executionAvailable']); self.assertFalse(result['correctionPrepared'])
            self.assertNotIn('source_schedule_not_supported', [b['code'] for b in result['blockers']])
            self.assertEqual(result['structuralErrors'], [] if pid == 'PRG_000001' else ['slot_dose_or_unit'])
            with self.assertRaises(ReviewError):
                catalog.preview(pid, {**PROFILE, 'level': 'advanced'})
