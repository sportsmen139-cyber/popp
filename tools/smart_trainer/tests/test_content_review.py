from copy import deepcopy
import unittest

from tools.smart_trainer.content_review import compile_library, render_html, similarity_screen, text_hash, validate_cards
from tools.smart_trainer.exercise_library import ExerciseLibrary
from tools.smart_trainer.xlsx_source import SourceError, canonical, digest


def fixture(unit='REPS', prescription='REPS'):
    item = {'record': {'exercise_id': 'EX_000001', 'version': 1, 'name_ru': 'Synthetic movement',
        'review_status': 'NEEDS_REVIEW', 'measurement_unit': unit, 'minimum_level': 'BEGINNER',
        'setup': 'private reference expression one two three four five six seven eight nine'},
        'biomechanics': [{'exercise_id': 'EX_000001', 'version': 1, 'laterality': 'BILATERAL'}],
        'equipment': {'state': 'declared', 'options': [{'all_of': [{'equipment_id': 'EQ_000001'}]}]},
        'relations': [{'relation_type': 'MUSCLE', 'role': 'PRIMARY', 'value_ru': 'Synthetic muscle'}]}
    slot = {'slot_id': 'SLOT_SYNTHETIC', '_source': {'sheet': 'Synthetic', 'row': 1},
        'exercise_id': 'EX_000001', 'exercise_version': 1, 'sets': 1,
        'rep_min': 8 if prescription == 'REPS' else None, 'rep_max': 12 if prescription == 'REPS' else None,
        'time_seconds': 20 if prescription == 'SECONDS' else None,
        'distance_meters': 5 if prescription == 'METERS' else None}
    catalog = {'exercises': [item], 'programs': [{'record': {'program_id': 'PRG_000001'},
        'phases': [{'phase_id': 'PHASE_SYNTHETIC', 'sessions': [{'slots': [slot]}]}]}],
        'lossless_tables': {'relations': [{'relation_type': 'EQUIPMENT_DEF', 'source_id': 'EQ_000001', 'value_ru': 'Synthetic equipment'}]}}
    card = {'exercise_id': 'EX_000001', 'exercise_version': 1, 'name_ru': 'Synthetic movement',
        'equipment': 'Synthetic equipment', 'start': 'Independent start.',
        'steps': ['Independent first step.', 'Independent second step.', 'Independent return.'],
        'errors': ['Synthetic error one.', 'Synthetic error two.'], 'safety': 'Synthetic safety.',
        'counting': {'REPS': 'Один полный цикл — повтор.', 'SECONDS': 'Секунды удержания.', 'METERS': 'Пройденные метры.'}[unit],
        'conditions': 'Synthetic condition.', 'content_revision': 'synthetic-text-1',
        'source_record_hash': digest(canonical(item))}
    return catalog, ExerciseLibrary(catalog, 'a' * 64), card


class ContentReviewTests(unittest.TestCase):
    def test_exact_source_ids_versions_and_protected_packet_are_immutable(self):
        catalog, library, card = fixture()
        original = canonical(card)
        result, conflicts, _ = compile_library([card], library, catalog, protected=[deepcopy(card)])
        self.assertEqual(result['summary']['recorded_approvals'], 0)
        self.assertEqual(result['initial_reviews'], [])
        self.assertEqual(result['entries'][0]['card'], card)
        self.assertEqual(conflicts, [])
        self.assertEqual(canonical(card), original)
        altered = deepcopy(card); altered['start'] = 'Changed after owner review.'
        with self.assertRaises(SourceError): validate_cards([altered], library, [card])
        with self.assertRaises(SourceError): validate_cards([card, card], library)
        altered = deepcopy(card); altered['exercise_version'] = 2
        with self.assertRaises(SourceError): validate_cards([altered], library)

    def test_omitted_equipment_empty_fields_and_media_fail_closed(self):
        catalog, library, card = fixture()
        for patch in ({'equipment': 'No equipment invented'}, {'safety': ''}, {'conditions': ''}, {'media': ['unapproved.mp4']}, {'errors': ['One only']}):
            altered = {**card, **patch}
            with self.assertRaises(SourceError): compile_library([altered], library, catalog)

    def test_timed_and_distance_counting_cannot_silently_become_repetitions(self):
        for unit in ('SECONDS', 'METERS'):
            catalog, library, card = fixture(unit, unit)
            compile_library([card], library, catalog)
            with self.assertRaises(SourceError): compile_library([{**card, 'counting': 'One repetition.'}], library, catalog)

    def test_program_unit_conflict_is_reported_without_conversion_or_approval(self):
        catalog, library, card = fixture('REPS', 'SECONDS'); before = canonical(catalog)
        model, conflicts, _ = compile_library([card], library, catalog)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]['source_prescription']['time_seconds'], 20)
        self.assertEqual(conflicts[0]['exercise_unit'], 'REPS')
        self.assertIn('PROGRAM_UNIT_CONFLICT', model['entries'][0]['flags'])
        self.assertEqual(canonical(catalog), before)

    def test_wording_screen_checks_source_narrative_not_exercise_names_or_gear(self):
        catalog, _, card = fixture()
        self.assertEqual(similarity_screen([card], catalog), {})
        changed = {**card, 'start': catalog['exercises'][0]['record']['setup']}
        self.assertIn('EX_000001', similarity_screen([changed], catalog))
        self.assertNotEqual(text_hash(card), text_hash(changed))

    def test_embedded_draft_and_comments_cannot_break_out_as_html_or_scripts(self):
        catalog, library, card = fixture()
        dangerous = {**card, 'start': '{{SCRIPT}}</script><img src="https://invalid.example/leak" onerror="alert(1)">'}
        model, _, _ = compile_library([dangerous], library, catalog)
        html = render_html(model)
        self.assertIn("connect-src &#x27;none&#x27;", html)
        self.assertNotIn('</script><img', html)
        self.assertIn('\\u003c/script>', html)
        self.assertIn('{{SCRIPT}}\\u003c/script>', html)
        self.assertEqual(model['summary']['publication_performed'], False)
