"""One source-wide content declaration. Never manufactures individual approvals."""

from ..review.workflow import ReviewError

STATEMENT = 'Подтверждаю, что ранее проверил тренировочные программы и согласен использовать их как базовую авторскую методику'


def accepted_declaration(events, overview):
    return next((event for event in reversed(events) if event['command'].get('source_sha256') == overview['source_sha256']
                 and event['command'].get('overview_hash') == overview['overview_hash']
                 and event['command'].get('statement') == STATEMENT and event['command'].get('acknowledged') is True), None)


def declare(log, overview, command, expected_head, now=None):
    def validate(events, data, _stamp):
        fields = {'operation_id', 'source_sha256', 'overview_hash', 'reviewer', 'statement', 'acknowledged'}
        if set(data) != fields or data['source_sha256'] != overview['source_sha256'] or data['overview_hash'] != overview['overview_hash']:
            raise ReviewError('wrong_snapshot', 'Подтверждение должно относиться к показанному источнику и границам.')
        if data['statement'] != STATEMENT or data['acknowledged'] is not True or not isinstance(data['reviewer'], str) or not 1 <= len(data['reviewer'].strip()) <= 120:
            raise ReviewError('acknowledgement_required', 'Укажи имя и явно подтверди заявление владельца.')
        if accepted_declaration(events, overview):
            raise ReviewError('already_declared', 'Заявление для этого источника уже сохранено. Повтор не требуется.')
    return log.transact(command, expected_head, validate, now)
