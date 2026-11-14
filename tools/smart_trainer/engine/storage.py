"""Separate append-only logs for declarations and isolated assignment events."""

from datetime import datetime, timezone
import json
from pathlib import Path

from ..review.workflow import EMPTY_HEAD, Journal, ReviewError
from ..xlsx_source import canonical, digest


class EventLog:
    def __init__(self, path, purpose):
        self.path = Path(path)
        self.purpose = purpose
        self.files = Journal(self.path)

    def read(self):
        if not self.path.exists():
            return []
        try:
            data = json.loads(self.path.read_text())
            if data['format_version'] != 1 or data['purpose'] != self.purpose or not isinstance(data['events'], list):
                raise ValueError
            previous = EMPTY_HEAD
            ids = set()
            for number, event in enumerate(data['events'], 1):
                if (not isinstance(event, dict) or not isinstance(event.get('command'), dict) or not isinstance(event.get('operation_id'), str) or
                        event['sequence'] != number or event['previous_hash'] != previous or event['operation_id'] in ids or
                        datetime.fromisoformat(event['timestamp']).tzinfo is None or
                        event['event_hash'] != digest(canonical({k: v for k, v in event.items() if k != 'event_hash'}))):
                    raise ValueError
                previous = event['event_hash']
                ids.add(event['operation_id'])
            return data['events']
        except (ValueError, KeyError, TypeError):
            raise ReviewError('corrupt_journal', 'Журнал повреждён или имеет другой формат. Файл не изменён.') from None

    @staticmethod
    def head(events):
        return events[-1]['event_hash'] if events else EMPTY_HEAD

    def transact(self, command, expected_head, validate, now=None):
        if not isinstance(command, dict) or not isinstance(command.get('operation_id'), str) or not 8 <= len(command['operation_id']) <= 120:
            raise ReviewError('invalid_operation', 'Нужен стабильный идентификатор действия.')
        with self.files.locked():
            events = self.read()
            for event in events:
                if event['operation_id'] == command['operation_id']:
                    if event['command'] != command:
                        raise ReviewError('operation_conflict', 'Этот идентификатор уже относится к другому действию.')
                    return events
            if expected_head != self.head(events):
                raise ReviewError('stale_head', 'Журнал изменился. Обнови состояние перед повтором.')
            stamp = (now or datetime.now(timezone.utc)).isoformat()
            validate(events, command, stamp)
            event = {'sequence': len(events) + 1, 'previous_hash': self.head(events), 'timestamp': stamp,
                     'operation_id': command['operation_id'], 'command': command}
            event['event_hash'] = digest(canonical(event))
            updated = [*events, event]
            self.files.persist(self.path, canonical({'format_version': 1, 'purpose': self.purpose, 'events': updated}))
            return updated

    def export(self):
        return {'format_version': 1, 'purpose': self.purpose, 'events': self.read()}

    def backup(self):
        with self.files.locked():
            events = self.read()
            if not self.path.exists():
                return False
            path = self.path.parent / 'backups' / f'{self.path.stem}-{self.head(events)}.json'
            path.parent.mkdir(mode=0o700, exist_ok=True)
            data = canonical({'format_version': 1, 'purpose': self.purpose, 'events': events})
            if path.exists() and path.read_bytes() != data:
                raise ReviewError('backup_conflict', 'Существующая резервная копия отличается и не перезаписана.')
            self.files.persist(path, data)
            return True

    def restore(self, source, validate):
        source = Path(source)
        if not source.is_file():
            raise ReviewError('backup_missing', 'Файл резервной копии не найден.')
        recovered = EventLog(source, self.purpose).read()
        if not recovered:
            raise ReviewError('backup_empty', 'В резервной копии нет событий.')
        validate(recovered)
        with self.files.locked():
            current = self.read()
            if recovered[:len(current)] != current:
                raise ReviewError('history_conflict', 'Нельзя откатить или заменить расходящуюся историю.')
            if recovered != current:
                self.files.persist(self.path, canonical({'format_version': 1, 'purpose': self.purpose, 'events': recovered}))
        return self.backup()
