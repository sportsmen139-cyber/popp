"""Private integration adapter for selected source programs; reuses the existing Engine.

No source edits, generated approvals, automatic unit conversion or cloud activation.
Full program payloads are served only by the loopback review service, never bundled
into the public React build or written to Git.
"""

import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys
import webbrowser

from .author_corrections import deadbug_projection
from .engine.contracts import readiness
from .engine.declarations import accepted_declaration
from .engine.scope import execution_scope, source_overview
from .engine.service import PilotService
from .engine.storage import EventLog
from .exercise_library import ExerciseLibrary
from .import_preview import ROOT
from .review.pilot import load_pilot, structural_errors
from .review.workflow import ReviewError
from .xlsx_source import SourceError, canonical, digest

PROGRAMS = ('PRG_000022', 'PRG_000030', 'PRG_000032', 'PRG_000038', 'PRG_000063', 'PRG_000060')
TWO_DAY_PROGRAMS = ('PRG_000001', 'PRG_000013', 'PRG_000021')
BATCHES = {'six': PROGRAMS, 'two-day': TWO_DAY_PROGRAMS}
GOALS = {'GENERAL_FITNESS': 'general_fitness', 'HYPERTROPHY': 'hypertrophy'}
TARGETS = {'LEGS': 'legs', 'DELTS': 'shoulders', 'ARMS': 'arms', 'QUADS': 'quads',
           'HAMSTRINGS': 'hamstrings', 'DELTS_ARMS': 'shoulders_arms'}
LABELS = {
    'source_dose_unit_conflict': 'В программе и карточке упражнения разные единицы назначения.',
    'source_structure_invalid': 'Структурная проверка исходного назначения не пройдена.',
    'seconds_logger_not_supported': 'Изолированный Engine пока не исполняет позиции в секундах.',
    'source_schedule_not_supported': 'Подготовлены графики 1/4 для двух занятий и 1/3/5 для трёх; этот график ещё не допущен.',
    'author_declaration_missing': 'В журнале нет общего заявления владельца по этому источнику.',
    'technical_policy_unconfirmed': 'Техническая политика этого назначения не подтверждена.',
    'engine_support_not_verified': 'Нет подтверждения совместимости точной версии Engine с этой программой.',
    'publication_rights_not_confirmed': 'Нет допуска к распространению полного пакета: отдельно проверяются тексты и медиа.',
    'per_side_logger_not_supported': 'Нужен подтверждённый раздельный учёт сторон. Суммарный ввод не подменяет его.',
    'cycle_policy_unresolved': 'Условия перехода фаз, недель и обработки пропусков ещё не оформлены для этой программы.',
    'progression_policy_unresolved': 'Техническая политика прогрессии рабочих весов ещё не оформлена.',
    'program_equipment_contract_unresolved': 'Требования к оборудованию программы не подтверждены.',
}


def reject(code, message):
    raise ReviewError(code, message)


