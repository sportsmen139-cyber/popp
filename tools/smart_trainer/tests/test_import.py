from copy import deepcopy
import csv
import gzip
import json
from pathlib import Path
import tempfile
import unittest

from tools.smart_trainer.audit import Findings, audit
from tools.smart_trainer.catalog import equipment_options, normalize, preview_catalog
from tools.smart_trainer.compatibility import build_compatibility
from tools.smart_trainer.formulas import LookupAudit, arithmetic, check_formulas, check_volume
from tools.smart_trainer.import_preview import artifacts, csv_bytes, run, write_immutable
from tools.smart_trainer.mapping import validate_mapping
from tools.smart_trainer.views import check_views
from tools.smart_trainer.xlsx_source import SourceError, canonical, digest, read_xlsx, translate_formula
from .fixtures import book, cell, record, xlsx_bytes


class ReaderTests(unittest.TestCase):
    def read(self, payload):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'synthetic.xlsx'
            path.write_bytes(payload)
            return read_xlsx(path)

    def test_real_zip_and_unicode_cells(self):
        payload = xlsx_bytes('<c r="A1" t="inlineStr"><is><t>Тест &amp; 😀</t></is></c><c r="B1"><v>1.25</v></c>')
        w = self.read(payload)
        self.assertEqual(w.sha256, digest(payload))
        self.assertEqual(w.sheets['Synthetic'].cells['A1'].value, 'Тест & 😀')
        self.assertEqual(w.sheets['Synthetic'].cells['B1'].value, 1.25)

    def test_formula_empty_cache_is_not_zero(self):
        w = self.read(xlsx_bytes('<c r="A1"><f>1+1</f><v/></c><c r="B1"><v>0</v></c>'))
        self.assertIsNone(w.sheets['Synthetic'].cells['A1'].value)
        self.assertEqual(w.sheets['Synthetic'].cells['A1'].cache_status, 'empty')
        self.assertEqual(w.sheets['Synthetic'].cells['B1'].value, 0)

    def test_shared_formulas_preserve_raw_and_expand_references(self):
        w = self.read(xlsx_bytes('<c r="A1"><f t="shared" si="0" ref="A1:B1">C1+$D$2</f><v>3</v></c><c r="B1"><f t="shared" si="0"/><v>4</v></c>'))
        value = w.sheets['Synthetic'].cells['B1']
        self.assertEqual(value.formula, '')
        self.assertEqual(value.expanded_formula, 'D1+$D$2')
        self.assertEqual(value.value, 4)

    def test_translation_does_not_shift_literals_or_absolute_references(self):
        self.assertEqual(translate_formula('IF(A1="B2",$C1+D$2+\'Sheet1\'!E1,0)', 'A1', 'B2'), 'IF(B2="B2",$C2+E$2+\'Sheet1\'!F2,0)')

    def test_orphan_shared_formula_fails(self):
        with self.assertRaises(SourceError):
            self.read(xlsx_bytes('<c r="A1"><f t="shared" si="4"/><v>0</v></c>'))

    def test_missing_cache_and_excel_error_are_retained(self):
        w = self.read(xlsx_bytes('<c r="A1"><f>1/0</f></c><c r="B1" t="e"><v>#REF!</v></c>'))
        self.assertEqual(w.sheets['Synthetic'].cells['A1'].cache_status, 'missing')
        self.assertEqual(w.sheets['Synthetic'].cells['B1'].value, '#REF!')

    def test_shared_strings_and_false_boolean(self):
        w = self.read(xlsx_bytes('<c r="A1" t="s"><v>0</v></c><c r="B1" t="b"><v>0</v></c>', {'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Текст</t></si></sst>'}))
        self.assertEqual(w.sheets['Synthetic'].cells['A1'].value, 'Текст')
        self.assertIs(w.sheets['Synthetic'].cells['B1'].value, False)

    def test_negative_shared_string_index_and_outside_excel_coordinates_are_refused(self):
        for payload in [xlsx_bytes('<c r="A1" t="s"><v>-1</v></c>', {'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Synthetic</t></si></sst>'}), xlsx_bytes('<c r="XFE1"><v>1</v></c>')]:
            with self.subTest(), self.assertRaises(SourceError):
                self.read(payload)

    def test_non_workbook_is_refused(self):
        with self.assertRaises(SourceError):
            self.read(b'not an xlsx')

    def test_empty_workbook_is_refused(self):
        with self.assertRaises(SourceError):
            self.read(xlsx_bytes(extras={'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>'}))

    def test_duplicate_cell_is_refused(self):
        with self.assertRaises(SourceError):
            self.read(xlsx_bytes('<c r="A1"><v>1</v></c><c r="A1"><v>2</v></c>'))

    def test_zip_traversal_macro_and_external_worksheet_are_refused(self):
        for payload in [xlsx_bytes(extras={'../escape.xml': '<x/>'}), xlsx_bytes(extras={'xl/vbaProject.bin': b'fake'}), xlsx_bytes(external=True)]:
            with self.subTest(), self.assertRaises(SourceError):
                self.read(payload)

    def test_dtd_and_nonfinite_numbers_are_refused(self):
        for payload in [xlsx_bytes(extras={'bad.xml': '<!DOCTYPE x [<!ENTITY y "x">]><x>&y;</x>'}), xlsx_bytes('<c r="A1"><v>NaN</v></c>')]:
            with self.subTest(), self.assertRaises(SourceError):
                self.read(payload)

    def test_confidentiality_scan_is_redacted(self):
        w = self.read(xlsx_bytes('<c r="A1" t="inlineStr"><is><t>synthetic@example.invalid</t></is></c>'))
        self.assertEqual(w.privacy_findings[0]['rule'], 'email')
        self.assertNotIn('synthetic@', canonical(w.privacy_findings).decode())


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.w = book()
        self.t = normalize(self.w)

    def test_all_142_sheets_and_flat_rows_are_retained(self):
        self.assertEqual(len(self.w.sheets), 142)
        summary, findings, _, _ = audit(self.w, self.t)
        self.assertEqual(summary['tables']['slots']['rows'], 1)
        self.assertEqual(findings.result(), [])

    def test_header_drift_and_unknown_data_columns_are_refused(self):
        self.w.sheets['12_Упражнения'].cells['A4'] = cell('A4', 'different_id')
        with self.assertRaises(SourceError):
            normalize(self.w)
        self.w = book()
        self.w.sheets['12_Упражнения'].cells['AA5'] = cell('AA5', 'unexpected')
        with self.assertRaises(SourceError):
            normalize(self.w)

    def test_missing_values_invalid_ids_duplicate_ids_and_versions_are_refused(self):
        for change in [lambda t: t['slots'][0].update(sets=None), lambda t: t['exercises'][0].update(exercise_id='bad'), lambda t: t['exercises'].append(deepcopy(t['exercises'][0])), lambda t: t['exercises'][0].update(version=-1)]:
            t = deepcopy(self.t)
            change(t)
            with self.subTest(), self.assertRaises(SourceError):
                audit(self.w, t)

    def test_dangling_and_wrong_version_references_are_diagnostics(self):
        self.t['slots'][0]['exercise_version'] = 2
        _, findings, _, _ = audit(self.w, self.t)
        self.assertIn('VERSION_MISMATCH', {g['code'] for g in findings.result()})
        self.t['slots'][0]['exercise_id'] = 'EX_999999'
        _, findings, _, _ = audit(self.w, self.t)
        self.assertIn('DANGLING_REFERENCE', {g['code'] for g in findings.result()})

    def test_text_and_date_types_are_not_silently_coerced(self):
        for change in [lambda t: t['exercises'][0].update(setup=123), lambda t: t['reviews'][0].update(reviewed_at='not a date')]:
            t = deepcopy(self.t)
            change(t)
            with self.subTest(), self.assertRaises(SourceError):
                audit(self.w, t)

    def test_duplicate_supporting_family_key_is_detected(self):
        from .fixtures import add_rows
        add_rows(self.w.sheets['04_Семейства'], [['FAM_000001', 'SQUAT']], start=5)
        _, findings, _, _ = audit(self.w, self.t)
        self.assertIn('INVALID_SUPPORTING_KEY', {g['code'] for g in findings.result()})

    def test_program_phase_gaps_and_duplicate_slot_order_are_detected(self):
        self.t['sessions'][0]['phase_week_start'] = 2
        self.t['slots'][0]['order_index'] = 2
        _, findings, _, _ = audit(self.w, self.t)
        codes = {g['code'] for g in findings.result()}
        self.assertIn('PHASE_COVERAGE_GAP_OR_OVERLAP', codes)
        self.assertIn('SLOT_ORDER_GAP_OR_DUPLICATE', codes)

    def test_unit_conflict_is_retained_without_inventing_repetitions(self):
        self.t['slots'][0].update(rep_min=None, rep_max=None, time_seconds=20)
        _, findings, _, _ = audit(self.w, self.t)
        self.assertIn('PRESCRIPTION_UNIT_MISMATCH', {g['code'] for g in findings.result()})
        self.assertIsNone(self.t['slots'][0]['rep_min'])

    def test_review_and_rejected_statuses_never_become_approved_or_published(self):
        self.t['exercises'][0]['review_status'] = 'REJECTED'
        result = preview_catalog(self.t)
        self.assertEqual(result['exercises'][0]['record']['review_status'], 'REJECTED')
        self.assertEqual(result['exercises'][0]['stage'], 'imported')
        self.assertEqual(result['publication'], 'disabled')
        self.assertEqual(result['programs'][0]['record']['review_status'], 'NEEDS_REVIEW')

    def test_equipment_is_or_of_and_without_unknown_to_empty_conversion(self):
        rows = [dict(relation_type='EQUIPMENT_REQUIRED', source_id='EX_TEST', source_version=1, requirement_group=g, target_id=e, link_id=e, review_status='NEEDS_REVIEW') for g, e in [('A', 'bar'), ('A', 'bench'), ('B', 'machine')]]
        result = equipment_options(rows, 'EX_TEST', 1)
        self.assertEqual([[x['equipment_id'] for x in kit['all_of']] for kit in result['options']], [['bar', 'bench'], ['machine']])
        self.assertEqual(equipment_options([], 'EX_TEST', 1), {'state': 'unknown'})
        rows[0]['requirement_group'] = None
        self.assertEqual(equipment_options(rows, 'EX_TEST', 1)['state'], 'unresolved')

    def test_directed_alternatives_are_not_reversed_or_transitively_expanded(self):
        self.t['alternatives'] = [{'source_exercise_id': 'A', 'target_exercise_id': 'B', 'review_status': 'NEEDS_REVIEW'}, {'source_exercise_id': 'B', 'target_exercise_id': 'C', 'review_status': 'REJECTED'}]
        self.assertEqual(preview_catalog(self.t)['lossless_tables']['alternatives'], self.t['alternatives'])
        self.assertEqual(len(self.t['alternatives']), 2)

    def test_full_cycle_and_prescriptions_remain_nested_and_unactivated(self):
        preview = preview_catalog(self.t)
        session = preview['programs'][0]['phases'][0]['sessions'][0]
        self.assertEqual(session['record']['phase_week_end'], 2)
        self.assertEqual(session['slots'][0]['rir_min'], 2)
        compatibility, coverage, _ = build_compatibility(self.t)
        self.assertIn('FREQUENCY_1_NOT_SUPPORTED', compatibility[0]['blockers'])
        self.assertFalse(compatibility[0]['engine_compatible'])
        self.assertEqual(sum(c['source_count'] for c in coverage), 1)

    def test_volume_accounting_matches_a_simple_direct_case_and_keeps_unknown_coefficients(self):
        findings = Findings()
        stats = check_volume(self.w, self.t, findings)
        self.assertEqual(findings.result(), [])
        self.assertEqual(stats['unknown_modelled_sets'], 1)
        self.assertIsNone(self.t['weekly_volume'][0]['indirect_coefficient'])

    def test_artifacts_reconcile_all_cells_formulas_and_source_rows(self):
        summary, findings, _, _ = audit(self.w, self.t)
        payload = artifacts(self.w, self.t, summary, findings)
        raw = json.loads(gzip.decompress(payload['raw-cells.json.gz']))
        self.assertEqual(sum(len(s['cells']) for s in raw['sheets']), sum(len(s.cells) for s in self.w.sheets.values()))
        self.assertEqual(json.loads(payload['catalog.json'])['lossless_tables'], self.t)

    def test_preview_escapes_source_html_and_never_renders_it_as_markup(self):
        self.t['exercises'][0]['name_ru'] = '</script><script>alert(1)</script>'
        payload = artifacts(self.w, self.t, {}, Findings())
        self.assertNotIn(b'</script><script>alert', payload['index.html'])
        self.assertIn(b'\\u003c/script>', payload['index.html'])
        self.assertIn(b'.textContent=', payload['index.html'])

    def test_idempotence_is_byte_exact_and_existing_artifacts_cannot_be_overwritten(self):
        payload = artifacts(self.w, self.t, {}, Findings())
        self.assertEqual(payload, artifacts(self.w, self.t, {}, Findings()))
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'snapshot'
            self.assertTrue(write_immutable(target, payload))
            self.assertFalse(write_immutable(target, payload))
            (target / 'catalog.json').write_text('changed')
            with self.assertRaises(SourceError):
                write_immutable(target, payload)
            self.assertEqual((target / 'catalog.json').read_text(), 'changed')

    def test_csv_reports_cannot_execute_source_spreadsheet_formulas(self):
        result = csv_bytes([{'value': '=HYPERLINK("x")', 'sets': 2}]).decode()
        self.assertIn("'=HYPERLINK", result)
        self.assertIn(',2', result)

    def test_full_content_output_cannot_target_production_paths(self):
        with self.assertRaises(SourceError):
            run('/does/not/exist.xlsx', output_root=Path(__file__).resolve().parents[3] / 'client/src/data')

    def test_views_support_both_exact_lookup_ids_and_direct_row_references(self):
        from .fixtures import add_rows
        sheet = self.w.sheets['34_Synthetic']
        add_rows(sheet, [['Synthetic cycle'], ['PRG_000001'] ], start=1)
        sheet.cells['C4'] = cell('C4', 1, "VLOOKUP(\"SLOT_000001\",'18_Состав_сессий'!$A$5:$Y$1000,7,FALSE)")
        findings = Findings()
        self.assertEqual(check_views(self.w, self.t, findings)['visual_slot_rows'], 1)
        sheet.cells['C4'] = cell('C4', 1, "'18_Состав_сессий'!G5")
        self.assertEqual(check_views(self.w, self.t, Findings())['visual_slot_rows'], 1)


