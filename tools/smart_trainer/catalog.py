"""Strict source schema and lossless normalized rows. No publication operation."""

from collections import defaultdict
import json
from pathlib import Path

from .xlsx_source import SourceError

SCHEMA = json.loads(Path(__file__).with_name('schema.json').read_text())
TABLE_NAMES = {
    '12_Упражнения': 'exercises', '13_Биомеханика': 'biomechanics',
    '14_Связи': 'relations', '15_Замены': 'alternatives',
    '16_Программы': 'programs', '17_Сессии': 'sessions',
    '18_Состав_сессий': 'slots', '19_Недельный_объём': 'weekly_volume',
    '20_Проверка': 'reviews',
}


def normalize(workbook):
    tables = {}
    for name, expected in SCHEMA['sheets'].items():
        if name not in workbook.sheets:
            raise SourceError(f'Missing required worksheet: {name}')
        sheet = workbook.sheets[name]
        rows = sheet.rows()
        header = rows.get(4, {})
        actual = [header[c].value if c in header else None for c in range(1, max(header, default=0) + 1)]
        if actual != expected or any(c.formula is not None for c in header.values()):
            raise SourceError(f'Schema drift in {name}: expected exact technical headers at row 4')
        records = []
        for number, cells in rows.items():
            if number <= 4 or not any(c.value is not None or c.formula is not None for c in cells.values()):
                continue
            if max(cells) > len(expected):
                raise SourceError(f'Unexpected data column in {name} row {number}')
            record = {field: cells[c].value if c in cells else None for c, field in enumerate(expected, 1)}
            record['_source'] = {'sheet': name, 'row': number}
            record['_formulas'] = {field: {'expression': cells[c].expanded_formula or cells[c].formula, 'cache_status': cells[c].cache_status}
                                   for c, field in enumerate(expected, 1) if c in cells and cells[c].formula is not None}
            records.append(record)
        tables[TABLE_NAMES[name]] = records
    return tables


def equipment_options(relations, source_id, version):
    """OR between kits, AND inside a kit. Unknown remains unknown, never []."""
    kits = defaultdict(list)
    for row in relations:
        if row['relation_type'] == 'EQUIPMENT_REQUIRED' and row['source_id'] == source_id and row['source_version'] == version:
            if not row['requirement_group'] or not row['target_id']:
                return {'state': 'unresolved', 'reason': 'Missing group or equipment ID'}
            kits[row['requirement_group']].append({'equipment_id': row['target_id'], 'link_id': row['link_id'], 'review_status': row['review_status']})
    return {'state': 'declared', 'options': [{'group': k, 'all_of': v} for k, v in sorted(kits.items())]} if kits else {'state': 'unknown'}


def preview_catalog(tables):
    """Preserve flat tables and construct a version-bound tree for offline review."""
    relationships = defaultdict(list)
    bios = defaultdict(list)
    for row in tables['relations']:
        relationships[(row['source_id'], row['source_version'])].append(row)
    for row in tables['biomechanics']:
        bios[(row['exercise_id'], row['version'])].append(row)
    exercises = [{
        'record': row, 'stage': 'imported',
        'biomechanics': bios[(row['exercise_id'], row['version'])],
        'relations': relationships[(row['exercise_id'], row['version'])],
        'equipment': equipment_options(relationships[(row['exercise_id'], row['version'])], row['exercise_id'], row['version']),
    } for row in tables['exercises']]
    slots = defaultdict(list)
    sessions = defaultdict(list)
    volumes = defaultdict(list)
    for row in tables['slots']:
        slots[row['session_id']].append(row)
    for row in tables['sessions']:
        sessions[(row['program_id'], row['program_version'])].append(row)
    for row in tables['weekly_volume']:
        volumes[row['program_id']].append(row)
    programs = []
    for row in tables['programs']:
        phases = defaultdict(list)
        for session in sessions[(row['program_id'], row['version'])]:
            phases[session['phase_id']].append({'record': session, 'slots': sorted(slots[session['session_id']], key=lambda x: (x['order_index'] or 0, x['slot_id'] or ''))})
        programs.append({
            'record': row, 'stage': 'imported',
            'equipment': equipment_options(relationships[(row['program_id'], row['version'])], row['program_id'], row['version']),
            'phases': [{'phase_id': phase, 'sessions': sorted(values, key=lambda x: x['record']['cycle_day'] or 0)} for phase, values in sorted(phases.items())],
            'weekly_volume_source': volumes[row['program_id']],
        })
    return {'exercises': exercises, 'programs': programs, 'publication': 'disabled', 'lossless_tables': tables}
