"""Mac entry point around the existing importer and exact, registered pilot bundle."""

import json
from pathlib import Path
import subprocess
import sys
import webbrowser

from ..import_preview import ROOT, run, write_immutable
from ..xlsx_source import SourceError, canonical, digest
from .pilot import load_pilot
from .server import create_server
from .workflow import Journal


def prepare_local(source=None, choose_source=False):
    receipt = json.loads((ROOT / 'docs/smart-trainer/audit/snapshot-receipt.json').read_text())
    pilot = json.loads((ROOT / 'docs/smart-trainer/pilot/summary.json').read_text())
    snapshot = ROOT / '.local/smart-trainer' / receipt['source_sha256'] / 'schema-1-importer-1.0.0'
    if not snapshot.exists():
        print('Локальный snapshot отсутствует. Требуется оригинальный XLSX с зарегистрированным SHA256.', flush=True)
        if not source and choose_source and sys.platform == 'darwin':
            result = subprocess.run(['osascript', '-e',
                'POSIX path of (choose file with prompt "Выберите оригинальный XLSX «Умный тренер»")'],
                capture_output=True, text=True, check=False)
            if result.returncode:
                raise SourceError('Выбор XLSX отменён. Snapshot и решения не созданы.')
            source = result.stdout.strip()
        if not source:
            raise SourceError('Требуется XLSX: повторите запуск с --source "/путь/оригинал.xlsx". Данные не восстанавливаются по памяти.')
        if digest(Path(source).read_bytes()) != receipt['source_sha256']:
            raise SourceError('SHA256 XLSX не совпадает с зарегистрированным оригиналом. Импорт остановлен.')
        print('SHA256 совпал. Восстанавливаем приватные artifacts существующим importer; отчёты аудита не меняются…', flush=True)
        run(source)  # Existing importer, once for missing artifacts, no new public audit/report.
    if digest((snapshot / 'source.xlsx').read_bytes()) != receipt['source_sha256']:
        raise SourceError('Checksum исходника в snapshot не совпадает. Файлы не перезаписаны.')
    if digest((snapshot / 'catalog.json').read_bytes()) != receipt['artifacts_sha256']['catalog.json']:
        raise SourceError('Каталог отличается от зарегистрированного. Файлы не перезаписаны.')
    bundle = load_pilot(snapshot)
    if bundle['bundle_hash'] != pilot['bundle_hash'] or bundle['source_sha256'] != receipt['source_sha256']:
        raise SourceError('Пакет пилота отличается от Stage 3. Требуется отдельная проверка новой версии.')
    folder = ROOT / '.local/smart-trainer/trainer-review/PRG_000002-v1' / bundle['bundle_hash']
    write_immutable(folder, {'bundle.json': canonical(bundle)})
    return bundle


def launch(source=None, choose_source=False, port=5188, open_browser=True, restore_journal=None):
    bundle = prepare_local(source, choose_source)
    journal = ROOT / '.local/smart-trainer/trainer-review/journals/PRG_000002-v1.json'
    if restore_journal:
        Journal(journal).restore(bundle, restore_journal)
        print('Журнал восстановлен из проверенной копии. Прежние события сохранены.', flush=True)
    server = create_server(bundle, journal, port)
    origin = f'http://127.0.0.1:{server.server_port}'
    print(f'Private local review: {origin}', flush=True)
    print(f'Журнал: {journal}\nРезервные копии: {journal.parent / "backups"}', flush=True)
    print('Оставьте это окно открытым. Для остановки нажмите Control+C. Публикация отключена.', flush=True)
    try:
        if open_browser:
            webbrowser.open(origin)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nПроверка остановлена. Сохранённые решения остаются в журнале.', flush=True)
    finally:
        server.server_close()


def private_journal_path(value):
    journal = Path(value).resolve()
    private_root = (ROOT / '.local/smart-trainer/trainer-review/journals').resolve()
    # Recovery commands use this known private area, never a snapshot, source or app file.
    if private_root not in journal.parents or journal.parent != private_root or journal.suffix != '.json':
        raise SourceError('Для backup/restore журнал должен лежать в .local/smart-trainer/trainer-review/journals/*.json')
    return journal
