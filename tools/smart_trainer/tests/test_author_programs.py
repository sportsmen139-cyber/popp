"""Synthetic gate/correction tests, plus optional checks of the private registered batch."""

from copy import deepcopy
import http.client
import gzip
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from tools.smart_trainer.author_corrections import DECISION, deadbug_projection
from tools.smart_trainer.author_programs import AuthorPrograms, PROGRAMS, verify_registered_artifacts
from tools.smart_trainer.import_preview import ROOT
from tools.smart_trainer.review.pilot import seal_bundle, structural_errors, validate_bundle
from tools.smart_trainer.review.server import create_server
from tools.smart_trainer.review.workflow import ReviewError
from tools.smart_trainer.xlsx_source import SourceError, canonical, digest
from .engine_fixtures import engine_fixture


def synthetic_deadbug():
    full = engine_fixture()[0]
    # Synthetic source stays synthetic; only its shape exercises the approved patch path.
    full = json.loads(json.dumps(full).replace('PRG_000001', 'PRG_000022').replace('EX_000002', 'EX_000135'))
    decision = json.loads(DECISION.read_text())
    decision['source_sha256'] = full['source_sha256']
    payload = full['units'][full['program_key']]['payload']
    payload['record'].update(level='INTERMEDIATE', primary_goal='HYPERTROPHY', specialization='LEGS')
    for phase in payload['phases']:
        for index, session in enumerate(phase['sessions']):
            if index:
                session['slots'] = [s for s in session['slots'] if s['exercise_id'] != 'EX_000135']
            for slot in session['slots']:
                if slot['exercise_id'] == 'EX_000135':
                    slot.update(slot_id=decision['programs']['PRG_000022'][phase['phase_id']], sets=2,
                                rep_min=None, rep_max=None,
                                time_seconds=decision['phases'][phase['phase_id']]['original_time_seconds'])
    full['scope']['slots'] = sum(len(s['slots']) for p in payload['phases'] for s in p['sessions'])
    full['scope']['timed_slots'] = 3
    seal_bundle(full)
    return full, decision


class CorrectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.full, decision = synthetic_deadbug()
        path = self.folder / 'synthetic-decision.json'
        path.write_bytes(canonical(decision))
        patched = patch('tools.smart_trainer.author_corrections.DECISION', path)
        patched.start(); self.addCleanup(patched.stop)

    def test_changes_only_approved_dose_fields_and_preserves_originals(self):
        before = canonical(self.full)
        projected = deadbug_projection(self.full)
        validate_bundle(projected)
        self.assertEqual(structural_errors(projected), [])
        correction = projected['methodical_corrections'][0]
        self.assertEqual(len(correction['changes']), 3)
        for change, reps, seconds in zip(correction['changes'], (6, 8, 10), (15, 20, 25)):
            original, prepared = change['original'], change['prepared']
            self.assertEqual(original['time_seconds'], seconds)
            self.assertEqual((prepared['sets'], prepared['rep_min'], prepared['rep_max'], prepared['time_seconds']), (2, reps, reps, None))
            self.assertEqual({k for k in original if original[k] != prepared[k]}, {'rep_min', 'rep_max', 'time_seconds'})
            self.assertEqual(change['counting_basis'], 'PER_SIDE')
        self.assertEqual(canonical(self.full), before)
        self.assertNotEqual(projected['bundle_hash'], self.full['bundle_hash'])
        self.assertEqual(projected['parent_source_bundle_hash'], self.full['bundle_hash'])
        for key in self.full['units']:
            if key != self.full['program_key']:
                self.assertEqual(self.full['units'][key], projected['units'][key])

    def test_scope_or_original_drift_and_reapplication_fail_closed(self):
        for field, value in [('source_sha256', 'a' * 64), ('program_id', 'PRG_000002'), ('program_version', 2)]:
            bad = deepcopy(self.full); bad[field] = value; seal_bundle(bad)
            with self.subTest(field=field), self.assertRaises(SourceError): deadbug_projection(bad)
        for field, value in [('sets', 3), ('time_seconds', 16), ('exercise_version', 2), ('slot_id', 'SLOT_999999')]:
            bad = deepcopy(self.full)
            slot = bad['units'][bad['program_key']]['payload']['phases'][0]['sessions'][0]['slots'][1]
            slot[field] = value; seal_bundle(bad)
            with self.subTest(field=field), self.assertRaises(SourceError): deadbug_projection(bad)
        with self.assertRaises(SourceError): deadbug_projection(deadbug_projection(self.full))

    def test_profile_is_exact_and_cannot_bypass_gates_or_create_history(self):
        catalog = AuthorPrograms([self.full], self.folder, prepare_correction=True)
        profile = {'environment': 'gym', 'daysPerWeek': '3', 'level': 'intermediate',
                   'goalType': 'hypertrophy', 'targetType': 'muscle_group', 'targetId': 'legs'}
        preview = catalog.preview('PRG_000022', profile)
        self.assertIn('per_side_logger_not_supported', [b['code'] for b in preview['blockers']])
        self.assertFalse(preview['executionAvailable'])
        for field, value in [('level', 'beginner'), ('daysPerWeek', '4'), ('environment', 'home'),
                             ('goalType', 'general_fitness'), ('targetId', 'arms')]:
            with self.subTest(field=field), self.assertRaises(ReviewError) as error:
                catalog.preview('PRG_000022', {**profile, field: value})
            self.assertEqual(error.exception.code, 'profile_not_eligible')
        with self.assertRaises(ReviewError): catalog.preview('PRG_000022', {**profile, 'bypass': True})
        with self.assertRaises(ReviewError) as error: catalog.service('PRG_000022', profile)
        self.assertEqual(error.exception.code, 'technical_readiness_blocked')
        self.assertFalse((self.folder / 'pilot-engine').exists())
        self.assertFalse((self.folder / 'author-statements.json').exists())


class AuthorPreviewHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        full, decision = synthetic_deadbug()
        path = self.folder / 'synthetic-decision.json'; path.write_bytes(canonical(decision))
        patched = patch('tools.smart_trainer.author_corrections.DECISION', path)
        patched.start(); self.addCleanup(patched.stop)
        catalog = AuthorPrograms([full], self.folder, prepare_correction=True)
        self.server = create_server(engine_fixture()[0], self.folder / 'review.json', 0, author_programs=catalog)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.origin = f'http://127.0.0.1:{self.server.server_port}'
        self.csrf = self.request('GET', '/api/author-programs')[1]['csrf']
        self.data = {'programId': 'PRG_000022', 'profile': {'environment': 'gym', 'daysPerWeek': '3',
            'level': 'intermediate', 'goalType': 'hypertrophy', 'targetType': 'muscle_group', 'targetId': 'legs'}}

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        merged = {'Origin': self.origin, 'Content-Type': 'application/json', 'X-Review-CSRF': getattr(self, 'csrf', '')}
        merged.update(headers or {})
        connection.request(method, path, body=json.dumps(data) if data is not None else None, headers=merged)
        response = connection.getresponse(); content = response.read(); status = response.status
        self.assertIsNone(response.getheader('Access-Control-Allow-Origin'))
        connection.close()
        return status, json.loads(content)

    def test_preview_preserves_doses_and_does_not_assign_or_write_journals(self):
        status, result = self.request('POST', '/api/author-programs/preview', self.data)
        self.assertEqual(status, 200)
        self.assertTrue(result['previewOnly']); self.assertFalse(result['executionAvailable'])
        self.assertEqual([c['prepared']['rep_min'] for c in result['corrections'][0]['changes']], [6, 8, 10])
        self.assertEqual(self.request('GET', '/api/pilot-engine/export')[1]['events'], [])
        self.assertFalse((self.folder / 'review.json').exists())

    def test_wrong_origin_host_csrf_and_profile_are_blocked(self):
        for headers in [{'Origin': 'https://foreign.invalid'}, {'Host': 'foreign.invalid'}, {'X-Review-CSRF': ''}]:
            self.assertEqual(self.request('POST', '/api/author-programs/preview', self.data, headers)[0], 403)
        for patch_profile in [{'level': 'beginner'}, {'daysPerWeek': '4'}, {'environment': 'home'}]:
            status, result = self.request('POST', '/api/author-programs/preview', {
                **self.data, 'profile': {**self.data['profile'], **patch_profile}})
            self.assertEqual(status, 422); self.assertEqual(result['error'], 'profile_not_eligible')
        self.assertEqual(self.request('POST', '/api/author-programs/preview', {**self.data, 'assign': True})[0], 400)
        self.assertEqual(self.request('POST', '/api/author-programs/command', self.data)[0], 400)


