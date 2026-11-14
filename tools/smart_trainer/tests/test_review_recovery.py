"""Recovery uses isolated synthetic decisions, never the owner's private journal."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.smart_trainer.review.local import prepare_local, private_journal_path
from tools.smart_trainer.review.pilot import seal_bundle
from tools.smart_trainer.review.workflow import Journal, ReviewError, review_state
from tools.smart_trainer.xlsx_source import SourceError, canonical
from .test_review import decision, synthetic_pilot


class JournalRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.bundle, _, _ = synthetic_pilot()
        self.leaf = next(key for key, u in self.bundle['units'].items() if not u['dependencies'])
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.journal = Journal(Path(self.temp.name) / 'journal.json')

    def append(self, action='approve'):
        return self.journal.append(self.bundle, **decision(self.bundle, self.journal.read(), [self.leaf], action))

    def test_backup_is_private_idempotent_and_restores_exact_history(self):
        self.append()
        first = self.journal.backup(self.bundle)
        backup = Path(first['backup_file'])
        self.assertTrue(first['backup_confirmed'])
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.journal.path.read_bytes(), backup.read_bytes())
        original = backup.stat().st_mtime_ns
        self.assertEqual(first, self.journal.backup(self.bundle))
        self.assertEqual(backup.stat().st_mtime_ns, original)
        recovered = Journal(Path(self.temp.name) / 'recovered.json')
        recovered.restore(self.bundle, backup)
        self.assertEqual(recovered.read(), self.journal.read())
        self.assertEqual(review_state(self.bundle, recovered.read())['approved'], 1)

    def test_no_rollback_or_divergent_replacement_and_all_backups_remain(self):
        self.append()
        first = self.journal.backup(self.bundle)
        self.append('comment')
        second = self.journal.backup(self.bundle)
        before = self.journal.path.read_bytes()
        with self.assertRaises(ReviewError):
            self.journal.restore(self.bundle, first['backup_file'])
        other = Journal(Path(self.temp.name) / 'other.json')
        other.append(self.bundle, **decision(self.bundle, [], [self.leaf], 'reject'))
        divergent = other.backup(self.bundle)
        with self.assertRaises(ReviewError):
            self.journal.restore(self.bundle, divergent['backup_file'])
        self.assertEqual(self.journal.path.read_bytes(), before)
        self.assertNotEqual(first['backup_file'], second['backup_file'])
        self.assertTrue(Path(first['backup_file']).is_file())

    def test_tampered_wrong_bundle_missing_and_corrupt_current_are_refused(self):
        self.append()
        backup = Path(self.journal.backup(self.bundle)['backup_file'])
        before = self.journal.path.read_bytes()
        changed = deepcopy(self.bundle)
        changed['source_sha256'] = 'a' * 64
        seal_bundle(changed)
        with self.assertRaises(ReviewError):
            self.journal.restore(changed, backup)
        with self.assertRaises(ReviewError):
            self.journal.restore(self.bundle, backup.with_name('missing.json'))
        bad = json.loads(backup.read_text())
        bad['events'][0]['comment'] = 'tampered'
        backup.write_bytes(canonical(bad))
        with self.assertRaises(ReviewError):
            self.journal.restore(self.bundle, backup)
        with self.assertRaises(ReviewError):
            self.journal.backup(self.bundle)
        self.assertFalse(self.journal.storage(self.journal.read())['backup_confirmed'])
        self.assertEqual(self.journal.path.read_bytes(), before)
        backup.write_bytes(before)
        self.journal.path.write_text('{broken')
        with self.assertRaises(ReviewError):
            self.journal.restore(self.bundle, backup)
        self.assertEqual(self.journal.path.read_text(), '{broken')

    def test_backup_disk_failure_and_stale_window_preserve_confirmed_journal(self):
        self.append()
        before = self.journal.path.read_bytes()
        with self.assertRaises(ReviewError):
            self.journal.backup(self.bundle, expected_head='0' * 64)
        with patch('tools.smart_trainer.review.workflow.os.replace', side_effect=OSError('synthetic disk failure')):
            with self.assertRaises(OSError):
                self.journal.backup(self.bundle)
        self.assertEqual(self.journal.path.read_bytes(), before)
        self.assertEqual(list((self.journal.path.parent / 'backups').glob('.journal-*')), [])
        self.assertTrue(self.journal.backup(self.bundle)['backup_confirmed'])

    def test_backup_is_not_confirmed_when_durability_cannot_be_verified(self):
        self.append()
        self.journal.backup(self.bundle)
        before = self.journal.path.read_bytes()
        with patch('tools.smart_trainer.review.workflow.os.fsync', side_effect=OSError('synthetic durability failure')):
            self.assertFalse(self.journal.storage(self.journal.read())['backup_confirmed'])
        self.assertEqual(self.journal.path.read_bytes(), before)
        self.assertTrue(self.journal.storage(self.journal.read())['backup_confirmed'])


class LocalPreparationTests(unittest.TestCase):
    def test_missing_snapshot_requires_xlsx_without_importing_or_inventing_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'docs/smart-trainer/audit').mkdir(parents=True)
            (root / 'docs/smart-trainer/pilot').mkdir()
            (root / 'docs/smart-trainer/audit/snapshot-receipt.json').write_text(json.dumps({'source_sha256': 'f' * 64}))
            (root / 'docs/smart-trainer/pilot/summary.json').write_text('{}')
            with patch('tools.smart_trainer.review.local.ROOT', root), patch('tools.smart_trainer.review.local.run') as importer:
                with self.assertRaisesRegex(SourceError, 'Требуется XLSX'):
                    prepare_local()
                source = root / 'wrong.xlsx'
                source.write_bytes(b'Clearly marked synthetic invalid XLSX, not a snapshot')
                with self.assertRaisesRegex(SourceError, 'SHA256'):
                    prepare_local(source)
                importer.assert_not_called()
            self.assertFalse((root / '.local').exists())

    def test_recovery_cli_refuses_public_and_snapshot_destinations(self):
        for target in ['client/journal.json', 'docs/journal.json', '.git/journal.json',
                       '.local/smart-trainer/source.xlsx', '.local/smart-trainer/trainer-review/journals/backups/copy.json']:
            with self.subTest(target=target), self.assertRaises(SourceError):
                private_journal_path(target)


if __name__ == '__main__':
    unittest.main()
