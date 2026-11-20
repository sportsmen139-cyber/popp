"""Owner-local content review. Does not assign programs or publish source text."""

from collections import defaultdict
from copy import deepcopy
import csv
from html import escape
import json
from pathlib import Path
import re

from .import_preview import ROOT
from .xlsx_source import SourceError, canonical, digest

TEXT_FIELDS = ('name_ru', 'equipment', 'start', 'steps', 'errors', 'safety', 'counting', 'conditions')
SOURCE_PROSE_FIELDS = ('setup', 'execution_standard', 'common_errors', 'limitations',
                       'technical_prerequisites', 'strength_prerequisites', 'trainer_comment')
TWO_DAY = {'PRG_000001', 'PRG_000013', 'PRG_000021'}
THREE_DAY = {'PRG_000002', 'PRG_000022', 'PRG_000030', 'PRG_000032', 'PRG_000038'}
KNOWN_FLOOR_TEXT = {'EX_000131', 'EX_000135', 'EX_000142'}


def text_payload(card):
    return {k: deepcopy(card[k]) for k in TEXT_FIELDS if k in card}


def text_hash(card):
    return digest(canonical(text_payload(card)))


def validate_cards(cards, library, protected=()):
    expected = set(library.records)
    identities = [f'{c["exercise_id"]}@{c["exercise_version"]}' for c in cards]
    if len(set(identities)) != len(identities) or set(identities) != expected:
        raise SourceError('Card identities must exactly match eligible source revisions')
    by_key = dict(zip(identities, cards))
    protected_keys = {f'{c["exercise_id"]}@{c["exercise_version"]}' for c in protected}
    for key, card in by_key.items():
        original = library.records[key]
        if (card['name_ru'] != original['record']['name_ru'] or
                card['source_record_hash'] != digest(canonical(original))):
            raise SourceError('Source name or record hash changed: ' + key)
        for field in ('equipment', 'start', 'safety', 'counting', 'content_revision'):
            if not isinstance(card.get(field), str) or not card[field].strip():
                raise SourceError('Missing card field: ' + key + ':' + field)
        if key not in protected_keys and (not isinstance(card.get('conditions'), str) or not card['conditions'].strip()):
            raise SourceError('Missing variant conditions: ' + key)
        if not 2 <= len(card.get('steps', [])) <= 5 or not 2 <= len(card.get('errors', [])) <= 4:
            raise SourceError('Invalid step/error count: ' + key)
        if not all(isinstance(s, str) and s.strip() for s in card['steps'] + card['errors']):
            raise SourceError('Blank instruction: ' + key)
        if card.get('media') or card.get('videos') or card.get('images'):
            raise SourceError('Unapproved media not allowed')
    for old in protected:
        key = f'{old["exercise_id"]}@{old["exercise_version"]}'
        if canonical(by_key[key]) != canonical(old):
            raise SourceError('Protected packet text or metadata changed: ' + key)
    return by_key


def words(text):
    return re.findall(r'[а-яёa-z0-9]+', text.lower())


def prose_text(card):
    values = []
    for key in ('start', 'steps', 'errors', 'safety', 'counting', 'conditions'):
        value = card.get(key, '')
        values.extend(value if isinstance(value, list) else [value])
    return ' '.join(values)


def similarity_screen(cards, catalog, width=8):
    """An editorial screen against the complete local prose, not legal clearance."""
    index = defaultdict(set)
    for item in catalog['exercises']:
        row = item['record']
        tokens = words(' '.join(str(row.get(k) or '') for k in SOURCE_PROSE_FIELDS))
        for n in range(len(tokens) - width + 1):
            index[tuple(tokens[n:n + width])].add(row['exercise_id'])
    findings = {}
    for card in cards:
        tokens = words(prose_text(card))
        matches = []
        for n in range(len(tokens) - width + 1):
            phrase = tuple(tokens[n:n + width])
            if phrase in index:
                matches.append({'words': list(phrase), 'source_exercise_ids': sorted(index[phrase])})
        if matches:
            findings[card['exercise_id']] = matches
    return findings


