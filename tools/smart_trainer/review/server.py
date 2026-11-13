"""Loopback-only private review service. No cloud or application storage access."""

import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading

from ..xlsx_source import canonical
from .pilot import validate_bundle
from .release import prepare_candidate
from .workflow import Journal, ReviewError, review_state

ROOT = Path(__file__).resolve().parents[3]


def create_server(bundle, journal_path, port=5188):
    validate_bundle(bundle)
    journal = Journal(journal_path)
    csrf = secrets.token_urlsafe(32)
    mutex = threading.Lock()

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
                self.send_header('Content-Disposition', 'attachment; filename="trainer-review-journal.json"')
            self.end_headers()
            self.wfile.write(content)

        def allowed_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

        def state_payload(self):
            events = journal.read()
            state = review_state(bundle, events)
            candidate = prepare_candidate(bundle, events, release_version='1.0.0')
            return {'state': state, 'release_readiness': {'blockers': candidate['blockers'], 'runtime_enabled': False}}

        def do_GET(self):
            if not self.allowed_host():
                self.reply(403, canonical({'error': 'host_denied'}))
                return
            try:
                if self.path == '/':
                    self.reply(200, Path(__file__).with_name('review.html').read_bytes(), 'text/html; charset=utf-8')
                elif self.path == '/review.css':
                    self.reply(200, Path(__file__).with_name('review.css').read_bytes(), 'text/css; charset=utf-8')
                elif self.path == '/review-ui.mjs':
                    self.reply(200, (ROOT / 'client/scripts/trainer-review-ui.mjs').read_bytes(), 'text/javascript; charset=utf-8')
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

        def do_POST(self):
            if not self.allowed_host() or self.headers.get('Origin') != 'http://' + self.headers.get('Host', ''):
                self.reply(403, canonical({'error': 'origin_denied'}))
                return
            token = self.headers.get('X-Review-CSRF', '')
            if not hmac.compare_digest(token, csrf):
                self.reply(403, canonical({'error': 'csrf_denied'}))
                return
            if self.path != '/api/review' or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
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
                fields = {'items', 'action', 'reviewer', 'comment', 'expected_head', 'source_sha256', 'bundle_hash', 'acknowledged'}
                if not isinstance(data, dict) or set(data) != fields:
                    raise ValueError('Unexpected decision fields')
                with mutex:
                    journal.append(bundle, **data)
                    response = self.state_payload()
                self.reply(200, canonical(response))
            except ReviewError as exc:
                self.reply(409 if exc.code in ('stale_head', 'wrong_snapshot', 'dependencies_unreviewed') else 422,
                           canonical({'error': exc.code, 'message': str(exc)}))
            except (ValueError, UnicodeDecodeError, TypeError):
                self.reply(400, canonical({'error': 'invalid_request', 'message': 'Некорректный запрос решения.'}))
            except OSError:
                self.reply(503, canonical({'error': 'save_unconfirmed', 'message': 'Не удалось подтвердить сохранение. Обнови состояние журнала перед повтором.'}))

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)
