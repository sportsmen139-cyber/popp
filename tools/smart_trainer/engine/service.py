"""Private application service; no production resolver, cloud connection or publisher."""

from copy import deepcopy

from ..review.workflow import ReviewError
from .contracts import alternative, readiness
from .declarations import STATEMENT, accepted_declaration, declare
from .runtime import dispatch, impact, personal_change, progression, replay
from .scope import execution_scope, source_overview
from .storage import EventLog


class PilotService:
    def __init__(self, full_bundle, private_folder, contracts=None, alternative_ids=()):
        self.scope = execution_scope(full_bundle, alternative_ids)
        self.overview = source_overview(self.scope)
        self.contracts = deepcopy(contracts or {})
        self.author_log = EventLog(private_folder / 'author-statements.json', 'author_content_declarations')
        self.engine_log = EventLog(private_folder / 'pilot-engine' / self.scope['bundle_hash'] / 'events.json', 'isolated_pilot_assignments')

    def declaration(self):
        return accepted_declaration(self.author_log.read(), self.overview)

    def restore(self, author_file=None, engine_file=None):
        if author_file:
            def valid_author(events):
                if not accepted_declaration(events, self.overview):
                    raise ReviewError('wrong_snapshot', 'В копии нет заявления по текущему источнику и границам.')
            self.author_log.restore(author_file, valid_author)
        if engine_file:
            self.engine_log.restore(engine_file, lambda events: replay(self.scope, events))

    def payload(self):
        author = self.author_log.read()
        declaration = accepted_declaration(author, self.overview)
        events = self.engine_log.read()
        state = replay(self.scope, events)
        active = state['assignments'].get(state['active_assignment_id'])
        suggestions, choices, personal_choices = {}, {}, {}
        if active:
            for unit in self.scope['units'].values():
                if unit['kind'] == 'exercise':
                    suggestions[unit['id']] = progression(self.scope, active, unit['id'], unit['version'])
            if active['session']:
                for slot in active['session']['slots']:
                    choices[slot['source_slot']['slot_id']] = []
                    personal_choices[slot['source_slot']['slot_id']] = []
                    for identity in self.scope['scope']['alternatives']:
                        try:
                            candidate = alternative(self.scope, self.contracts, slot['source_slot'], identity, active['inventory'])
                            if not slot['baseline_effective']['alternative_id'] and not slot['sets']:
                                choices[slot['source_slot']['slot_id']].append(candidate)
                        except ReviewError:
                            pass  # Do not offer an unsuitable exercise just to populate the list.
                        try:
                            source = slot['source_slot']
                            candidate = alternative(self.scope, self.contracts, source, identity, active['inventory'], permanent=True)
                            personal_change(self.scope, deepcopy(active), {'operation_id': 'preview-only', 'exercise_id': source['exercise_id'],
                                'exercise_version': source['exercise_version'], 'mode': 'replace', 'alternative_id': identity, 'reason': 'Preview only; no decision'})
                            personal_choices[source['slot_id']].append(candidate)
                        except ReviewError:
                            pass
        return {'overview': self.overview, 'statement_text': STATEMENT, 'declaration': declaration,
                'declaration_head': self.author_log.head(author), 'engine_head': self.engine_log.head(events),
                'scope': self.scope, 'state': state, 'readiness': readiness(self.scope, declaration, self.contracts),
                'suggestions': suggestions, 'choices': choices, 'personal_choices': personal_choices,
                'impacts': {u['id']: impact(self.scope, u['id'], u['version']) for u in self.scope['units'].values() if u['kind'] == 'exercise' and u['role'] == 'core'},
                'storage': {'author_file': str(self.author_log.path), 'engine_file': str(self.engine_log.path)},
                'legacy_storage_used': False, 'live_activation_enabled': False}

    def handle(self, kind, payload):
        if not isinstance(payload, dict) or set(payload) != {'expected_head', 'command'} or not isinstance(payload['command'], dict):
            raise ReviewError('invalid_command', 'Нужны конкретное действие и текущая версия журнала.')
        if kind == 'declaration':
            declare(self.author_log, self.overview, payload['command'], payload['expected_head'])
            log = self.author_log
        else:
            dispatch(self.engine_log, self.scope, self.contracts, self.declaration(), payload['command'], payload['expected_head'])
            log = self.engine_log
        try:
            backup = log.backup()
        except (OSError, ReviewError):
            backup = False
        return {**self.payload(), 'last_save': {'persisted': True, 'backup_confirmed': backup}}
