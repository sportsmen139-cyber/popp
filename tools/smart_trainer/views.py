"""Cross-check visual sheets; never import them as duplicate canonical entities."""

from collections import Counter, defaultdict
import re

from .formulas import calls
from .xlsx_source import coordinate


def check_views(workbook, tables, findings):
    programs = {p['program_id']: p for p in tables['programs']}
    exercises = {e['exercise_id']: e for e in tables['exercises']}
    sessions = {s['session_id']: s for s in tables['sessions']}
    slots = defaultdict(set)
    for slot in tables['slots']:
        if slot['session_id'] in sessions:
            slots[sessions[slot['session_id']]['program_id']].add(slot['slot_id'])
    seen_programs = []
    total_slots = 0
    overview_counts = {}
    for sheet in workbook.sheets.values():
        number = int(sheet.name.split('_', 1)[0])
        if 34 <= number <= 141:
            program_id = sheet.cells.get('A2').value if sheet.cells.get('A2') else None
            if program_id not in programs:
                findings.add('VISUAL_UNKNOWN_PROGRAM', sheet=sheet.name, number=2)
                continue
            seen_programs.append(program_id)
            if sheet.cells['A1'].value != programs[program_id]['name_ru']:
                findings.add('VISUAL_PROGRAM_TITLE_STALE', sheet=sheet.name, number=1)
            displayed = []
            for cell in sheet.cells.values():
                row, col = coordinate(cell.ref)
                if col != 3 or row <= 3 or cell.formula is None:
                    continue
                expression = cell.expanded_formula or cell.formula
                for _, _, args in calls(expression):
                    if re.fullmatch(r'"SLOT_[0-9]{6}"', args[0]):
                        displayed.append(args[0].strip('"'))
                direct = re.fullmatch(r"'18_Состав_сессий'!\$?G\$?([0-9]+)", expression)
                if direct:
                    source = workbook.sheets['18_Состав_сессий'].cells.get('A' + direct[1])
                    if source:
                        displayed.append(source.value)
            total_slots += len(displayed)
            if set(displayed) != slots[program_id] or len(displayed) != len(set(displayed)):
                findings.add('VISUAL_SLOT_COVERAGE_MISMATCH', sheet=sheet.name, detail=program_id)
        if 23 <= number <= 33:
            ids = [c.value for c in sheet.cells.values() if coordinate(c.ref)[1] == 1 and isinstance(c.value, str) and re.fullmatch(r'(EX|PRG)_[0-9]{6}', c.value)]
            overview_counts[sheet.name] = len(ids)
            expected = programs if number == 33 else exercises
            if len(set(ids)) != len(ids) or any(id not in expected for id in ids):
                findings.add('OVERVIEW_DUPLICATE_OR_UNKNOWN_ID', sheet=sheet.name)
            if number == 33 and set(ids) != set(programs):
                findings.add('PROGRAM_OVERVIEW_COVERAGE_MISMATCH', sheet=sheet.name)
            if number in (31, 32):
                location = 'HOME' if number == 31 else 'OUTDOOR'
                actual = {r['source_id'] for r in tables['relations'] if r['relation_type'] == 'LOCATION' and r['target_id'] == location and r['source_id'] in exercises and exercises[r['source_id']]['review_status'] != 'REJECTED'}
                if set(ids) != actual:
                    findings.add('LOCATION_OVERVIEW_COVERAGE_MISMATCH', sheet=sheet.name, severity='review', detail=f'IDs in view={len(ids)}, active membership={len(actual)}; missing={";".join(sorted(actual - set(ids)))}; extra={";".join(sorted(set(ids) - actual))}')
    if set(seen_programs) != set(programs) or len(seen_programs) != len(set(seen_programs)):
        findings.add('VISUAL_PROGRAM_COVERAGE_MISMATCH')
    return {'visual_programs': len(seen_programs), 'visual_slot_rows': total_slots,
            'overview_rows': overview_counts, 'canonical_entities_imported_from_views': 0}
