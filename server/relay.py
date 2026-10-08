#!/usr/bin/env python3
"""Servidor intermedi per a AutoFirma mòbil (compatible amb StorageService / RetrieveService).

Fa de bústia temporal: la web hi desa (xifrada) la petició de signatura, l'app AutoFirma del mòbil
la recull, signa, i hi deixa el resultat (xifrat) perquè la web el reculli. El servidor no pot llegir
els documents (van xifrats amb una clau que només coneixen la web i AutoFirma), no té base de dades i
els elements viuen en memòria uns minuts.

Només biblioteca estàndard de Python 3.8+.
"""
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse, unquote_plus

PORT = int(os.environ.get('PORT', '8090'))
TTL = int(os.environ.get('TTL_SECONDS', '600'))            # vida màxima d'un element
MAX_BODY = int(os.environ.get('MAX_BODY_MB', '120')) * 1024 * 1024
MAX_ITEMS = int(os.environ.get('MAX_ITEMS', '200'))
ALLOW_ORIGIN = os.environ.get('ALLOWED_ORIGIN', '*')       # p. ex. https://usuari.github.io
RATE = int(os.environ.get('RATE_PER_MINUTE', '240'))       # peticions per IP i minut

ID_RE = re.compile(r'^[A-Za-z0-9_-]{8,64}$')
store = {}   # id -> (timestamp, text)
lock = threading.Lock()
hits = {}    # ip -> [ts,...]

ERRORS = {
    'ERR-00': 'No se ha indicado código de operación',
    'ERR-01': 'Código de operación no soportado',
    'ERR-05': 'No se ha proporcionado un identificador para los datos',
    'ERR-06': 'El identificador para los datos es inválido',
    'ERR-07': 'Los datos solicitados o enviados son inválidos',
    'ERR-20': 'No se ha indicado la versión de la sintaxis de la operación',
}


def err(code):
    return f'{code}:={ERRORS[code]}'


def purge():
    now = time.time()
    with lock:
        for k in [k for k, (t, _) in store.items() if now - t > TTL]:
            del store[k]


def rate_ok(ip):
    now = time.time()
    with lock:
        lst = [t for t in hits.get(ip, []) if now - t < 60]
        lst.append(now)
        hits[ip] = lst
        if len(hits) > 5000:
            hits.clear()
        return len(lst) <= RATE


class Handler(BaseHTTPRequestHandler):
    server_version = 'afirma-relay'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):  # no es registra contingut ni identificadors
        pass

    def _send(self, text, status=200):
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', ALLOW_ORIGIN)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', ALLOW_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        self._handle(b'')

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            self.close_connection = True
            return self._send(err('ERR-07'), 413)
        self._handle(self.rfile.read(n) if n else b'')

    def _handle(self, body):
        ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
        if not rate_ok(ip):
            return self._send('ERR-99:=Too many requests', 429)
        purge()
        u = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(u.query, keep_blank_values=True).items()}
        # El cos és "k=v&k=v" amb dat en base64 url-safe; es talla a mà per no alterar cap caràcter
        if body:
            for part in body.decode('utf-8', 'replace').split('&'):
                if '=' in part:
                    k, v = part.split('=', 1)
                    params[k] = v
        op = params.get('op')
        path = u.path.lower()
        if op is None:
            return self._send(err('ERR-00'))
        if op == 'check':
            return self._send('OK')
        if not params.get('v'):
            return self._send(err('ERR-20'))
        ident = params.get('id')
        if not ident:
            return self._send(err('ERR-05'))
        if not ID_RE.match(ident):
            return self._send(err('ERR-06'))
        if op.lower() == 'put' and 'storage' in path:
            data = params.get('dat')
            if not data:
                return self._send(err('ERR-07'))
            with lock:
                if len(store) >= MAX_ITEMS and ident not in store:
                    return self._send(err('ERR-07'))
                store[ident] = (time.time(), unquote_plus(data))
            return self._send('OK')
        if op.lower() == 'get' and 'retriev' in path:
            with lock:
                item = store.pop(ident, None)
            if item is None:
                return self._send(err('ERR-06'))
            return self._send(item[1] + '\n')
        return self._send(err('ERR-01'))


if __name__ == '__main__':
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    srv.daemon_threads = True
    print(f'Servidor intermedi AutoFirma escoltant al port {PORT} (TTL {TTL}s)', flush=True)
    srv.serve_forever()
