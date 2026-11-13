"""Explicit, snapshot-bound human decisions. Source review_status is never mutated."""

from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import tempfile

from ..xlsx_source import SourceError, canonical, digest
from .pilot import validate_bundle

EMPTY_HEAD = '0' * 64
ACTIONS = {'approve', 'needs_correction', 'reject', 'comment'}


class ReviewError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate_events(events):
    previous = EMPTY_HEAD
    for sequence, event in enumerate(events, 1):
        if not isinstance(event, dict):
            raise ReviewError('corrupt_journal', 'Некорректный элемент журнала.')
        if event.get('sequence') != sequence or event.get('previous_hash') != previous:
            raise ReviewError('corrupt_journal', 'Нарушена последовательность журнала.')
        if event.get('action') not in ACTIONS or not isinstance(event.get('reviewer'), str) or not event['reviewer'].strip():
            raise ReviewError('corrupt_journal', 'Некорректная запись решения.')
        try:
            timestamp = datetime.fromisoformat(event['timestamp'])
            if timestamp.tzinfo is None:
                raise ValueError
        except (ValueError, TypeError, KeyError):
            raise ReviewError('corrupt_journal', 'Некорректное время решения.') from None
        if digest(canonical({k: v for k, v in event.items() if k != 'event_hash'})) != event.get('event_hash'):
            raise ReviewError('corrupt_journal', 'Checksum журнала не совпадает.')
        previous = event['event_hash']
    return previous


def review_state(bundle, events):
    validate_bundle(bundle)
    head = validate_events(events)
    latest = {}
    for event in events:
        unit = bundle['units'].get(event.get('entity_key'))
        if (unit and event.get('source_sha256') == bundle['source_sha256'] and
                event.get('bundle_hash') == bundle['bundle_hash'] and
                event.get('record_hash') == unit['record_hash'] and
                event.get('entity_id') == unit['id'] and event.get('entity_version') == unit['version'] and
                event.get('manual_acknowledgement') is True and event.get('covered_records') == unit['covers'] and
                event.get('entity_kind') == unit['kind'] and event.get('version_scope') == unit['version_scope'] and
                event.get('action') != 'comment'):
            latest[event['entity_key']] = event
    states = {}

    def state(key):
        if key in states:
            return states[key]
        unit, event = bundle['units'][key], latest.get(key)
        if not event:
            value = {'status': 'pending', 'event_hash': None}
        elif event['action'] != 'approve':
            value = {'status': 'needs_correction' if event['action'] == 'needs_correction' else 'rejected', 'event_hash': event['event_hash']}
        else:
            expected = event.get('dependency_approvals', {})
            valid = set(expected) == set(unit['dependencies']) and all(
                state(dep)['status'] == 'approved' and state(dep)['event_hash'] == expected[dep]
                for dep in unit['dependencies'])
            value = {'status': 'approved' if valid else 'stale', 'event_hash': event['event_hash']}
        value['reviewer'] = event['reviewer'] if event else None
        value['timestamp'] = event['timestamp'] if event else None
        states[key] = value
        return value
    for key in bundle['units']:
        state(key)
    return {'head': head, 'events': events, 'units': states,
            'approved': sum(v['status'] == 'approved' for v in states.values()),
            'total': len(states), 'program_approved': states[bundle['program_key']]['status'] == 'approved'}


def decide(bundle, events, *, items, action, reviewer, comment, expected_head, source_sha256, bundle_hash, acknowledged, now=None):
    current = review_state(bundle, events)
    if expected_head != current['head']:
        raise ReviewError('stale_head', 'Журнал изменился в другом окне. Обнови состояние.')
    if source_sha256 != bundle['source_sha256'] or bundle_hash != bundle['bundle_hash']:
        raise ReviewError('wrong_snapshot', 'Решение относится к другому snapshot или составу пилота.')
    if action not in ACTIONS or not isinstance(items, list) or not 1 <= len(items) <= 250 or any(not isinstance(k, str) for k in items) or len(set(items)) != len(items):
        raise ReviewError('invalid_action', 'Выбери конкретные записи и действие.')
    if not isinstance(reviewer, str) or not 1 <= len(reviewer.strip()) <= 120:
        raise ReviewError('reviewer_required', 'Укажи имя проверяющего.')
    if not isinstance(comment, str) or len(comment) > 4000 or (action != 'approve' and not comment.strip()):
        raise ReviewError('comment_required', 'Добавь комментарий к решению, до 4000 символов.')
    if acknowledged is not True:
        raise ReviewError('acknowledgement_required', 'Подтверди явное решение по указанным карточкам и их составу.')
    for key in items:
        if key not in bundle['units']:
            raise ReviewError('unknown_entity', 'Запись не входит в этот пилот.')
        if action == 'approve' and any(current['units'][dep]['status'] != 'approved' for dep in bundle['units'][key]['dependencies']):
            raise ReviewError('dependencies_unreviewed', 'Сначала утверди обязательные зависимости отдельным решением.')
    timestamp = (now or datetime.now(timezone.utc)).isoformat()
    new_events = list(events)
    for key in items:
        unit = bundle['units'][key]
        event = {
            'format_version': 1, 'sequence': len(new_events) + 1,
            'previous_hash': new_events[-1]['event_hash'] if new_events else EMPTY_HEAD,
            'action': action, 'entity_key': key, 'entity_kind': unit['kind'],
            'entity_id': unit['id'], 'entity_version': unit['version'], 'version_scope': unit['version_scope'],
            'source_sha256': bundle['source_sha256'], 'bundle_hash': bundle['bundle_hash'],
            'record_hash': unit['record_hash'], 'covered_records': unit['covers'],
            'dependency_approvals': {dep: current['units'][dep]['event_hash'] for dep in unit['dependencies']} if action == 'approve' else {},
            'reviewer': reviewer.strip(), 'timestamp': timestamp, 'comment': comment.strip(),
            'manual_acknowledgement': True,
        }
        event['event_hash'] = digest(canonical(event))
        new_events.append(event)
    return new_events


class Journal:
    """Private logical append-only events, atomically persisted under a file lock."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

    def read(self):
        if not self.path.exists():
            return []
        try:
            content = json.loads(self.path.read_text())
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ReviewError('corrupt_journal', 'Журнал повреждён. Запись остановлена, файл не изменён.') from None
        if not isinstance(content, dict) or content.get('format_version') != 1 or not isinstance(content.get('events'), list):
            raise ReviewError('corrupt_journal', 'Неподдерживаемый формат журнала.')
        validate_events(content['events'])
        return content['events']

    def append(self, bundle, **decision):
        lock_path = self.path.with_suffix(self.path.suffix + '.lock')
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(descriptor, 'a+b') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            events = self.read()
            updated = decide(bundle, events, **decision)
            data = canonical({'format_version': 1, 'events': updated})
            with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix='.journal-', delete=False) as temporary:
                temporary.write(data)
                temporary.flush()
                os.fsync(temporary.fileno())
                temp_path = temporary.name
            os.replace(temp_path, self.path)
            folder = os.open(self.path.parent, os.O_RDONLY)
            try:
                os.fsync(folder)
            finally:
                os.close(folder)
            return review_state(bundle, updated)
