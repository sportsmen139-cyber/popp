"""Loopback-only private review service. No cloud or application storage access."""

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading

from ..xlsx_source import SourceError, canonical
from .pilot import validate_bundle
from .release import prepare_candidate
from .workflow import Journal, ReviewError, review_state
from ..engine.service import PilotService

ROOT = Path(__file__).resolve().parents[3]


def create_server(bundle, journal_path, port=5188, *, technical_contracts=None, alternative_ids=(), author_programs=None):
    validate_bundle(bundle)
    journal = Journal(journal_path)
    pilot = PilotService(bundle, Path(journal_path).parent, technical_contracts, alternative_ids)
    if journal.path.exists():
        journal.backup(bundle)
    csrf = secrets.token_urlsafe(32)
    mutex = threading.Lock()
    author_sessions = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log reviewer/comment/request payloads.

        def reply(self, status, content, mime='application/json; charset=utf-8', attachment=False):
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
            if attachment:
                name = attachment if isinstance(attachment, str) else 'trainer-review-journal.json'
                self.send_header('Content-Disposition', f'attachment; filename="{name}"')
            self.end_headers()
            self.wfile.write(content)

        def allowed_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

        def state_payload(self):
            events = journal.read()
            state = review_state(bundle, events)
            candidate = prepare_candidate(bundle, events, release_version='1.0.0')
            return {'state': state, 'storage': journal.storage(events),
                    'release_readiness': {'blockers': candidate['blockers'], 'runtime_enabled': False}}

        def author_api(self):
            parts = self.path.split('/')
            if (author_programs is None or len(parts) not in (4, 5) or parts[1:3] != ['api', 'author-pilot'] or
                    parts[3] not in author_sessions or (len(parts) == 5 and parts[4] not in ('command', 'owner-statement', 'export'))):
                raise ReviewError('author_context_unavailable', 'Открой программу заново из локального каталога. История сохранена.')
            context = author_sessions[parts[3]]
            # Recheck scope/profile/admission for every request, including stale tabs.
            service = author_programs.service(context['programId'], context['profile'])
            return service, parts[4] if len(parts) == 5 else ''

        def do_GET(self):
            if not self.allowed_host():
                self.reply(403, canonical({'error': 'host_denied'}))
                return
            try:
                if self.path in ('/', '/review'):
                    self.reply(200, Path(__file__).with_name('review.html').read_bytes(), 'text/html; charset=utf-8')
                elif self.path == '/review.css':
                    self.reply(200, Path(__file__).with_name('review.css').read_bytes(), 'text/css; charset=utf-8')
                elif self.path == '/review-ui.mjs':
                    self.reply(200, (ROOT / 'client/scripts/trainer-review-ui.mjs').read_bytes(), 'text/javascript; charset=utf-8')
                elif self.path == '/pilot':
                    self.reply(200, (ROOT / 'tools/smart_trainer/engine/pilot.html').read_bytes(), 'text/html; charset=utf-8')
                elif self.path == '/pilot.css':
                    self.reply(200, (ROOT / 'tools/smart_trainer/engine/pilot.css').read_bytes(), 'text/css; charset=utf-8')
                elif self.path == '/pilot-ui.mjs':
                    self.reply(200, (ROOT / 'client/scripts/pilot-engine-ui.mjs').read_bytes(), 'text/javascript; charset=utf-8')
                elif self.path == '/api/pilot-engine':
                    self.reply(200, canonical({'csrf': csrf, **pilot.payload()}))
                elif author_programs is not None and self.path.startswith('/author-pilot/'):
                    token = self.path.removeprefix('/author-pilot/')
                    if token not in author_sessions:
                        self.reply(404, canonical({'error': 'author_context_unavailable', 'message': 'Открой программу из локального каталога. История сохранена.'}))
                        return
                    context = author_sessions[token]
                    author_programs.service(context['programId'], context['profile'])
                    page = (ROOT / 'tools/smart_trainer/engine/pilot.html').read_text()
                    page = page.replace('<body>', f'<body data-pilot-api-root="/api/author-pilot/{token}">')
                    self.reply(200, page.encode(), 'text/html; charset=utf-8')
                elif author_programs is not None and self.path.startswith('/api/author-pilot/'):
                    service, action = self.author_api()
                    if action == '':
                        self.reply(200, canonical({'csrf': csrf, **service.payload()}))
                    elif action == 'export':
                        self.reply(200, canonical(service.engine_log.export()), attachment='author-program-events.json')
                    else:
                        self.reply(404, canonical({'error': 'not_found'}))
                elif author_programs is not None and self.path == '/author-programs':
                    self.reply(200, (ROOT / 'tools/smart_trainer/author-programs.html').read_bytes(), 'text/html; charset=utf-8')
                elif author_programs is not None and self.path == '/author-programs-ui.mjs':
                    self.reply(200, (ROOT / 'client/scripts/author-programs-ui.mjs').read_bytes(), 'text/javascript; charset=utf-8')
                elif author_programs is not None and self.path == '/api/author-programs':
                    self.reply(200, canonical({'csrf': csrf, **author_programs.listing()}))
                elif author_programs is not None and self.path == '/api/exercise-library' and hasattr(author_programs, 'library'):
                    self.reply(200, canonical(author_programs.library.manifest()))
                elif self.path == '/api/owner-statement/export':
                    self.reply(200, canonical(pilot.author_log.export()), attachment='author-statements.json')
                elif self.path == '/api/pilot-engine/export':
                    self.reply(200, canonical(pilot.engine_log.export()), attachment='pilot-assignment-events.json')
                elif self.path == '/api/pilot':
                    self.reply(200, canonical({'bundle': bundle, 'csrf': csrf, **self.state_payload()}))
                elif self.path == '/api/state':
                    self.reply(200, canonical(self.state_payload()))
                elif self.path == '/api/journal':
                    self.reply(200, canonical({'format_version': 1, 'events': journal.read()}), attachment=True)
                elif self.path == '/favicon.ico':
                    self.reply(204, b'', 'image/x-icon')
                else:
                    self.reply(404, canonical({'error': 'not_found'}))
            except (OSError, ReviewError):
                self.reply(503, canonical({'error': 'journal_unavailable', 'message': 'Не удалось прочитать журнал. Исходные файлы не изменены.'}))
            except SourceError:
                self.reply(503, canonical({'error': 'source_unavailable', 'message': 'Проверка исходных данных не пройдена. Назначение не создано.'}))

        def do_POST(self):
            if not self.allowed_host() or self.headers.get('Origin') != 'http://' + self.headers.get('Host', ''):
                self.reply(403, canonical({'error': 'origin_denied'}))
                return
            token = self.headers.get('X-Review-CSRF', '')
            if not hmac.compare_digest(token, csrf):
                self.reply(403, canonical({'error': 'csrf_denied'}))
                return
            paths = {'/api/review', '/api/backup', '/api/owner-statement', '/api/pilot-engine/command'}
            if author_programs is not None:
                paths.update(('/api/author-programs/preview', '/api/author-programs/open'))
                if self.path.startswith('/api/author-pilot/'):
                    paths.add(self.path)  # author_api validates the complete route before any command.
            if self.path not in paths or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                self.reply(400, canonical({'error': 'invalid_request'}))
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 1 <= length <= 65536:
                    self.reply(413, canonical({'error': 'request_too_large'}))
                    return
                self.connection.settimeout(5)
                def unique(pairs):
                    values = {}
                    for key, value in pairs:
                        if key in values:
                            raise ValueError('Duplicate JSON key')
                        values[key] = value
                    return values
                data = json.loads(self.rfile.read(length).decode('utf-8'), object_pairs_hook=unique)
                if self.path in ('/api/author-programs/preview', '/api/author-programs/open'):
                    if not isinstance(data, dict) or set(data) != {'programId', 'profile'}:
                        raise ValueError('Unexpected preview fields')
                    if self.path.endswith('/preview'):
                        response = author_programs.preview(data['programId'], data['profile'])
                    else:
                        with mutex:
                            author_programs.service(data['programId'], data['profile'])
                            token = next((key for key, context in author_sessions.items() if context == data), None)
                            if token is None:
                                token = secrets.token_hex(16)
                                author_sessions[token] = data
                        response = {'url': '/author-pilot/' + token, 'assignmentCreated': False}
                    self.reply(200, canonical(response))
                    return
                if self.path.startswith('/api/author-pilot/'):
                    with mutex:
                        service, action = self.author_api()
                        if action not in ('command', 'owner-statement'):
                            raise ValueError('Unexpected author command route')
                        response = service.handle('engine' if action == 'command' else 'declaration', data)
                    self.reply(200, canonical(response))
                    return
                if self.path in ('/api/owner-statement', '/api/pilot-engine/command'):
                    with mutex:
                        response = pilot.handle('declaration' if self.path == '/api/owner-statement' else 'engine', data)
                    self.reply(200, canonical(response))
                    return
                fields = {'expected_head', 'source_sha256', 'bundle_hash'}
                if self.path == '/api/review':
                    fields |= {'items', 'action', 'reviewer', 'comment', 'acknowledged'}
                if not isinstance(data, dict) or set(data) != fields:
                    raise ValueError('Unexpected decision fields')
                with mutex:
                    if self.path == '/api/review':
                        journal.append(bundle, **data)
                        # A failed copy must not turn a confirmed journal write into a failed-save claim.
                        try:
                            journal.backup(bundle)
                        except (OSError, ReviewError):
                            pass  # storage.backup_confirmed explicitly reports the missing copy to the UI.
                    else:
                        if data['source_sha256'] != bundle['source_sha256'] or data['bundle_hash'] != bundle['bundle_hash']:
                            raise ReviewError('wrong_snapshot', 'Копия относится к другому snapshot или пакету пилота.')
                        journal.backup(bundle, expected_head=data['expected_head'])
                    response = self.state_payload()
                self.reply(200, canonical(response))
            except ReviewError as exc:
                self.reply(409 if exc.code in ('stale_head', 'wrong_snapshot', 'dependencies_unreviewed', 'technical_readiness_blocked', 'operation_conflict', 'rest_day_required', 'phase_transition_required') else 422,
                           canonical({'error': exc.code, 'message': str(exc)}))
            except (ValueError, UnicodeDecodeError, TypeError, KeyError):
                self.reply(400, canonical({'error': 'invalid_request', 'message': 'Некорректный запрос решения.'}))
            except OSError:
                self.reply(503, canonical({'error': 'save_unconfirmed', 'message': 'Не удалось подтвердить сохранение. Обнови состояние журнала перед повтором.'}))

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)