class RegisteredArtifactGuardTests(unittest.TestCase):
    def platform_fixture(self, root):
        raw = gzip.compress(b'Synthetic raw cells only', mtime=0)
        raw = raw[:9] + b'\x03' + raw[10:]
        manifest = {'files_sha256': {'raw-cells.json.gz': digest(raw)}, 'synthetic': True}
        files = {'catalog.json': b'Synthetic catalog', 'raw-cells.json.gz': raw, 'manifest.json': canonical(manifest)}
        receipt = {'artifacts_sha256': {name: digest(data) for name, data in files.items()}}
        actual = raw[:9] + b'\x13' + raw[10:]
        manifest['files_sha256']['raw-cells.json.gz'] = digest(actual)
        files.update({'raw-cells.json.gz': actual, 'manifest.json': canonical(manifest)})
        for name, content in files.items(): (root / name).write_bytes(content)
        return receipt, files

    def test_platform_header_and_only_corresponding_manifest_checksum_are_verified_without_edits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); receipt, files = self.platform_fixture(root)
            result = verify_registered_artifacts(root, receipt)
            self.assertTrue(result['gzip_os_byte_only']); self.assertTrue(result['all_content_bytes_verified'])
            self.assertEqual({name: (root / name).read_bytes() for name in files}, files)

    def test_platform_compatibility_never_allows_changed_content_or_other_manifest_fields(self):
        for damaged in ('payload', 'another_header_byte', 'manifest_field'):
            with self.subTest(damaged=damaged), tempfile.TemporaryDirectory() as folder:
                root = Path(folder); receipt, files = self.platform_fixture(root)
                if damaged == 'manifest_field':
                    manifest = json.loads(files['manifest.json']); manifest['synthetic'] = False
                    (root / 'manifest.json').write_bytes(canonical(manifest))
                else:
                    raw = bytearray(files['raw-cells.json.gz']); raw[10 if damaged == 'payload' else 8] ^= 1
                    (root / 'raw-cells.json.gz').write_bytes(raw)
                with self.assertRaises(SourceError): verify_registered_artifacts(root, receipt)

    def test_artifact_drift_is_rejected_before_extracting_or_reconstructing_programs(self):
        for damaged in ('source.xlsx', 'catalog.json', 'raw-cells.json.gz', 'manifest.json'):
            with self.subTest(damaged=damaged), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                files = {name: ('Synthetic artifact: ' + name).encode() for name in
                         ('source.xlsx', 'catalog.json', 'raw-cells.json.gz', 'manifest.json')}
                receipt = {'source_sha256': digest(files['source.xlsx']),
                           'artifacts_sha256': {name: digest(data) for name, data in files.items()}}
                audit = root / 'docs/smart-trainer/audit'; audit.mkdir(parents=True)
                (audit / 'snapshot-receipt.json').write_bytes(canonical(receipt))
                snapshot = root / '.local/smart-trainer' / receipt['source_sha256'] / 'schema-1-importer-1.0.0'
                snapshot.mkdir(parents=True)
                for name, content in files.items(): (snapshot / name).write_bytes(content)
                (snapshot / damaged).write_bytes(b'Synthetic altered artifact')
                with patch('tools.smart_trainer.author_programs.ROOT', root), patch('tools.smart_trainer.author_programs.load_pilot') as loader:
                    with self.assertRaises(SourceError): AuthorPrograms.registered()
                    loader.assert_not_called()


RECEIPT = json.loads((ROOT / 'docs/smart-trainer/audit/snapshot-receipt.json').read_text())
SNAPSHOT = ROOT / '.local/smart-trainer' / RECEIPT['source_sha256'] / 'schema-1-importer-1.0.0'


@unittest.skipUnless((SNAPSHOT / 'source.xlsx').exists(), 'Private registered XLSX is not available in this environment')
class RegisteredBatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = AuthorPrograms.registered()

    def test_all_six_keep_source_identity_and_exact_scope_without_activation(self):
        self.assertEqual(tuple(self.catalog.bundles), PROGRAMS)
        for pid in PROGRAMS:
            result = self.catalog.inspect(pid)
            self.assertEqual(result['sourceSha256'], RECEIPT['source_sha256'])
            self.assertFalse(result['executionAvailable'])
            self.assertTrue(result['correctionPrepared'])
            self.assertEqual(result['weeks'], 8)
            self.assertEqual(result['phaseCount'], 3)
            original = self.catalog.originals[pid]
            projected = self.catalog.bundles[pid]
            changes = {c['slot_id']: c for c in projected['methodical_corrections'][0]['changes']}
            restored = deepcopy(projected['units'][projected['program_key']]['payload'])
            for phase in restored['phases']:
                for session in phase['sessions']:
                    for index, slot in enumerate(session['slots']):
                        if slot['slot_id'] in changes: session['slots'][index] = changes[slot['slot_id']]['original']
            self.assertEqual(restored, original['units'][original['program_key']]['payload'])
            # The remaining unit conflict belongs to EX_000139, never silently converted.
            self.assertEqual(result['structuralErrors'], ['slot_dose_or_unit'] if pid == 'PRG_000063' else [])
        advanced = self.catalog.inspect('PRG_000063')
        self.assertEqual([c['exercise_id'] for c in advanced['unitConflicts']], ['EX_000139'] * 3)
        self.assertEqual(advanced['daysPerWeek'], 4)
        self.assertIn('source_schedule_not_supported', [b['code'] for b in advanced['blockers']])
