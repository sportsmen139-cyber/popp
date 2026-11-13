import io
import zipfile

from tools.smart_trainer.catalog import SCHEMA
from tools.smart_trainer.xlsx_source import Cell, Sheet, Workbook, col_letters


def cell(ref, value, formula=None):
    return Cell(ref, value, 'str' if isinstance(value, str) else 'n', str(value) if value is not None else None,
                formula, {}, 'present' if value is not None else 'empty' if formula is not None else None)


def add_rows(sheet, rows, start=4):
    for r, values in enumerate(rows, start):
        for c, value in enumerate(values, 1):
            if value is not None:
                ref = col_letters(c) + str(r)
                sheet.cells[ref] = cell(ref, value)


def record(sheet, values, row=5):
    fields = SCHEMA['sheets'][sheet.name]
    values = dict(values)
    for field, definition in SCHEMA['fields'][sheet.name].items():
        if field not in values and definition['required'] == 'YES':
            kind = definition['type']
            values[field] = 1 if kind in ('INTEGER', 'DECIMAL') else SCHEMA['enums'][definition['dictionary']][0] if kind == 'ENUM' and definition['dictionary'] in SCHEMA['enums'] else 'Synthetic ' + field
    add_rows(sheet, [[values.get(field) for field in fields]], start=row)


def book():
    names = {int(name[:2]): name for name in SCHEMA['sheets']}
    names.update({0: '00_Навигатор', 2: '02_Поля_данных', 3: '03_Паттерны', 4: '04_Семейства', 8: '08_Типы_программ', 11: '11_Справочники', 21: '21_Источники'})
    sheets = {names.get(n, f'{n:02}_Synthetic'): Sheet(names.get(n, f'{n:02}_Synthetic'), 'visible', {}, [], []) for n in range(142)}
    for name, fields in SCHEMA['sheets'].items():
        add_rows(sheets[name], [fields])
    sheets['00_Навигатор'].cells['A2'] = cell('A2', 'Synthetic document date label')
    add_rows(sheets['03_Паттерны'], [['movement', 'SQUAT', 'synthetic']])
    add_rows(sheets['04_Семейства'], [['FAM_000001', 'SQUAT']])
    add_rows(sheets['08_Типы_программ'], [['Тип сессии', 'FULL_BODY']])
    add_rows(sheets['21_Источники'], [['PROJECT', 'Synthetic project provenance']])
    dictionaries = {'review_status': ['NEEDS_REVIEW', 'REJECTED', 'APPROVED'], 'location': ['GYM', 'HOME', 'OUTDOOR'],
                    'muscle_role': ['PRIMARY', 'SECONDARY', 'STABILIZER'], 'volume_role': ['DIRECT', 'INDIRECT', 'STABILIZATION'],
                    'level': ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], 'priority': ['PRIMARY', 'SECONDARY', 'ACCESSORY']}
    add_rows(sheets['11_Справочники'], [[k, v] for k, values in dictionaries.items() for v in values])
    specs = []
    for name in SCHEMA['sheets']:
        for field, kind in [('review_status', 'ENUM')]:
            specs.append([name, field, field, kind, 'YES', field])
        if name.startswith(('12_', '13_', '16_')):
            specs.append([name, 'version', 'version', 'INTEGER', 'YES'])
    for field in ('sets', 'order_index', 'minimum_sets'):
        specs.append(['18_Состав_сессий', field, field, 'INTEGER', 'YES'])
    add_rows(sheets['02_Поля_данных'], specs)
    record(sheets['12_Упражнения'], dict(exercise_id='EX_000001', name_ru='Synthetic exercise', version=1, concept_id='CON_000001', family_id='FAM_000001', primary_pattern='SQUAT', minimum_level='BEGINNER', measurement_unit='REPS', review_status='NEEDS_REVIEW'))
    record(sheets['13_Биомеханика'], dict(exercise_id='EX_000001', version=1, review_status='NEEDS_REVIEW'))
    relations = [
        dict(relation_type='CONCEPT', source_id='CON_000001'),
        dict(relation_type='MUSCLE_DEF', source_id='MUS_000001'),
        dict(relation_type='EQUIPMENT_DEF', source_id='EQ_000001'),
        dict(relation_type='MUSCLE', source_id='EX_000001', target_id='MUS_000001', role='PRIMARY', volume_role='DIRECT'),
        dict(relation_type='LOCATION', source_id='EX_000001', target_id='GYM'),
        dict(relation_type='LOCATION', source_id='PRG_000001', target_id='GYM'),
        dict(relation_type='EQUIPMENT_REQUIRED', source_id='EX_000001', target_id='EQ_000001', requirement_group='KIT_01'),
        dict(relation_type='EQUIPMENT_REQUIRED', source_id='PRG_000001', target_id='EQ_000001', requirement_group='KIT_01'),
    ]
    for n, data in enumerate(relations, 1):
        record(sheets['14_Связи'], dict(link_id=f'LNK_{n:06}', source_version=1, review_status='NEEDS_REVIEW', **data), row=n + 4)
    record(sheets['16_Программы'], dict(program_id='PRG_000001', name_ru='Synthetic cycle', version=1, primary_location='GYM', level='BEGINNER', primary_goal='GENERAL_FITNESS', days_per_week=1, cycle_length_days=7, duration_weeks=2, format='FULL_BODY', split_structure='FULL_BODY', delivery_method='STRAIGHT_SETS', context='STANDARD', review_status='NEEDS_REVIEW'))
    record(sheets['17_Сессии'], dict(session_id='SES_000001', program_id='PRG_000001', program_version=1, phase_id='PHASE_01', phase_name='Synthetic phase', phase_week_start=1, phase_week_end=2, cycle_day=1, review_status='NEEDS_REVIEW'))
    record(sheets['18_Состав_сессий'], dict(slot_id='SLOT_000001', session_id='SES_000001', exercise_id='EX_000001', exercise_version=1, order_index=1, priority='PRIMARY', sets=2, rep_min=8, rep_max=12, rir_min=2, rir_max=3, rest_min_seconds=90, rest_max_seconds=120, minimum_sets=1, can_skip='NO', review_status='NEEDS_REVIEW'))
    record(sheets['19_Недельный_объём'], dict(volume_id='VOL_000001', program_id='PRG_000001', phase_id='PHASE_01', target_id='MUS_000001', target_role='PRIMARY_TARGET', direct_sets=2, indirect_sets=0, specific_practice_sets=0, sessions_per_week=1, target_min=2, target_max=2, review_status='NEEDS_REVIEW'))
    record(sheets['20_Проверка'], dict(review_id='REV_000001', entity_type='EXERCISE', entity_id='EX_000001', entity_version=1, review_status='NEEDS_REVIEW'))
    return Workbook('f' * 64, 0, sheets, {}, [], {})


def xlsx_bytes(cells='<c r="A1" t="inlineStr"><is><t>Synthetic</t></is></c>', extras=None, external=False):
    buffer = io.BytesIO()
    parts = {
        'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="r1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"' + (' TargetMode="External"' if external else '') + '/></Relationships>',
        'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">' + cells + '</row></sheetData></worksheet>',
    }
    parts.update(extras or {})
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, value)
    return buffer.getvalue()
