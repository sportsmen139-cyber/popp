"""Deterministic structural audit; diagnostics never modify source values/statuses."""

from collections import Counter, defaultdict
from datetime import datetime
import re

from .catalog import SCHEMA, equipment_options
from .xlsx_source import SourceError


class Findings:
    def __init__(self):
        self.groups = {}

    def add(self, code, row=None, field='', detail='', severity='error', sheet=None, number=None):
        source = (row or {}).get('_source', {})
        sheet = sheet or source.get('sheet', '')
        number = number or source.get('row')
        key = (code, severity, sheet, field)
        group = self.groups.setdefault(key, {'code': code, 'severity': severity, 'sheet': sheet, 'field': field, 'count': 0, 'examples': []})
        group['count'] += 1
        if len(group['examples']) < 10:
            identity = next((v for k, v in (row or {}).items() if k.endswith('_id') and isinstance(v, str)), None)
            group['examples'].append({'row': number, 'id': identity, 'detail': detail})

    def result(self):
        return sorted(self.groups.values(), key=lambda x: (x['severity'], x['code'], x['sheet'], x['field']))


def _rows(workbook, name, start=4):
    return [{'_source': {'sheet': name, 'row': n}, **{str(c): v.value for c, v in cells.items()}}
            for n, cells in workbook.sheets[name].rows().items() if n >= start and any(v.value is not None for v in cells.values())]


