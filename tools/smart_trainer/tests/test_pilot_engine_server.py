import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid

from tools.smart_trainer.review.server import create_server
from .engine_fixtures import engine_fixture


class PilotHttpTests(unittest.TestCase):
    def setUp(self):
        self.bundle, self.scope, self.policy = engine_fixture(alternatives=True)
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.journal = Path(self.temp.name) / 'auxiliary-review.json'
        self.server = create_server(self.bundle, self.journal, 0, technical_contracts=self.policy,
                                   alternative_ids=['ALT_000001', 'ALT_000002', 'ALT_000003'])
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.model = self.request('GET', '/api/pilot-engine')[1]

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        merged = {'Origin': self.origin, 'Content-Type': 'application/json'}
        if hasattr(self, 'model'): merged['X-Review-CSRF'] = self.model['csrf']
        merged.update(headers or {})
        connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=merged)
        response = connection.getresponse(); raw = response.read(); status = response.status
        connection.close()
        return status, json.loads(raw) if raw else None

    def statement(self):
        return {'expected_head': self.model['declaration_head'], 'command': {'operation_id': str(uuid.uuid4()),
            'source_sha256': self.scope['source_sha256'], 'overview_hash': self.model['overview']['overview_hash'],
            'reviewer': 'Synthetic HTTP owner', 'statement': self.model['statement_text'], 'acknowledged': True}}

    def assignment(self):
        return {'expected_head': self.model['engine_head'], 'command': {'operation_id': str(uuid.uuid4()),
            'action': 'assign', 'assignment_id': 'synthetic-http-assignment', 'user_id': 'Synthetic HTTP participant',
            'inventory': ['EQ_000001'], 'timezone': 'Europe/Moscow', 'prerequisites_acknowledged': True}}

    def test_one_statement_unblocks_content_without_any_auxiliary_card_events(self):
        self.assertIn('author_declaration_missing', self.model['readiness']['blockers'])
        self.assertEqual(self.request('POST', '/api/pilot-engine/command', self.assignment())[0], 409)
        statement = self.statement()
        status, saved = self.request('POST', '/api/owner-statement', statement)
        self.assertEqual(status, 200); self.assertTrue(saved['last_save']['backup_confirmed'])
        self.assertEqual(saved['readiness']['blockers'], [])
        self.assertEqual(self.request('POST', '/api/owner-statement', statement)[0], 200)
        exported = self.request('GET', '/api/owner-statement/export')[1]
        self.assertEqual(len(exported['events']), 1)
        self.assertEqual(self.request('GET', '/api/state')[1]['state']['approved'], 0)
        self.assertFalse(self.journal.exists())
        self.model = self.request('GET', '/api/pilot-engine')[1]
        status, assignment = self.request('POST', '/api/pilot-engine/command', self.assignment())
        self.assertEqual(status, 200); self.assertEqual(len(assignment['state']['assignments']), 1)
        self.assertTrue(assignment['last_save']['backup_confirmed'])
        self.assertEqual(self.request('GET', '/api/pilot-engine/export')[1]['purpose'], 'isolated_pilot_assignments')

    def test_foreign_requests_missing_csrf_and_wrong_source_cannot_declare_or_bypass_contracts(self):
        for path, data in [('/api/owner-statement', self.statement()), ('/api/pilot-engine/command', self.assignment())]:
            for headers in [{'Origin': 'https://untrusted.invalid'}, {'Host': 'untrusted.invalid'}, {'X-Review-CSRF': ''}]:
                self.assertEqual(self.request('POST', path, data, headers)[0], 403)
        bad = self.statement(); bad['command']['source_sha256'] = 'a' * 64
        self.assertEqual(self.request('POST', '/api/owner-statement', bad)[0], 409)
        bypass = self.assignment(); bypass['command']['policy'] = self.policy
        self.assertEqual(self.request('POST', '/api/pilot-engine/command', bypass)[0], 422)
        self.assertEqual(self.request('GET', '/api/owner-statement/export')[1]['events'], [])
        self.assertEqual(self.request('GET', '/api/pilot-engine/export')[1]['events'], [])


if __name__ == '__main__': unittest.main()
