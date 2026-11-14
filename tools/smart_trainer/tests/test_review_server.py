import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from tools.smart_trainer.review.server import create_server
from .test_review import decision, synthetic_pilot


class LocalReviewServerTests(unittest.TestCase):
    def setUp(self):
        self.bundle, _, _ = synthetic_pilot()
        self.temp = tempfile.TemporaryDirectory()
        self.journal = Path(self.temp.name) / 'journal.json'
        self.server = create_server(self.bundle, self.journal, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        _, self.initial, _ = self.request('GET', '/api/pilot')
        self.leaf = next(key for key, u in self.bundle['units'].items() if not u['dependencies'])

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        merged = {'Origin': self.origin, 'Content-Type': 'application/json'}
        if hasattr(self, 'initial'):
            merged['X-Review-CSRF'] = self.initial['csrf']
        merged.update(headers or {})
        connection.request(method, path, body=body, headers=merged)
        response = connection.getresponse()
        raw, status, response_headers = response.read(), response.status, dict(response.headers)
        connection.close()
        return status, json.loads(raw) if raw else None, response_headers

    def payload(self, items=None):
        data = decision(self.bundle, [], items or [self.leaf])
        data.pop('now')
        return data

    def test_local_read_starts_pending_with_release_blockers(self):
        self.assertEqual(self.initial['state']['approved'], 0)
        self.assertFalse(self.initial['release_readiness']['runtime_enabled'])
        self.assertIn('engine_support_not_verified', self.initial['release_readiness']['blockers'])
        self.assertFalse(self.journal.exists())

    def test_explicit_decision_persists_and_json_export_is_separate(self):
        status, data, _ = self.request('POST', '/api/review', json.dumps(self.payload()))
        self.assertEqual(status, 200)
        self.assertEqual(data['state']['approved'], 1)
        self.assertTrue(self.journal.exists())
        status, export, headers = self.request('GET', '/api/journal')
        self.assertEqual(status, 200)
        self.assertEqual(len(export['events']), 1)
        self.assertIn('attachment', headers['Content-Disposition'])

    def test_unreviewed_parent_and_stale_head_are_refused(self):
        status, data, _ = self.request('POST', '/api/review', json.dumps(self.payload([self.bundle['program_key']])))
        self.assertEqual((status, data['error']), (409, 'dependencies_unreviewed'))
        payload = json.dumps(self.payload())
        self.assertEqual(self.request('POST', '/api/review', payload)[0], 200)
        status, data, _ = self.request('POST', '/api/review', payload)
        self.assertEqual((status, data['error']), (409, 'stale_head'))

    def test_foreign_origin_host_and_missing_csrf_cannot_write(self):
        for headers in [{'Origin': 'https://untrusted.example.invalid'}, {'Host': 'untrusted.example.invalid'}, {'X-Review-CSRF': ''}]:
            status, _, _ = self.request('POST', '/api/review', json.dumps(self.payload()), headers)
            self.assertEqual(status, 403)
        self.assertFalse(self.journal.exists())

    def test_oversize_duplicate_keys_and_unexpected_fields_are_refused(self):
        self.assertEqual(self.request('POST', '/api/review', '{}' * 40000)[0], 413)
        self.assertEqual(self.request('POST', '/api/review', '{"items":[],"items":[]}')[0], 400)
        data = self.payload()
        data['automatic_approval'] = True
        self.assertEqual(self.request('POST', '/api/review', json.dumps(data))[0], 400)
        self.assertFalse(self.journal.exists())

    def test_disk_error_never_reports_success(self):
        with patch('tools.smart_trainer.review.server.Journal.append', side_effect=OSError('synthetic disk error')):
            status, data, _ = self.request('POST', '/api/review', json.dumps(self.payload()))
        self.assertEqual(status, 503)
        self.assertEqual(data['error'], 'save_unconfirmed')
        self.assertFalse(self.journal.exists())

    def test_backup_failure_does_not_misreport_a_durable_decision_and_can_be_retried(self):
        with patch('tools.smart_trainer.review.server.Journal.backup', side_effect=OSError('synthetic backup failure')):
            status, saved, _ = self.request('POST', '/api/review', json.dumps(self.payload()))
        self.assertEqual(status, 200)
        self.assertEqual(saved['state']['approved'], 1)
        self.assertFalse(saved['storage']['backup_confirmed'])
        fields = {'expected_head': saved['state']['head'], 'source_sha256': self.bundle['source_sha256'], 'bundle_hash': self.bundle['bundle_hash']}
        for headers in [{'Origin': 'https://untrusted.example.invalid'}, {'Host': 'untrusted.example.invalid'}, {'X-Review-CSRF': ''}]:
            self.assertEqual(self.request('POST', '/api/backup', json.dumps(fields), headers)[0], 403)
        self.assertEqual(self.request('POST', '/api/backup', json.dumps({**fields, 'expected_head': '0' * 64}))[0], 409)
        self.assertEqual(self.request('POST', '/api/backup', json.dumps({**fields, 'bundle_hash': 'a' * 64}))[0], 409)
        self.assertEqual(self.request('POST', '/api/backup', json.dumps({**fields, 'destination': '/tmp/untrusted.json'}))[0], 400)
        status, copied, _ = self.request('POST', '/api/backup', json.dumps(fields))
        self.assertEqual(status, 200)
        self.assertTrue(copied['storage']['backup_confirmed'])
        self.assertEqual(copied['state']['events'], saved['state']['events'])
        self.assertEqual(Path(copied['storage']['backup_file']).read_bytes(), self.journal.read_bytes())

    def test_no_publication_endpoint_and_no_cross_origin_data_access(self):
        status, _, headers = self.request('GET', '/api/state')
        self.assertEqual(status, 200)
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.assertEqual(self.request('POST', '/api/publish', '{}')[0], 400)
        self.assertEqual(self.request('GET', '/source.xlsx')[0], 404)


if __name__ == '__main__':
    unittest.main()