def verify_registered_artifacts(snapshot, receipt):
    """Compare registered bytes; allow only the proven gzip OS-byte variation.

    Python 3.11/3.12 gzip.compress(mtime=0) delegates to platform zlib. The
    registered Linux file has OS=3; macOS emits 19, later Python may emit 255.
    No decompression/recompression, source edits or arbitrary hash replacement.
    """
    expected = receipt['artifacts_sha256']
    if digest((snapshot / 'catalog.json').read_bytes()) != expected['catalog.json']:
        raise SourceError('Каталог отличается от зарегистрированного SHA.')
    raw = (snapshot / 'raw-cells.json.gz').read_bytes()
    raw_hash = digest(raw)
    platform_only = raw_hash != expected['raw-cells.json.gz']
    if platform_only and not (len(raw) > 10 and raw[:3] == b'\x1f\x8b\x08' and raw[9] in (19, 255) and
                              digest(raw[:9] + b'\x03' + raw[10:]) == expected['raw-cells.json.gz']):
        raise SourceError('Raw cells отличаются от зарегистрированного содержимого.')
    manifest_bytes = (snapshot / 'manifest.json').read_bytes()
    if digest(manifest_bytes) != expected['manifest.json']:
        if not platform_only:
            raise SourceError('Manifest отличается от зарегистрированного SHA.')
        manifest = json.loads(manifest_bytes)
        if canonical(manifest) != manifest_bytes or manifest['files_sha256']['raw-cells.json.gz'] != raw_hash:
            raise SourceError('Manifest не соответствует локальному raw artifact.')
        manifest['files_sha256']['raw-cells.json.gz'] = expected['raw-cells.json.gz']
        if digest(canonical(manifest)) != expected['manifest.json']:
            raise SourceError('Manifest отличается не только платформенной checksum gzip.')
    return {'gzip_os_byte_only': platform_only, 'raw_actual_sha256': raw_hash,
            'raw_registered_sha256': expected['raw-cells.json.gz'], 'all_content_bytes_verified': True}


