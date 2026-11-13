"""Validate the reviewed comparison manifest. It is not a runtime identity alias."""

from collections import Counter
import csv
from pathlib import Path
import re

from .xlsx_source import SourceError


def validate_mapping(path, workbook, tables, legacy_source):
    with Path(path).open(encoding='utf-8', newline='') as stream:
        rows = list(csv.DictReader(stream))
    legacy = re.findall(r"^    id: '([^']+)',\n    name: '([^']+)',", Path(legacy_source).read_text(), re.M)
    if len(legacy) != 45 or len(rows) != 45 or {r['legacy_exercise_id'] for r in rows} != {id for id, _ in legacy}:
        raise SourceError('Mapping must retain all 45 legacy IDs exactly once')
    if len({r['legacy_exercise_id'] for r in rows}) != len(rows):
        raise SourceError('Duplicate legacy mapping row')
    source = {r['exercise_id']: r for r in tables['exercises']}
    names = dict(legacy)
    for row in rows:
        if row['source_sha256'] != workbook.sha256:
            raise SourceError('Mapping belongs to a different snapshot; explicit review required')
        if row['legacy_name_ru'] != names[row['legacy_exercise_id']]:
            raise SourceError('Legacy name changed; mapping review required')
        if row['match_type'] not in {'EXACT', 'SAME_EXERCISE_DIFFERENT_NAME', 'DIFFERENT_VARIANT', 'AMBIGUOUS', 'NO_MATCH'}:
            raise SourceError('Unknown mapping type')
        candidates = row['candidate_ids'].split(';') if row['candidate_ids'] else []
        if len(candidates) != len(set(candidates)) or any(id not in source for id in candidates):
            raise SourceError('Invalid candidate references')
        if row['new_exercise_id']:
            selected = source.get(row['new_exercise_id'])
            if selected is None or str(selected['version']) != row['new_exercise_version'] or row['new_exercise_id'] not in candidates:
                raise SourceError('Invalid selected revision')
        if row['match_type'] == 'AMBIGUOUS' and row['new_exercise_id']:
            raise SourceError('Ambiguous mapping cannot select an alias')
        if row['match_type'] == 'NO_MATCH' and (candidates or row['new_exercise_id']):
            raise SourceError('NO_MATCH cannot assign a different exercise')
        if row['decision'] != 'KEEP_LEGACY_NO_HISTORY_MERGE' or not row['evidence'] or row['confidence'] not in {'HIGH', 'MEDIUM', 'LOW'}:
            raise SourceError('Mapping decision/evidence is missing or unsafe')
    return {'rows': len(rows), 'match_types': dict(Counter(r['match_type'] for r in rows)),
            'runtime_aliases_created': 0, 'trainer_approval_claimed': False}
