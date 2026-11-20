"""Index the existing immutable import; source prose never becomes approved content."""

from copy import deepcopy

from .engine.scope import EXCLUDED
from .xlsx_source import SourceError, canonical, digest


class ExerciseLibrary:
    def __init__(self, catalog, source_sha256):
        self.source_sha256 = source_sha256
        self.records, self.excluded = {}, []
        seen = set()
        for original in catalog['exercises']:
            row = original['record']
            key = f'{row["exercise_id"]}@{row["version"]}'
            if key in seen:
                raise SourceError('Duplicate exercise revision: ' + key)
            seen.add(key)
            if row['review_status'] == 'REJECTED' or row['exercise_id'] in EXCLUDED:
                self.excluded.append(key)
                continue
            if row['review_status'] not in ('NEEDS_REVIEW', 'APPROVED'):
                raise SourceError('Unknown source review status: ' + key)
            bio = original['biomechanics']
            if len(bio) != 1 or bio[0]['version'] != row['version'] or bio[0]['exercise_id'] != row['exercise_id']:
                raise SourceError('Missing exact biomechanics revision: ' + key)
            self.records[key] = deepcopy(original)

    def private_record(self, identity, version):
        """Owner-local access only, not a public API or an activation receipt."""
        key = f'{identity}@{version}'
        if key not in self.records:
            raise SourceError('Exercise revision is excluded or unavailable: ' + key)
        return deepcopy(self.records[key])

    def manifest(self):
        return {'source_sha256': self.source_sha256, 'eligible_count': len(self.records),
                'excluded_revisions': sorted(self.excluded), 'public_text_count': 0, 'media_enabled': False,
                'exercises': [{'exercise_id': item['record']['exercise_id'], 'exercise_version': item['record']['version'],
                    'name_ru': item['record']['name_ru'], 'measurement_unit': item['record']['measurement_unit'],
                    'source_review_status': item['record']['review_status'], 'source_record_hash': digest(canonical(item)),
                    'equipment_state': item['equipment']['state'], 'biomechanics_preserved': True,
                    'text_status': 'NOT_APPROVED_FOR_PUBLICATION', 'media_status': 'NOT_APPROVED_FOR_PUBLICATION'}
                    for _, item in sorted(self.records.items())]}
