"""Build a scoped review graph from the already imported, immutable snapshot."""

from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path

from ..xlsx_source import SourceError, canonical, digest, coordinate


def unit_key(kind, identity, version):
    return f'{kind}:{identity}@{version if version is not None else "source"}'


def seal_bundle(bundle):
    for unit in bundle['units'].values():
        unit['dependencies'] = sorted(set(unit['dependencies']))
        unit['record_hash'] = digest(canonical({k: v for k, v in unit.items() if k != 'record_hash'}))
    bundle['bundle_hash'] = digest(canonical({k: v for k, v in bundle.items() if k != 'bundle_hash'}))
    return bundle


def validate_bundle(bundle):
    if digest(canonical({k: v for k, v in bundle.items() if k != 'bundle_hash'})) != bundle['bundle_hash']:
        raise SourceError('Review bundle hash mismatch')
    units = bundle['units']
    active, done = set(), set()

    def reject_archived(value):
        if isinstance(value, dict):
            if value.get('review_status') == 'REJECTED':
                raise SourceError('Rejected source content in pilot payload')
            for child in value.values():
                reject_archived(child)
        elif isinstance(value, list):
            for child in value:
                reject_archived(child)

    def visit(key):
        if key not in units:
            raise SourceError('Missing review dependency: ' + key)
        if key in active:
            raise SourceError('Review dependency cycle')
        if key in done:
            return
        unit = units[key]
        if key != unit_key(unit['kind'], unit['id'], unit['version']):
            raise SourceError('Review entity/version key mismatch')
        if digest(canonical({k: v for k, v in unit.items() if k != 'record_hash'})) != unit['record_hash']:
            raise SourceError('Review unit hash mismatch')
        if any(row['review_status'] == 'REJECTED' for row in unit['covers']):
            raise SourceError('Rejected source record in pilot: ' + key)
        reject_archived(unit['payload'])
        active.add(key)
        for dependency in unit['dependencies']:
            visit(dependency)
        active.remove(key)
        done.add(key)
    visit(bundle['program_key'])
    if done != set(units):
        raise SourceError('Unrelated review units must not be included')
    return True


