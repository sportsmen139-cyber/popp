from copy import deepcopy
import json
import unittest

from tools.smart_trainer.exercise_library import ExerciseLibrary
from tools.smart_trainer.xlsx_source import SourceError, canonical
from .test_author_programs import SNAPSHOT


def synthetic_catalog():
    return {'exercises': [{'record': {'exercise_id': 'EX_000001', 'version': 1, 'name_ru': 'Synthetic exercise',
        'measurement_unit': 'REPS', 'review_status': 'NEEDS_REVIEW', 'setup': 'PRIVATE_UNCLEARED_PROSE'},
        'biomechanics': [{'exercise_id': 'EX_000001', 'version': 1, 'joint_actions': 'Synthetic facts'}],
        'equipment': {'state': 'unknown'}, 'relations': [{'role': 'Synthetic muscle role'}]}]}


class LibraryTests(unittest.TestCase):
    def test_private_source_keeps_biomechanics_and_unknowns_manifest_never_publishes_prose(self):
        source = synthetic_catalog(); before = canonical(source)
        library = ExerciseLibrary(source, 'a' * 64)
        private = library.private_record('EX_000001', 1)
        self.assertEqual(private, source['exercises'][0])
        private['equipment']['state'] = 'changed'
        self.assertEqual(library.private_record('EX_000001', 1)['equipment']['state'], 'unknown')
        manifest = library.manifest()
        self.assertNotIn('PRIVATE_UNCLEARED_PROSE', canonical(manifest).decode())
        self.assertEqual(manifest['public_text_count'], 0); self.assertFalse(manifest['media_enabled'])
        self.assertEqual(canonical(source), before)

    def test_rejected_and_explicitly_excluded_versions_never_become_eligible(self):
        for identity, status in [('EX_000002', 'REJECTED'), ('EX_000072', 'APPROVED')]:
            source = synthetic_catalog(); item = deepcopy(source['exercises'][0])
            item['record'].update(exercise_id=identity, review_status=status)
            source['exercises'].append(item)
            library = ExerciseLibrary(source, 'a' * 64)
            self.assertEqual(len(library.records), 1)
            with self.assertRaises(SourceError): library.private_record(identity, 1)
        with self.assertRaises(SourceError): ExerciseLibrary(synthetic_catalog(), 'a' * 64).private_record('EX_000001', 2)

    def test_duplicate_revision_unknown_status_and_missing_biomechanics_fail_closed(self):
        source = synthetic_catalog(); source['exercises'].append(deepcopy(source['exercises'][0]))
        with self.assertRaises(SourceError): ExerciseLibrary(source, 'a' * 64)
        source = synthetic_catalog(); source['exercises'][0]['record']['review_status'] = 'UNKNOWN'
        with self.assertRaises(SourceError): ExerciseLibrary(source, 'a' * 64)
        source = synthetic_catalog(); source['exercises'][0]['biomechanics'][0]['version'] = 2
        with self.assertRaises(SourceError): ExerciseLibrary(source, 'a' * 64)

    @unittest.skipUnless((SNAPSHOT / 'catalog.json').exists(), 'Private snapshot unavailable')
    def test_registered_index_has_200_exact_revisions_and_three_exclusions(self):
        source = json.loads((SNAPSHOT / 'catalog.json').read_text())
        library = ExerciseLibrary(source, '1919449150c40600c12d719b415ba1792ac331a8d29be2e4c6191f36f18a904a')
        self.assertEqual((len(library.records), len(library.excluded)), (200, 3))
        for original in source['exercises']:
            record = original['record']
            if record['review_status'] == 'REJECTED':
                with self.assertRaises(SourceError): library.private_record(record['exercise_id'], record['version'])
            else:
                self.assertEqual(library.private_record(record['exercise_id'], record['version']), original)