def audit(workbook, tables):
    findings = Findings()
    keys = {'exercises': ('exercise_id', 'EX'), 'biomechanics': ('exercise_id', 'EX'),
            'relations': ('link_id', 'LNK'), 'alternatives': ('alternative_id', 'ALT'),
            'programs': ('program_id', 'PRG'), 'sessions': ('session_id', 'SES'),
            'slots': ('slot_id', 'SLOT'), 'weekly_volume': ('volume_id', 'VOL'), 'reviews': ('review_id', 'REV')}
    indexes = {}
    for table, (key, prefix) in keys.items():
        index = defaultdict(list)
        for row in tables[table]:
            value = row[key]
            if not isinstance(value, str) or not re.fullmatch(prefix + r'_[0-9]{6}', value):
                findings.add('INVALID_ID', row, key)
            index[value].append(row)
        for value, rows in index.items():
            if len(rows) > 1:
                for row in rows:
                    findings.add('DUPLICATE_ID', row, key, str(value))
        indexes[table] = {key: rows[0] for key, rows in index.items() if len(rows) == 1}

    dictionaries = defaultdict(set)
    for row in _rows(workbook, '11_Справочники'):
        dictionaries[row.get('1')].add(row.get('2'))
    dictionaries['pattern'] = {r.get('2') for r in _rows(workbook, '03_Паттерны')}
    dictionaries['session_type'] = {r.get('2') for r in _rows(workbook, '08_Типы_программ') if r.get('1') == 'Тип сессии'}
    table_by_sheet = {v[0]['_source']['sheet']: v for v in tables.values() if v}
    specs = [(sheet, field, definition) for sheet, fields in SCHEMA['fields'].items() for field, definition in fields.items()]
    for sheet, field, definition in specs:
        kind, required, dictionary = definition['type'], definition['required'], definition['dictionary']
        for row in table_by_sheet.get(sheet, []):
            value = row.get(field)
            formula = row['_formulas'].get(field)
            if value in (None, ''):
                if required == 'YES' and not formula:
                    findings.add('MISSING_REQUIRED_FIELD', row, field)
                continue
            if kind in ('INTEGER', 'DECIMAL'):
                if isinstance(value, bool) or not isinstance(value, (int, float)) or (kind == 'INTEGER' and int(value) != value):
                    findings.add('INVALID_NUMBER', row, field)
            if kind in ('TEXT', 'ID') and not isinstance(value, str):
                findings.add('INVALID_TEXT', row, field)
            if kind == 'DATE':
                try:
                    datetime.fromisoformat(value)
                except (TypeError, ValueError):
                    findings.add('INVALID_DATE', row, field)
            if kind == 'ENUM' and dictionary in SCHEMA['enums'] and value not in SCHEMA['enums'][dictionary]:
                findings.add('UNKNOWN_ENUM', row, field, str(value))
    for name, rows in tables.items():
        for row in rows:
            for field in ('version', 'source_version', 'target_version', 'program_version', 'exercise_version', 'entity_version'):
                if field in row and (not isinstance(row[field], int) or isinstance(row[field], bool) or row[field] < 1):
                    findings.add('INVALID_VERSION', row, field)

    fatal = [g for g in findings.result() if g['code'] in {
        'INVALID_ID', 'DUPLICATE_ID', 'MISSING_REQUIRED_FIELD', 'INVALID_NUMBER', 'INVALID_TEXT', 'INVALID_DATE', 'UNKNOWN_ENUM', 'INVALID_VERSION',
    }]
    if fatal:
        raise SourceError('Invalid source schema: ' + ', '.join(f"{g['code']}:{g['sheet']}:{g['field']} ({g['count']})" for g in fatal))

    definitions = {}
    for kind, prefix in [('CONCEPT', 'CON'), ('MUSCLE_DEF', 'MUS'), ('EQUIPMENT_DEF', 'EQ')]:
        grouped = defaultdict(list)
        for row in tables['relations']:
            if row['relation_type'] == kind:
                grouped[row['source_id']].append(row)
                if not re.fullmatch(prefix + r'_[0-9]{6}', str(row['source_id'])):
                    findings.add('INVALID_DEFINITION_ID', row, 'source_id')
        for value, rows in grouped.items():
            if len(rows) > 1:
                findings.add('DUPLICATE_DEFINITION', rows[0], 'source_id', value)
        definitions[kind] = {key: values[0] for key, values in grouped.items() if len(values) == 1}
    family_rows = _rows(workbook, '04_Семейства')
    families = {r.get('1'): r for r in family_rows}
    evidence_rows = _rows(workbook, '21_Источники')
    evidence = {r.get('1'): r for r in evidence_rows}
    for label, values, prefix in [('families', [r.get('1') for r in family_rows], 'FAM'), ('evidence', [r.get('1') for r in evidence_rows], 'EVD')]:
        for value, count in Counter(values).items():
            if label == 'evidence' and value == 'PROJECT':
                continue  # Explicit internal design provenance in 21, not a paper ID.
            if not re.fullmatch(prefix + r'_[0-9]{6}', str(value)) or count > 1:
                findings.add('INVALID_SUPPORTING_KEY', field=label, detail=str(value))

    def require(index, value, row, field, version=None):
        target = index.get(value)
        if target is None:
            findings.add('DANGLING_REFERENCE', row, field, str(value))
        elif version is not None:
            actual = target.get('version', target.get('source_version', target.get('program_version')))
            if actual is None and 'slot_id' in target:
                parent = indexes['sessions'].get(target['session_id'], {})
                actual = parent.get('program_version')
            if actual != version:
                findings.add('VERSION_MISMATCH', row, field, str(value))
        return target

    for row in tables['exercises']:
        require(definitions['CONCEPT'], row['concept_id'], row, 'concept_id')
        family = require(families, row['family_id'], row, 'family_id')
        if row['primary_pattern'] not in dictionaries['pattern']:
            findings.add('DANGLING_PATTERN', row, 'primary_pattern')
        if family and family.get('2') != row['primary_pattern']:
            findings.add('FAMILY_PATTERN_MISMATCH', row, 'family_id')
        bio = require(indexes['biomechanics'], row['exercise_id'], row, 'biomechanics', row['version'])
        if bio and bio['review_status'] != row['review_status']:
            findings.add('REVIEW_STATE_MISMATCH', row, 'biomechanics')
    for field in ('name_ru', 'name_en'):
        names = defaultdict(list)
        for row in tables['exercises']:
            names[row[field].strip().casefold()].append(row)
        for rows in names.values():
            if len(rows) > 1:
                findings.add('CANONICAL_NAME_COLLISION_REVIEW', rows[0], field, ';'.join(r['exercise_id'] for r in rows), severity='review')
    for row in tables['biomechanics']:
        require(indexes['exercises'], row['exercise_id'], row, 'exercise_id', row['version'])

    relation_groups = defaultdict(list)
    for row in tables['relations']:
        relation_groups[(row['source_id'], row['source_version'])].append(row)
        kind = row['relation_type']
        if kind in definitions:
            continue
        source_id = row['source_id'] or ''
        entity = indexes['programs'] if source_id.startswith('PRG_') else indexes['slots'] if source_id.startswith('SLOT_') else indexes['exercises']
        source = require(entity, source_id, row, 'source_id', row['source_version'])
        target_indexes = {'MUSCLE': definitions['MUSCLE_DEF'], 'EQUIPMENT_REQUIRED': definitions['EQUIPMENT_DEF'],
                          'EQUIPMENT_OPTIONAL': definitions['EQUIPMENT_DEF'], 'EVIDENCE': evidence,
                          'PROGRAM_TARGET': definitions['MUSCLE_DEF'], 'SLOT_ALTERNATIVE': indexes['alternatives'],
                          'SECONDARY_FAMILY': families}
        if kind in target_indexes:
            require(target_indexes[kind], row['target_id'], row, 'target_id')
        for relation_type, dictionary in [('LOCATION', 'location'), ('SECONDARY_GOAL', 'goal'), ('SECONDARY_PATTERN', 'pattern')]:
            if kind == relation_type and row['target_id'] not in dictionaries[dictionary]:
                findings.add('DANGLING_TAXONOMY', row, 'target_id')
        if kind == 'MUSCLE':
            if row['role'] not in dictionaries['muscle_role'] or row['volume_role'] not in dictionaries['volume_role']:
                findings.add('INVALID_MUSCLE_ROLE', row, 'role')
        if kind == 'EQUIPMENT_REQUIRED' and not row['requirement_group']:
            findings.add('MISSING_EQUIPMENT_GROUP', row, 'requirement_group')
        if source and source['review_status'] == 'REJECTED' and row['review_status'] != 'REJECTED':
            findings.add('REJECTED_DEPENDENCY', row, 'source_id')
    for entity in ('exercises', 'programs'):
        key = keys[entity][0]
        for row in tables[entity]:
            related = relation_groups[(row[key], row['version'])]
            locations = [r for r in related if r['relation_type'] == 'LOCATION']
            if not locations:
                findings.add('MISSING_LOCATION', row, 'location')
            if equipment_options(related, row[key], row['version'])['state'] != 'declared':
                findings.add('UNKNOWN_EQUIPMENT_REQUIREMENTS', row, 'equipment', severity='review')

    for row in tables['alternatives']:
        for side in ('source', 'target'):
            target = require(indexes['exercises'], row[side + '_exercise_id'], row, side + '_exercise_id', row[side + '_version'])
            if target and target['review_status'] == 'REJECTED' and row['review_status'] != 'REJECTED':
                findings.add('REJECTED_DEPENDENCY', row, side + '_exercise_id')
        if row['source_exercise_id'] == row['target_exercise_id']:
            findings.add('SELF_ALTERNATIVE', row, 'target_exercise_id')
        if row['load_history_policy'] != 'RECALIBRATE':
            findings.add('LOAD_POLICY_REVIEW', row, 'load_history_policy', severity='review')

    sessions_by_program = defaultdict(list)
    phases = defaultdict(list)
    slots_by_session = defaultdict(list)
    for row in tables['sessions']:
        program = require(indexes['programs'], row['program_id'], row, 'program_id', row['program_version'])
        sessions_by_program[row['program_id']].append(row)
        phases[(row['program_id'], row['phase_id'])].append(row)
        if not re.fullmatch(r'PHASE_[0-9]{2}', str(row['phase_id'])):
            findings.add('INVALID_PHASE_ID', row, 'phase_id')
        if program and not (1 <= row['phase_week_start'] <= row['phase_week_end'] <= program['duration_weeks']):
            findings.add('INVALID_PHASE_WEEKS', row, 'phase_week_start')
        if program and not (1 <= row['cycle_day'] <= program['cycle_length_days']):
            findings.add('INVALID_CYCLE_DAY', row, 'cycle_day')
    for (program_id, phase_id), sessions in phases.items():
        p = indexes['programs'].get(program_id)
        if p and len(sessions) != p['days_per_week']:
            findings.add('PHASE_SESSION_COUNT_MISMATCH', sessions[0], 'phase_id', phase_id)
        for field in ('phase_week_start', 'phase_week_end', 'phase_name'):
            if len({s[field] for s in sessions}) != 1:
                findings.add('INCONSISTENT_PHASE', sessions[0], field)
        if len({s['cycle_day'] for s in sessions}) != len(sessions):
            findings.add('DUPLICATE_PHASE_DAY', sessions[0], 'cycle_day')
    for program in tables['programs']:
        intervals = sorted({(s['phase_week_start'], s['phase_week_end']) for s in sessions_by_program[program['program_id']]})
        weeks = [w for a, b in intervals for w in range(a, b + 1)]
        if weeks != list(range(1, program['duration_weeks'] + 1)):
            findings.add('PHASE_COVERAGE_GAP_OR_OVERLAP', program, 'duration_weeks')
    for row in tables['slots']:
        session = require(indexes['sessions'], row['session_id'], row, 'session_id')
        exercise = require(indexes['exercises'], row['exercise_id'], row, 'exercise_id', row['exercise_version'])
        slots_by_session[row['session_id']].append(row)
        if not exercise or not session:
            continue
        if exercise['review_status'] == 'REJECTED':
            findings.add('REJECTED_EXERCISE_IN_SLOT', row, 'exercise_id')
        for field in ('sets', 'minimum_sets', 'order_index'):
            if not isinstance(row[field], int) or row[field] < 1:
                findings.add('INVALID_PRESCRIPTION', row, field)
        if row['minimum_sets'] > row['sets']:
            findings.add('MINIMUM_SETS_EXCEEDS_SETS', row, 'minimum_sets')
        for low, high in [('rep_min', 'rep_max'), ('rir_min', 'rir_max'), ('rest_min_seconds', 'rest_max_seconds')]:
            if (row[low] is None) != (row[high] is None) or (row[low] is not None and (row[low] < 0 or row[low] > row[high])):
                findings.add('INVALID_PRESCRIPTION_RANGE', row, low)
        present = {unit for unit, field in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'), ('METERS', 'distance_meters')] if row[field] is not None}
        if present != {exercise['measurement_unit']}:
            findings.add('PRESCRIPTION_UNIT_MISMATCH', row, 'measurement_unit', exercise['measurement_unit'])
        program = indexes['programs'].get(session['program_id'])
        locations = {r['target_id'] for r in relation_groups[(exercise['exercise_id'], exercise['version'])] if r['relation_type'] == 'LOCATION'}
        if program and program['primary_location'] not in locations:
            findings.add('ENVIRONMENT_MISMATCH', row, 'exercise_id', program['program_id'])
        if program and ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].index(exercise['minimum_level']) > ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].index(program['level']):
            findings.add('MINIMUM_LEVEL_REVIEW', row, 'exercise_id', program['program_id'], severity='review')
        if program:
            pr = relation_groups[(program['program_id'], program['version'])]
            er = relation_groups[(exercise['exercise_id'], exercise['version'])]
            pk = equipment_options(pr, program['program_id'], program['version'])
            ek = equipment_options(er, exercise['exercise_id'], exercise['version'])
            if pk['state'] == ek['state'] == 'declared':
                for kit in pk['options']:
                    available = {item['equipment_id'] for item in kit['all_of']}
                    if not any({item['equipment_id'] for item in e['all_of']} <= available for e in ek['options']):
                        findings.add('PROGRAM_EQUIPMENT_GAP', row, 'exercise_id', program['program_id'] + ':' + kit['group'])
    for session in tables['sessions']:
        orders = sorted(s['order_index'] for s in slots_by_session[session['session_id']])
        if orders != list(range(1, len(orders) + 1)) or not orders:
            findings.add('SLOT_ORDER_GAP_OR_DUPLICATE', session, 'slot_id')
    for row in tables['relations']:
        if row['relation_type'] != 'SLOT_ALTERNATIVE':
            continue
        slot = indexes['slots'].get(row['source_id'])
        alt = indexes['alternatives'].get(row['target_id'])
        if not slot or not alt:
            continue
        if (slot['exercise_id'], slot['exercise_version']) != (alt['source_exercise_id'], alt['source_version']):
            findings.add('SLOT_ALTERNATIVE_SOURCE_MISMATCH', row, 'target_id')
        if alt['review_status'] == 'REJECTED' and row['review_status'] != 'REJECTED':
            findings.add('REJECTED_SLOT_ALTERNATIVE', row, 'target_id')
        if slot['priority'] != alt['program_role']:
            findings.add('SLOT_ALTERNATIVE_ROLE_MISMATCH', row, 'target_id')
        if slot['rep_min'] is not None and alt['rep_min'] is not None and (slot['rep_min'] < alt['rep_min'] or slot['rep_max'] > alt['rep_max']):
            findings.add('SLOT_ALTERNATIVE_DOSE_REVIEW', row, 'target_id', severity='review')
    for row in tables['weekly_volume']:
        require(indexes['programs'], row['program_id'], row, 'program_id')
        require(definitions['MUSCLE_DEF'], row['target_id'], row, 'target_id')
        if (row['program_id'], row['phase_id']) not in phases:
            findings.add('DANGLING_PHASE', row, 'phase_id')
        if row['target_min'] is not None and row['target_max'] is not None and row['target_min'] > row['target_max']:
            findings.add('INVALID_VOLUME_RANGE', row, 'target_min')
    type_to_index = {'EXERCISE': indexes['exercises'], 'ALTERNATIVE': indexes['alternatives'], 'PROGRAM': indexes['programs'], 'SESSION': indexes['sessions'], 'SLOT': indexes['slots']}
    for row in tables['reviews']:
        if row['entity_type'] == 'PROGRAM_PHASE':
            if tuple(str(row['entity_id']).split('/')) not in phases:
                findings.add('DANGLING_REVIEW_PHASE', row, 'entity_id')
        elif row['entity_type'] in type_to_index:
            entity = require(type_to_index[row['entity_type']], row['entity_id'], row, 'entity_id', row['entity_version'])
            if entity and entity['review_status'] != row['review_status']:
                findings.add('REVIEW_LOG_MISMATCH', row, 'review_status')
        else:
            findings.add('UNKNOWN_REVIEW_ENTITY', row, 'entity_type')

    summary = {
        'source_sha256': workbook.sha256, 'sheets': len(workbook.sheets),
        'tables': {name: {'rows': len(rows), 'review_status': dict(Counter(r['review_status'] for r in rows))} for name, rows in tables.items()},
        'exercise_versions': dict(Counter(str(r['version']) for r in tables['exercises'])),
        'program_versions': dict(Counter(str(r['version']) for r in tables['programs'])),
        'program_environments': dict(Counter(r['primary_location'] for r in tables['programs'])),
        'program_levels': dict(Counter(r['level'] for r in tables['programs'])),
        'program_frequency': dict(Counter(str(r['days_per_week']) for r in tables['programs'])),
        'program_weeks': dict(Counter(str(r['duration_weeks']) for r in tables['programs'])),
        'phases': len(phases), 'definitions': {k: len(v) for k, v in definitions.items()},
        'patterns': len(dictionaries['pattern']), 'families': len(families), 'evidence': len(evidence),
        'alternatives': dict(Counter(r['equivalence'] for r in tables['alternatives'])),
        'measurement_units': dict(Counter(r['measurement_unit'] for r in tables['exercises'])),
        'publication_enabled': False, 'import_stage': 'imported',
    }
    return summary, findings, indexes, phases