class MappingTests(unittest.TestCase):
    def test_snapshot_coverage_ambiguity_and_history_policy_guards(self):
        w = book()
        t = normalize(w)
        rows = [{'legacy_exercise_id': f'legacy-{n}', 'legacy_name_ru': f'Legacy {n}', 'new_exercise_id': '', 'new_exercise_version': '',
                 'match_type': 'AMBIGUOUS', 'confidence': 'LOW', 'decision': 'KEEP_LEGACY_NO_HISTORY_MERGE',
                 'evidence': 'Synthetic comparison', 'candidate_ids': 'EX_000001', 'source_sha256': w.sha256} for n in range(45)]
        with tempfile.TemporaryDirectory() as folder:
            legacy, mapping = Path(folder) / 'legacy.ts', Path(folder) / 'mapping.csv'
            legacy.write_text('\n'.join(f"    id: '{r['legacy_exercise_id']}',\n    name: '{r['legacy_name_ru']}'," for r in rows))
            def write(values):
                with mapping.open('w', newline='') as stream:
                    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(values)
            write(rows)
            self.assertEqual(validate_mapping(mapping, w, t, legacy)['rows'], 45)
            mutations = [lambda r: r[0].update(source_sha256='a' * 64),
                         lambda r: r.pop(),
                         lambda r: r[0].update(new_exercise_id='EX_000001', new_exercise_version='1'),
                         lambda r: r[0].update(decision='MERGE_HISTORY'),
                         lambda r: r[0].update(match_type='NO_MATCH'),
                         lambda r: r[0].update(evidence='')]
            for mutate in mutations:
                changed = deepcopy(rows)
                mutate(changed)
                write(changed)
                with self.subTest(), self.assertRaises(SourceError):
                    validate_mapping(mapping, w, t, legacy)