def structural_errors(bundle):
    """Re-evaluate cycle/assignments at release time; never trust a passed flag alone."""
    issues = []
    try:
        payload = bundle['units'][bundle['program_key']]['payload']
        record = payload['record']
        if (record['program_id'], record['version']) != (bundle['program_id'], bundle['program_version']):
            issues.append('program_revision')
        week_phase = {}
        core = set()
        sessions_seen, slots_seen = set(), set()
        for phase in payload['phases']:
            if len(phase['sessions']) != record['days_per_week']:
                issues.append('phase_frequency')
            for session in phase['sessions']:
                row = session['record']
                if row['session_id'] in sessions_seen or (row['program_id'], row['program_version'], row['phase_id']) != (bundle['program_id'], bundle['program_version'], phase['phase_id']):
                    issues.append('session_scope')
                sessions_seen.add(row['session_id'])
                if not 1 <= row['cycle_day'] <= record['cycle_length_days']:
                    issues.append('cycle_day')
                for week in range(row['phase_week_start'], row['phase_week_end'] + 1):
                    if week in week_phase and week_phase[week] != phase['phase_id']:
                        issues.append('phase_overlap')
                    week_phase[week] = phase['phase_id']
                if sorted(s['order_index'] for s in session['slots']) != list(range(1, len(session['slots']) + 1)):
                    issues.append('slot_order')
                for slot in session['slots']:
                    if slot['slot_id'] in slots_seen or slot['session_id'] != row['session_id']:
                        issues.append('slot_scope')
                    slots_seen.add(slot['slot_id'])
                    key = unit_key('exercise', slot['exercise_id'], slot['exercise_version'])
                    exercise = bundle['units'][key]['payload']['record']
                    core.add(slot['exercise_id'])
                    modalities = {u for u, field in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'), ('METERS', 'distance_meters')] if slot[field] is not None}
                    if modalities != {exercise['measurement_unit']} or slot['sets'] < 1 or not 1 <= slot['minimum_sets'] <= slot['sets']:
                        issues.append('slot_dose_or_unit')
                    for low, high in [('rep_min', 'rep_max'), ('rir_min', 'rir_max'), ('rest_min_seconds', 'rest_max_seconds')]:
                        if (slot[low] is None) != (slot[high] is None) or (slot[low] is not None and (slot[low] < 0 or slot[low] > slot[high])):
                            issues.append('slot_range')
        if sorted(week_phase) != list(range(1, record['duration_weeks'] + 1)):
            issues.append('week_coverage')
        if core != set(bundle['scope']['core_exercises']) or len(slots_seen) != bundle['scope']['slots'] or len(sessions_seen) != bundle['scope']['sessions']:
            issues.append('scope_counts')
        if [(w['week'], w['phase_id']) for w in bundle['weeks']] != sorted(week_phase.items()):
            issues.append('week_view')
    except (KeyError, TypeError, ValueError):
        issues.append('invalid_structure')
    return sorted(set(issues))


def _cover(kind, row, identity, version):
    return {'kind': kind, 'id': identity, 'version': version, 'source': row['_source'],
            'review_status': row['review_status']}


def extract_pilot(catalog, support, source_sha256, program_id='PRG_000002', version=1):
    tables = catalog['lossless_tables']
    programs = [p for p in catalog['programs'] if p['record']['program_id'] == program_id and p['record']['version'] == version]
    if len(programs) != 1:
        raise SourceError('Exact pilot revision not found')
    program = programs[0]
    record = program['record']
    slots = [slot for phase in program['phases'] for session in phase['sessions'] for slot in session['slots']]
    slot_ids = {slot['slot_id'] for slot in slots}
    core = {(slot['exercise_id'], slot['exercise_version']) for slot in slots}
    scoped_relations = [r for r in tables['relations'] if r['source_id'] in slot_ids and r['source_version'] == version]
    alternative_links = [r for r in scoped_relations if r['relation_type'] == 'SLOT_ALTERNATIVE']
    alternative_ids = {r['target_id'] for r in alternative_links}
    alternatives = [a for a in tables['alternatives'] if a['alternative_id'] in alternative_ids]
    if len(alternatives) != len(alternative_ids):
        raise SourceError('Missing explicit slot alternative')
    selected = core | {(a['target_exercise_id'], a['target_version']) for a in alternatives}
    if any((a['source_exercise_id'], a['source_version']) not in core for a in alternatives):
        raise SourceError('Alternative source is outside core pilot')
    selected_exercises = [e for e in catalog['exercises'] if (e['record']['exercise_id'], e['record']['version']) in selected]
    if len(selected_exercises) != len(selected):
        raise SourceError('Missing exact exercise revision')
    relations_by_source = defaultdict(list)
    definitions = {}
    for relation in tables['relations']:
        relations_by_source[(relation['source_id'], relation['source_version'])].append(relation)
        if relation['relation_type'] in ('CONCEPT', 'MUSCLE_DEF', 'EQUIPMENT_DEF'):
            definitions[(relation['relation_type'], relation['source_id'])] = relation
    units = {}

    def add(kind, identity, revision, title, payload, covers, dependencies=(), role='dependency', version_scope='source_record'):
        key = unit_key(kind, identity, revision)
        if key not in units:
            units[key] = {'key': key, 'kind': kind, 'id': identity, 'version': revision,
                          'version_scope': version_scope, 'title': title, 'role': role,
                          'payload': payload, 'covers': covers, 'dependencies': list(dependencies)}
        return key

    def definition(kind, identity):
        source_type = {'concept': 'CONCEPT', 'muscle': 'MUSCLE_DEF', 'equipment': 'EQUIPMENT_DEF'}.get(kind)
        if source_type:
            row = definitions.get((source_type, identity))
            if row is None:
                raise SourceError('Missing definition: ' + identity)
            revision = row['source_version']
            return add(kind, identity, revision, row['value_ru'], {'record': row},
                       [_cover('relation', row, row['link_id'], revision)])
        row = support.get(kind, {}).get(identity)
        if row is None:
            raise SourceError('Missing supporting definition: ' + identity)
        deps = [definition('pattern', row['primary_pattern'])] if kind == 'family' else []
        return add(kind, identity, None, row.get('title', identity), {'record': row},
                   [_cover(kind, row, identity, None)], deps, version_scope='snapshot_only_no_source_version')

    def relation_dependencies(rows):
        deps = []
        types = {'MUSCLE': 'muscle', 'EQUIPMENT_REQUIRED': 'equipment', 'EQUIPMENT_OPTIONAL': 'equipment',
                 'EVIDENCE': 'evidence', 'PROGRAM_TARGET': 'muscle', 'SECONDARY_PATTERN': 'pattern', 'SECONDARY_FAMILY': 'family'}
        for relation in rows:
            if relation['relation_type'] in types:
                deps.append(definition(types[relation['relation_type']], relation['target_id']))
        return deps

    for entry in selected_exercises:
        row = entry['record']
        identity, revision = row['exercise_id'], row['version']
        if len(entry['biomechanics']) != 1 or entry['biomechanics'][0]['version'] != revision:
            raise SourceError('Missing biomechanics revision: ' + identity)
        relations = relations_by_source[(identity, revision)]
        deps = relation_dependencies(relations) + [definition('concept', row['concept_id']), definition('family', row['family_id']), definition('pattern', row['primary_pattern'])]
        covers = [_cover('exercise', row, identity, revision), _cover('biomechanics', entry['biomechanics'][0], identity, revision)]
        covers += [_cover('relation', r, r['link_id'], r['source_version']) for r in relations]
        add('exercise', identity, revision, row['name_ru'], entry, covers, deps,
            role='core' if (identity, revision) in core else 'alternative_target')

    alt_keys = []
    for row in alternatives:
        links = [link for link in alternative_links if link['target_id'] == row['alternative_id']]
        covers = [_cover('alternative', row, row['alternative_id'], row['source_version'])]
        covers += [_cover('relation', link, link['link_id'], link['source_version']) for link in links]
        deps = [unit_key('exercise', row['source_exercise_id'], row['source_version']), unit_key('exercise', row['target_exercise_id'], row['target_version'])]
        alt_keys.append(add('alternative', row['alternative_id'], row['source_version'],
                            row['source_exercise_id'] + ' → ' + row['target_exercise_id'] + ' · ' + row['equivalence'],
                            {'record': row, 'slot_links': links}, covers, deps,
                            version_scope='source_and_target_revisions_in_payload'))
    own_relations = relations_by_source[(program_id, version)] + [r for r in scoped_relations if r['relation_type'] != 'SLOT_ALTERNATIVE']
    relation_dependencies(own_relations)
    for row in program['weekly_volume_source']:
        definition('muscle', row['target_id'])
    covers = [_cover('program', record, program_id, version)]
    for phase in program['phases']:
        for session in phase['sessions']:
            s = session['record']
            covers.append(_cover('session', s, s['session_id'], version))
            covers += [_cover('slot', slot, slot['slot_id'], version) for slot in session['slots']]
    covers += [_cover('relation', r, r['link_id'], r['source_version']) for r in own_relations]
    covers += [_cover('weekly_volume', row, row['volume_id'], version) for row in program['weekly_volume_source']]
    weeks = []
    for week in range(1, record['duration_weeks'] + 1):
        matches = [phase for phase in program['phases'] if all(s['record']['phase_week_start'] <= week <= s['record']['phase_week_end'] for s in phase['sessions'])]
        if len(matches) != 1:
            raise SourceError('Pilot phase gap or overlap')
        weeks.append({'week': week, 'phase_id': matches[0]['phase_id'],
                      'sessions': [s['record']['session_id'] for s in matches[0]['sessions']]})
    program_key = add('program', program_id, version, record['name_ru'],
                      {**program, 'relations': own_relations, 'weeks': weeks}, covers,
                      list(units), role='pilot', version_scope='program_revision_including_phase_session_slot_scope')
    checks = []
    structural_issues = []
    exercise_rows = {(e['record']['exercise_id'], e['record']['version']): e['record'] for e in selected_exercises}
    for phase in program['phases']:
        if len(phase['sessions']) != record['days_per_week']:
            structural_issues.append('phase_session_count:' + phase['phase_id'])
        for session in phase['sessions']:
            s = session['record']
            if (s['program_id'], s['program_version'], s['phase_id']) != (program_id, version, phase['phase_id']):
                structural_issues.append('session_scope:' + s['session_id'])
            if sorted(slot['order_index'] for slot in session['slots']) != list(range(1, len(session['slots']) + 1)):
                structural_issues.append('slot_order:' + s['session_id'])
            for slot in session['slots']:
                exercise = exercise_rows[(slot['exercise_id'], slot['exercise_version'])]
                modalities = {u for u, field in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'), ('METERS', 'distance_meters')] if slot[field] is not None}
                if slot['session_id'] != s['session_id'] or modalities != {exercise['measurement_unit']}:
                    structural_issues.append('slot_scope_or_unit:' + slot['slot_id'])
                if slot['sets'] < 1 or not 1 <= slot['minimum_sets'] <= slot['sets']:
                    structural_issues.append('slot_dose:' + slot['slot_id'])
    for entry in selected_exercises:
        row = entry['record']
        if entry['equipment']['state'] == 'unknown':
            checks.append({'code': 'EQUIPMENT_REQUIREMENTS_UNKNOWN', 'entity': row['exercise_id'], 'role': 'core' if (row['exercise_id'], row['version']) in core else 'alternative_target'})
    for alt in alternatives:
        target = next(e['record'] for e in selected_exercises if e['record']['exercise_id'] == alt['target_exercise_id'])
        source = next(e['record'] for e in selected_exercises if e['record']['exercise_id'] == alt['source_exercise_id'])
        if target['measurement_unit'] != source['measurement_unit']:
            checks.append({'code': 'ALTERNATIVE_UNIT_CHANGE', 'entity': alt['alternative_id'], 'target': target['exercise_id']})
        if alt['equivalence'] == 'C':
            checks.append({'code': 'ALTERNATIVE_C_REQUIRES_PROGRAM_CHANGE', 'entity': alt['alternative_id']})
    bundle = {
        'format_version': 1, 'source_sha256': source_sha256, 'program_key': program_key,
        'program_id': program_id, 'program_version': version, 'units': units, 'weeks': weeks,
        'scope': {'core_exercises': sorted(id for id, _ in core),
                  'alternative_exercises': sorted(id for id, _ in selected - core),
                  'alternatives': sorted(alternative_ids), 'alternative_slot_links': len(alternative_links),
                  'phases': len(program['phases']), 'sessions': sum(len(p['sessions']) for p in program['phases']),
                  'slots': len(slots), 'timed_slots': sum(s['time_seconds'] is not None for s in slots)},
        'review_questions': checks, 'structural_validation': 'passed' if not structural_issues else 'failed',
        'structural_issues': structural_issues,
        'runtime_enabled': False, 'rights_confirmed': False,
    }
    seal_bundle(bundle)
    validate_bundle(bundle)
    return bundle


def load_pilot(snapshot, program_id='PRG_000002', version=1):
    snapshot = Path(snapshot)
    if not (snapshot / 'manifest.json').is_file():
        raise SourceError('Imported snapshot is missing; original content must not be reconstructed')
    manifest = json.loads((snapshot / 'manifest.json').read_text())
    for filename in ('catalog.json', 'raw-cells.json.gz'):
        if digest((snapshot / filename).read_bytes()) != manifest['files_sha256'][filename]:
            raise SourceError('Snapshot artifact hash mismatch: ' + filename)
    catalog = json.loads((snapshot / 'catalog.json').read_text())
    raw = json.loads(gzip.decompress((snapshot / 'raw-cells.json.gz').read_bytes()))
    support = {'pattern': {}, 'family': {}, 'evidence': {}}
    for sheet in raw['sheets']:
        kind = {'03_Паттерны': 'pattern', '04_Семейства': 'family', '21_Источники': 'evidence'}.get(sheet['name'])
        if not kind:
            continue
        rows = defaultdict(dict)
        for cell in sheet['cells']:
            r, c = coordinate(cell['ref'])
            if r > 3:
                rows[r][c] = cell['value']
        for number, values in rows.items():
            id_col, title_col, status_col, comment_col = (2, 3, 5, 6) if kind == 'pattern' else (1, 3, 7, 8)
            identity = values.get(id_col)
            if not identity:
                continue
            row = {'id': identity, 'title': values.get(title_col), 'review_status': values.get(status_col),
                   'trainer_comment': values.get(comment_col), 'columns': {str(c): v for c, v in values.items()},
                   '_source': {'sheet': sheet['name'], 'row': number}}
            if kind == 'family':
                row['primary_pattern'] = values.get(2)
            support[kind][identity] = row
    return extract_pilot(catalog, support, manifest['source_sha256'], program_id, version)