def program_issues(catalog, library):
    usage, conflicts = defaultdict(set), []
    for program in catalog['programs']:
        pid = program['record']['program_id']
        for phase in program['phases']:
            for session in phase['sessions']:
                for slot in session['slots']:
                    key = f'{slot["exercise_id"]}@{slot["exercise_version"]}'
                    if key not in library.records:
                        continue
                    usage[key].add(pid)
                    actual = [unit for unit, field in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'),
                              ('METERS', 'distance_meters')] if slot[field] is not None]
                    expected = library.records[key]['record']['measurement_unit']
                    if actual != [expected]:
                        conflicts.append({'exercise_id': slot['exercise_id'], 'exercise_version': slot['exercise_version'],
                            'program_id': pid, 'phase_id': phase['phase_id'], 'slot_id': slot['slot_id'],
                            'source_coordinate': slot['_source'], 'exercise_unit': expected,
                            'prescribed_units': actual, 'source_prescription': {k: slot[k] for k in
                                ('sets', 'rep_min', 'rep_max', 'time_seconds', 'distance_meters')},
                            'source_changed': False})
    return usage, conflicts


def compile_library(cards, library, catalog, *, protected=(), packet_sha256=None, source_provenance=None):
    by_key = validate_cards(cards, library, protected)
    usage, conflicts = program_issues(catalog, library)
    suspicious = similarity_screen(cards, catalog)
    conflict_ids = {x['exercise_id'] for x in conflicts}
    queue = ROOT / 'docs/smart-trainer/audit/content-queue-200.csv'
    order = {}
    if queue.is_file():
        with queue.open() as handle:
            order = {x['exercise_id']: int(x['order']) for x in csv.DictReader(handle)}
    definitions = {r['source_id']: r['value_ru'] for r in catalog['lossless_tables']['relations']
                   if r['relation_type'] == 'EQUIPMENT_DEF'}
    entries = []
    for key, card in by_key.items():
        original = library.records[key]
        record = original['record']; identity = record['exercise_id']
        flags = []
        unknown = original['equipment']['state'] != 'declared'
        missing_content_equipment = unknown and identity not in KNOWN_FLOOR_TEXT
        if unknown: flags.append('SOURCE_EQUIPMENT_UNKNOWN')
        if missing_content_equipment: flags.append('EQUIPMENT_DETAILS_REQUIRE_CONFIRMATION')
        if identity in conflict_ids: flags.append('PROGRAM_UNIT_CONFLICT')
        if identity in suspicious: flags.append('SOURCE_WORDING_MATCH_REQUIRES_EDITORIAL_REVIEW')
        primary = sorted({r['value_ru'] for r in original['relations'] if r['relation_type'] == 'MUSCLE'
                          and r['role'] == 'PRIMARY' and r['value_ru']})
        all_muscles = sorted({r['value_ru'] for r in original['relations'] if r['relation_type'] == 'MUSCLE' and r['value_ru']})
        eq_ids = sorted({r['equipment_id'] for option in original['equipment'].get('options', []) for r in option['all_of']})
        eq_names = [definitions.get(e, e) for e in eq_ids]
        if not unknown and identity not in {c['exercise_id'] for c in protected}:
            if not all(name in card['equipment'] for name in eq_names):
                raise SourceError('Draft omitted source equipment: ' + key)
        unit = record['measurement_unit']
        counting = card['counting'].lower()
        if unit == 'SECONDS' and not re.search(r'секунд|врем', counting):
            raise SourceError('Timed unit lost: ' + key)
        if unit == 'METERS' and not re.search(r'метр|дистанц', counting):
            raise SourceError('Distance unit lost: ' + key)
        entries.append({'card': deepcopy(card), 'key': key, 'text_sha256': text_hash(card),
            'card_sha256': digest(canonical(card)), 'source_sha256': library.source_sha256,
            'biomechanics_sha256': digest(canonical(original['biomechanics'])),
            'source_equipment': deepcopy(original['equipment']), 'equipment_filters': eq_names or ['Комплект не оформлен'],
            'primary_muscles': primary, 'muscle_filters': all_muscles,
            'measurement_unit': unit, 'laterality': original['biomechanics'][0]['laterality'],
            'minimum_level': record['minimum_level'], 'program_ids': sorted(usage[key]),
            'needed_for_two_day': bool(usage[key] & TWO_DAY), 'needed_for_three_day': bool(usage[key] & THREE_DAY),
            'priority': 0 if usage[key] & TWO_DAY else 1 if usage[key] & THREE_DAY else 2,
            'queue_order': order.get(identity, 1000), 'review_group': (order.get(identity, 1000) - 1) // 10 + 1,
            'flags': flags, 'content_complete': not missing_content_equipment,
            'recorded_approval': None, 'protected_first_packet': identity in {c['exercise_id'] for c in protected},
            'word_count': len(words(prose_text(card) + ' ' + card['equipment']))})
    entries.sort(key=lambda e: (e['priority'], e['queue_order']))
    manifest = [{'key': e['key'], 'content_revision': e['card']['content_revision'], 'text_sha256': e['text_sha256'],
                 'source_record_hash': e['card']['source_record_hash']} for e in entries]
    checks = {'cards': len(entries), 'new_drafts': len(entries) - len(protected),
        'protected_first_packet': len(protected), 'protected_packet_sha256': packet_sha256,
        'source_sha256': library.source_sha256, 'identity_version_equipment_unit_schema_passed': len(entries),
        'source_equipment_unknown': sum('SOURCE_EQUIPMENT_UNKNOWN' in e['flags'] for e in entries),
        'content_equipment_needs_confirmation': sum(not e['content_complete'] for e in entries),
        'raw_program_unit_conflicts': len(conflicts), 'unit_conflict_exercises': sorted(conflict_ids),
        'wording_match_exercises': sorted(suspicious),
        'no_data_review_flags': sum(not any(f != 'SOURCE_EQUIPMENT_UNKNOWN' for f in e['flags']) for e in entries),
        'recorded_approvals': 0, 'source_or_program_writes': False, 'media_included': False,
        'publication_performed': False, 'automatic_originality_is_legal_clearance': False,
        'biomechanics_review': 'Original structured facts bound by hash; wording needs trainer review. Schema checks are not a biomechanical or clinical validation.',
        'similarity_scope': 'Eight-word sequences across all local source narrative records, excluding names and equipment. No exhaustive Internet plagiarism search.',
        'max_word_count': max(e['word_count'] for e in entries)}
    return {'format_version': 1, 'library_version': '0.1', 'source_sha256': library.source_sha256,
        'manifest_sha256': digest(canonical(manifest)), 'manifest': manifest, 'entries': entries,
        'summary': checks, 'initial_reviews': [], 'source_provenance': source_provenance or []}, conflicts, suspicious


def render_html(model):
    data = json.dumps(model, ensure_ascii=False, separators=(',', ':'), allow_nan=False).replace('<', '\\u003c')
    script = (ROOT / 'client/scripts/content-library-ui.mjs').read_text()
    style = (ROOT / 'tools/smart_trainer/content-library.css').read_text()
    import base64, hashlib
    hash64 = lambda text: base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
    csp = "default-src 'none'; script-src 'sha256-" + hash64(script) + "'; style-src 'sha256-" + hash64(style) + "'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"
    template = (ROOT / 'tools/smart_trainer/content-library.html').read_text()
    values = {'CSP': escape(csp, quote=True), 'STYLE': style, 'DATA': data, 'SCRIPT': script}
    return re.sub(r'\{\{(CSP|STYLE|DATA|SCRIPT)\}\}', lambda match: values[match.group(1)], template)
