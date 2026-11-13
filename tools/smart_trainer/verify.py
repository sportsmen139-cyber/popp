"""Verify a real imported snapshot, its bytes, all normalized cells and tree counts."""

import argparse
from collections import Counter
import gzip
import json
from pathlib import Path

from .catalog import SCHEMA, TABLE_NAMES
from .xlsx_source import digest


def verify(folder, compare_openpyxl=False):
    folder = Path(folder)
    manifest = json.loads((folder / 'manifest.json').read_text())
    source = folder / 'source.xlsx'
    assert digest(source.read_bytes()) == manifest['source_sha256'], 'Original XLSX changed'
    for name, checksum in manifest['files_sha256'].items():
        assert digest((folder / name).read_bytes()) == checksum, name
    catalog = json.loads((folder / 'catalog.json').read_text())
    raw = json.loads(gzip.decompress((folder / 'raw-cells.json.gz').read_bytes()))
    sheets = {s['name']: {c['ref']: c for c in s['cells']} for s in raw['sheets']}
    assert len(sheets) == 142
    checks = ['Original XLSX SHA256', 'Every artifact SHA256', '142 raw sheets preserved']
    cell_count = sum(len(s) for s in sheets.values())
    assert cell_count == manifest['lossless_stored_cells']
    for name, fields in SCHEMA['sheets'].items():
        rows = catalog['lossless_tables'][TABLE_NAMES[name]]
        assert len(rows) == manifest['row_counts'][TABLE_NAMES[name]]
        assert dict(Counter(r['review_status'] for r in rows)) == manifest['review_status_counts'][TABLE_NAMES[name]]
        for row in rows:
            assert row['_source']['sheet'] == name
            number = row['_source']['row']
            for col, field in enumerate(fields, 1):
                cell = sheets[name].get(chr(64 + col) + str(number))
                assert row[field] == (cell['value'] if cell else None), (name, number, field)
        checks.append('All normalized fields and review states: ' + name)
    for entity in ('exercises', 'programs'):
        assert len(catalog[entity]) == manifest['row_counts'][entity]
        assert all(r['stage'] == 'imported' for r in catalog[entity])
    expected_phases = {(s['program_id'], s['program_version'], s['phase_id']) for s in catalog['lossless_tables']['sessions']}
    assert sum(len(p['phases']) for p in catalog['programs']) == len(expected_phases)
    sessions = [s for p in catalog['programs'] for phase in p['phases'] for s in phase['sessions']]
    assert len(sessions) == manifest['row_counts']['sessions']
    assert sum(len(s['slots']) for s in sessions) == manifest['row_counts']['slots']
    assert len({slot['slot_id'] for s in sessions for slot in s['slots']}) == manifest['row_counts']['slots']
    assert catalog['publication'] == 'disabled' and manifest['publication_enabled'] is False
    checks.extend(['All phases/sessions/slots retained exactly once', 'Imported status only; publication disabled'])
    compared = formulas = 0
    if compare_openpyxl:
        # Optional independent implementation, not an importer runtime dependency.
        from openpyxl import load_workbook
        values = load_workbook(source, read_only=True, data_only=True, keep_links=False)
        for sheet in values:
            for row in sheet.iter_rows():
                for cell in row:
                    ref = getattr(cell, 'coordinate', None)
                    if ref in sheets[sheet.title]:
                        assert cell.value == sheets[sheet.title][ref]['value'], (sheet.title, ref, 'value')
                        compared += 1
        values.close()
        expressions = load_workbook(source, read_only=True, data_only=False, keep_links=False)
        for sheet in expressions:
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.data_type == 'f':
                        original = sheets[sheet.title][cell.coordinate]
                        assert cell.value == '=' + (original['expanded_formula'] or original['formula']), (sheet.title, cell.coordinate, 'formula')
                        formulas += 1
        expressions.close()
        checks.append('Independent openpyxl values and expanded shared formulas')
    return {'checks': checks, 'raw_cells': cell_count, 'independently_compared_values': compared,
            'independently_compared_formulas': formulas, 'source_sha256': manifest['source_sha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot')
    parser.add_argument('--compare-openpyxl', action='store_true')
    parser.add_argument('--report')
    args = parser.parse_args()
    result = verify(args.snapshot, args.compare_openpyxl)
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        Path(args.report).write_text(text)
    print(text)