class FormulaTests(unittest.TestCase):
    def test_range_excludes_existing_key_is_reported_and_widening_is_not_required_without_need(self):
        w = book()
        w.sheets['18_Состав_сессий'].cells['A1001'] = cell('A1001', 'SLOT_999999')
        w.sheets['18_Состав_сессий'].cells['I1001'] = cell('I1001', 7)
        formula = 'VLOOKUP("SLOT_999999",\'18_Состав_сессий\'!$A$5:$Y$1000,9,FALSE)'
        w.sheets['19_Недельный_объём'].cells['F5'] = cell('F5', 7, formula)
        findings = Findings()
        self.assertEqual(check_formulas(w, findings)['counts']['affected_cells'], 1)
        self.assertEqual(findings.result()[0]['code'], 'FORMULA_LOOKUP_RANGE_EXCLUDES_KEY')
        w.sheets['19_Недельный_объём'].cells['F5'] = cell('F5', 7, formula.replace('$1000', '$1001'))
        self.assertEqual(check_formulas(w, Findings())['counts'].get('affected_cells', 0), 0)

    def test_restricted_arithmetic_rejects_code_execution(self):
        lookup = LookupAudit(book())
        self.assertEqual(arithmetic('2+3*4', lookup, '19_Недельный_объём'), 14)
        with self.assertRaises(ValueError):
            arithmetic('__import__("os").system("true")', lookup, '19_Недельный_объём')


if __name__ == '__main__':
    unittest.main()