class AuthorPrograms:
    def __init__(self, bundles, private_folder, contracts=None, *, prepare_correction=False):
        self.folder = Path(private_folder)
        self.originals = {b['program_id']: deepcopy(b) for b in bundles}
        self.bundles = {pid: deadbug_projection(b) if prepare_correction and pid in PROGRAMS else deepcopy(b)
                        for pid, b in self.originals.items()}
        self.contracts = deepcopy(contracts or {})
        self.author_log = EventLog(self.folder / 'author-statements.json', 'author_content_declarations')
        self.services = {}

    @classmethod
    def registered(cls, contracts_folder=None, *, batch='six'):
        if batch not in BATCHES:
            raise SourceError('Неизвестная группа программ.')
        selected = BATCHES[batch]
        receipt = json.loads((ROOT / 'docs/smart-trainer/audit/snapshot-receipt.json').read_text())
        snapshot = ROOT / '.local/smart-trainer' / receipt['source_sha256'] / 'schema-1-importer-1.0.0'
        if not (snapshot / 'source.xlsx').is_file():
            raise SourceError('Нужен оригинальный XLSX: зарегистрированный локальный snapshot отсутствует.')
        if digest((snapshot / 'source.xlsx').read_bytes()) != receipt['source_sha256']:
            raise SourceError('SHA исходного XLSX отличается от зарегистрированного. Данные не восстановлены по памяти.')
        artifact_verification = verify_registered_artifacts(snapshot, receipt)
        policies = {}
        if contracts_folder:
            for pid in selected:
                path = Path(contracts_folder) / (pid + '.json')
                if path.is_file():
                    policies[pid] = json.loads(path.read_text())
        result = cls([load_pilot(snapshot, pid, 1) for pid in selected],
                     ROOT / '.local/smart-trainer/trainer-review/journals', policies, prepare_correction=True)
        result.artifact_verification = artifact_verification
        result.batch = batch
        result.library = ExerciseLibrary(json.loads((snapshot / 'catalog.json').read_text()), receipt['source_sha256'])
        return result

    def bundle(self, pid):
        if pid not in self.bundles:
            reject('program_not_in_batch', 'Программа не входит в подготовленную группу.')
        return self.bundles[pid]

    def eligibility(self, pid, profile):
        record = self.bundle(pid)['units'][self.bundle(pid)['program_key']]['payload']['record']
        target = TARGETS.get(record['specialization'])
        if record['primary_goal'] not in GOALS or (record['specialization'] != 'NONE' and target is None):
            reject('unsupported_source_goal', 'Цель источника не входит в подготовленную группу.')
        expected = {'environment': record['primary_location'].lower(), 'daysPerWeek': str(record['days_per_week']),
                    'level': record['level'].lower(), 'goalType': GOALS[record['primary_goal']],
                    'targetType': 'muscle_group' if target else 'whole_body', 'targetId': target}
        if profile != expected:
            reject('profile_not_eligible', 'Уровень, среда, частота или специализация не соответствуют этой авторской программе.')

    def inspect(self, pid):
        full = self.bundle(pid)
        payload = full['units'][full['program_key']]['payload']
        core = {u['id']: u for u in full['units'].values() if u['kind'] == 'exercise' and u['role'] == 'core'}
        slots = [s for phase in payload['phases'] for session in phase['sessions'] for s in session['slots']]
        conflicts = []
        for slot in slots:
            unit = core[slot['exercise_id']]
            kinds = [name for name, field in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'), ('METERS', 'distance_meters')] if slot[field] is not None]
            if kinds != [unit['payload']['record']['measurement_unit']]:
                conflicts.append({'slot_id': slot['slot_id'], 'exercise_id': unit['id'], 'exercise_version': unit['version'],
                                  'exercise_unit': unit['payload']['record']['measurement_unit'], 'prescribed_units': kinds,
                                  'source': slot['_source']})
        structural = structural_errors(full)
        blockers = []
        if conflicts:
            blockers.append('source_dose_unit_conflict')
        if structural:
            blockers.append('source_structure_invalid')
        if any(s['time_seconds'] is not None or s['distance_meters'] is not None for s in slots):
            blockers.append('seconds_logger_not_supported')
        sided = [u['id'] for u in core.values() if u['id'] == 'EX_000135' or any(
            row.get('laterality') in ('UNILATERAL', 'ALTERNATING') for row in u['payload'].get('biomechanics', []))]
        if full.get('methodical_corrections') or sided:
            blockers.append('per_side_logger_not_supported')
        days = {2: [1, 4], 3: [1, 3, 5]}.get(payload['record']['days_per_week'])
        if (payload['record']['cycle_length_days'] != 7 or days is None or
                any([s['record']['cycle_day'] for s in phase['sessions']] != days for phase in payload['phases'])):
            blockers.append('source_schedule_not_supported')
        declaration = accepted_declaration(self.author_log.read(), source_overview(full))
        policy = self.contracts.get(pid, {})
        execution = None
        try:
            execution = execution_scope(full)
        except SourceError:
            pass  # Preserve the original invalid payload for inspection; never repair it to pass a gate.
        if execution is not None:
            blockers.extend(readiness(execution, declaration, policy)['blockers'])
        else:
            if not declaration:
                blockers.append('author_declaration_missing')
            # No execution hash means no scope-bound receipt can authorize this malformed projection.
            blockers.extend(['technical_policy_unconfirmed', 'engine_support_not_verified', 'publication_rights_not_confirmed'])
            for identity, unit in core.items():
                if unit['payload']['equipment']['state'] != 'declared':
                    blockers.append('equipment_contract_unresolved:' + identity)
        record = payload['record']
        codes = sorted(set(blockers))
        return {'programId': pid, 'programVersion': full['program_version'], 'title': record['name_ru'],
                'sourceSha256': full['source_sha256'], 'reviewBundleHash': full['bundle_hash'],
                'originalBundleHash': self.originals[pid]['bundle_hash'],
                'correctionPrepared': bool(full.get('methodical_corrections')),
                'executionScopeHash': execution['bundle_hash'] if execution else None,
                'environment': record['primary_location'].lower(), 'level': record['level'].lower(),
                'daysPerWeek': record['days_per_week'], 'targetId': TARGETS.get(record['specialization']),
                'goalType': GOALS.get(record['primary_goal']),
                'targetType': 'whole_body' if record['specialization'] == 'NONE' else 'muscle_group',
                'cycleDays': [s['record']['cycle_day'] for s in payload['phases'][0]['sessions']],
                'sidedExercises': sided,
                'weeks': record['duration_weeks'], 'phaseCount': len(payload['phases']),
                'sessionCount': sum(len(p['sessions']) for p in payload['phases']), 'slotCount': len(slots),
                'exerciseCount': len(core), 'authorDeclarationFound': bool(declaration),
                'previewOnly': bool(codes), 'executionAvailable': not codes, 'structuralErrors': structural,
                'unitConflicts': conflicts,
                'blockers': [{'code': code, 'message': LABELS.get(code,
                    f'{code.split(":", 1)[1]}: оборудование неизвестно; пустой комплект не подразумевается.'
                    if code.startswith('equipment_contract_unresolved:') else
                    f'{code.split(":", 1)[1]}: единица измерения пока не поддержана Engine.'
                    if code.startswith('unsupported_measurement_unit:') else code)} for code in codes]}

    def listing(self):
        return {'schemaVersion': 1, 'batch': getattr(self, 'batch', 'custom'),
                'programs': [self.inspect(pid) for pid in self.bundles],
                'librarySummary': {'eligible': len(self.library.records), 'excluded': len(self.library.excluded),
                                   'approvedTexts': 0} if hasattr(self, 'library') else None,
                'publicationPerformed': False, 'legacyProgramReplaced': False}

    def preview(self, pid, profile):
        self.eligibility(pid, profile)
        full = self.bundle(pid)
        payload = full['units'][full['program_key']]['payload']
        exercises = {u['id']: {'id': u['id'], 'version': u['version'], 'name': u['title'],
                               'measurementUnit': u['payload']['record']['measurement_unit'],
                               'equipment': deepcopy(u['payload']['equipment'])}
                     for u in full['units'].values() if u['kind'] == 'exercise' and u['role'] == 'core'}
        equipment = {u['id']: u['title'] for u in full['units'].values() if u['kind'] == 'equipment'}
        return {**self.inspect(pid), 'record': deepcopy(payload['record']), 'weeksPlan': deepcopy(full['weeks']),
                'phases': deepcopy(payload['phases']), 'weeklyVolume': deepcopy(payload['weekly_volume_source']),
                'exercises': exercises, 'equipmentNames': equipment, 'alternativesIncluded': 0,
                'corrections': deepcopy(full.get('methodical_corrections', []))}

    def service(self, pid, profile):
        self.eligibility(pid, profile)
        result = self.inspect(pid)
        if not result['executionAvailable']:
            reject('technical_readiness_blocked', 'Авторская программа не получила технический допуск. Назначение не создано.')
        if pid not in self.services:
            self.services[pid] = PilotService(self.bundle(pid), self.folder, self.contracts.get(pid))
        return self.services[pid]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5191)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--contracts-folder', help='Private, explicitly prepared policies; never generated approvals.')
    parser.add_argument('--batch', choices=BATCHES, default='six')
    parser.add_argument('--library-check', action='store_true', help='Metadata-only index; no source prose or media publication.')
    args = parser.parse_args()
    if not args.check and not args.library_check:
        from .review.local import prepare_local
        pilot = prepare_local(choose_source=True)
    catalog = AuthorPrograms.registered(args.contracts_folder, batch=args.batch)
    if args.library_check:
        print(json.dumps(catalog.library.manifest(), ensure_ascii=False, indent=2))
        return
    if args.check:
        print(json.dumps(catalog.listing(), ensure_ascii=False, indent=2))
        return
    from .review.server import create_server
    server = create_server(pilot, catalog.folder / 'PRG_000002-v1.json', args.port, author_programs=catalog)
    address = f'http://127.0.0.1:{server.server_port}/author-programs'
    print(f'Предварительный просмотр: {address}', flush=True)
    print('Source programs remain gated. No cloud publication or changes to the legacy app history.', flush=True)
    try:
        if not args.no_browser:
            webbrowser.open(address)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    try:
        main()
    except (SourceError, ReviewError, OSError) as error:
        print(f'Запуск остановлен: {error}', file=sys.stderr)
        raise SystemExit(1)
