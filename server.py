#!/usr/bin/env python3
"""
server.py: the saving program for Doomscroll AI. One per laptop.

    python3 server.py                  then open http://localhost:8765
    python3 server.py --port 8766      if 8765 is taken
    python3 server.py --data /tmp/x    save somewhere else (tests/e2e.js does this)

It does two jobs, so the game needs nothing else:
  1. It serves the game itself (index.html, css/, js/...). The page and the saving program then share one
     origin, so the browser needs no CORS and never asks for a folder or a download.
  2. It writes the CSV files the game sends it into data/, next to this file:

       data/Kai_Moreno/Kai_Moreno_tutorial.csv, Kai_Moreno_round1.csv ...   (js/logger.js names them)
       data/leaderboard/leaderboard.csv                                     (js/leaderboard.js)

The API is the four things js/datafolder.js needs, one endpoint each:
  GET  /api/health                         {"ok": true}            the name screen asks before Continue
  POST /api/write   {folder, file, text}   {"ok": true}            write a whole file (replacing it)
  GET  /api/read?folder=..&file=..         {"text": "..." | null}  null = no such file yet
  GET  /api/exists?folder=..&file=..       {"exists": true|false}

The game decides every name; this file only refuses anything that isn't data/<folder>/<file>.csv. It never
picks names or adds " (2)": logger.js does that, so the files come out exactly as they did with the folder
picker. Python 3 standard library only: nothing to install.
"""
import argparse
import errno
import json
import os
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8765          # js/datafolder.js names this port in the "start the saving program" message
MAX_BYTES = 5 * 1024 * 1024  # a round's CSV is about 30 KB; anything near this is a mistake or an attack
NAME_MAX = 100               # the longest real name is ~60 characters: "First_Last_round12 (2).csv", 20 + 20 each
BAD_CHARS = set('/\\:*?"<>|')  # the same characters logger.cleanName drops: no system can hold them in a name


def say(message):
    # flush, so the teacher sees each line at once even when the output is piped (tests/e2e.js reads it)
    print(message, flush=True)


def valid_name(name):
    """One folder or file name, never a path: no separators, no '..', nothing hidden."""
    return (isinstance(name, str) and 0 < len(name) <= NAME_MAX and name == name.strip()
            and not name.startswith('.')
            and not any(c in BAD_CHARS or ord(c) < 32 or ord(c) == 127 for c in name))


def data_path(data_dir, folder, file):
    """data/<folder>/<file>.csv, or None if the request asks for anything else."""
    if not (valid_name(folder) and valid_name(file) and file.endswith('.csv')):
        return None
    # The leaderboard's folder holds only the leaderboard. (A player's folder always has a "_" in it.)
    if folder == 'leaderboard' and file != 'leaderboard.csv':
        return None
    path = os.path.join(data_dir, folder, file)
    # The checks above already rule out "..", but a symlink inside data/ could still point elsewhere.
    if os.path.dirname(os.path.dirname(os.path.realpath(path))) != os.path.realpath(data_dir):
        return None
    return path


class Server(ThreadingHTTPServer):
    # On Windows, SO_REUSEADDR lets a second server quietly share a port that is in use, and the requests
    # then go to either one. Off there, a second copy fails with "port already in use" instead.
    allow_reuse_address = os.name != 'nt'

    def __init__(self, port, data_dir):
        self.data_dir = data_dir
        # Only these may talk to the saving program. The Host check stops DNS rebinding (a web page whose own
        # name points at 127.0.0.1); the Origin check stops another page from posting to it.
        self.hosts = {'localhost:%d' % port, '127.0.0.1:%d' % port}
        self.origins = {'http://' + h for h in self.hosts}
        self.lock = threading.Lock()   # one write at a time, so the leaderboard's read-add-write never interleaves
        super().__init__(('127.0.0.1', port), Handler)   # 127.0.0.1 only: no other computer can reach it


class Handler(SimpleHTTPRequestHandler):
    server_version = 'DoomscrollSaver'
    sys_version = ''

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # Every response, file or API: a reload must always get the latest edits, and the CSV text must never
    # sit in a browser cache.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    # The default prints a line per request (dozens per page load). The teacher only needs the saves.
    def log_message(self, format, *args):
        pass

    # ------------------------------------------------------------------ Checks
    def host_ok(self):
        return (self.headers.get('Host') or '').lower() in self.server.hosts

    def origin_ok(self, required):
        origin = self.headers.get('Origin')
        if origin is None:
            return not required
        return origin.lower() in self.server.origins

    def refuse(self, code, why):
        if code != 404:
            say('Refused %s %s: %s' % (self.command, self.path[:120], why))
        self.send_json(code, {'ok': False, 'error': why})

    def send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    # ------------------------------------------------------------------ The game's own files
    # Everything in the project folder except the saved data (read through the API only, so the same checks
    # apply) and hidden files like .git. No folder listings either.
    def static_ok(self, url_path):
        parts = [p for p in unquote(url_path).split('/') if p]
        return not (parts and parts[0] == 'data') and not any(p.startswith('.') for p in parts)

    def list_directory(self, path):
        self.send_error(404, 'Not found')
        return None

    def do_GET(self):
        if not self.host_ok():
            return self.refuse(403, 'wrong Host header')
        url = urlsplit(self.path)
        if url.path.startswith('/api/'):
            return self.api_get(url)
        if not self.static_ok(url.path):
            return self.refuse(404, 'not found')
        return super().do_GET()

    def do_HEAD(self):
        url = urlsplit(self.path)
        if not self.host_ok() or url.path.startswith('/api/') or not self.static_ok(url.path):
            return self.refuse(404, 'not found')
        return super().do_HEAD()

    # ------------------------------------------------------------------ The API
    def api_get(self, url):
        # A page from another site can't read these answers anyway (no CORS headers), but say no outright.
        if not self.origin_ok(required=False):
            return self.refuse(403, 'foreign Origin')
        if url.path == '/api/health':
            return self.send_json(200, {'ok': True})
        if url.path not in ('/api/read', '/api/exists'):
            return self.refuse(404, 'not found')
        query = parse_qs(url.query)
        path = data_path(self.server.data_dir, (query.get('folder') or [''])[0], (query.get('file') or [''])[0])
        if path is None:
            return self.refuse(400, 'not a data/<folder>/<file>.csv path')
        if url.path == '/api/exists':
            return self.send_json(200, {'exists': os.path.isfile(path)})
        # A missing file is an answer (null), not an error: the leaderboard starts with no file.
        if not os.path.isfile(path):
            return self.send_json(200, {'text': None})
        with open(path, 'rb') as f:
            return self.send_json(200, {'text': f.read().decode('utf-8', errors='replace')})

    def do_POST(self):
        if not self.host_ok():
            return self.refuse(403, 'wrong Host header')
        if urlsplit(self.path).path != '/api/write':
            return self.refuse(404, 'not found')
        # Browsers always send Origin on a POST, so a write without one didn't come from the game.
        if not self.origin_ok(required=True):
            return self.refuse(403, 'foreign or missing Origin')
        # A JSON body can't be sent across sites without the browser asking first (a CORS preflight), and this
        # server never says yes to one. A second lock on the same door.
        if (self.headers.get('Content-Type') or '').split(';')[0].strip().lower() != 'application/json':
            return self.refuse(415, 'send JSON')
        try:
            length = int(self.headers.get('Content-Length') or '')
        except ValueError:
            return self.refuse(411, 'Content-Length needed')
        if length < 0 or length > MAX_BYTES:
            return self.refuse(413, 'too big (the limit is %d MB)' % (MAX_BYTES // (1024 * 1024)))
        try:
            body = json.loads(self.rfile.read(length).decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return self.refuse(400, 'not JSON')
        if not isinstance(body, dict) or not isinstance(body.get('text'), str):
            return self.refuse(400, 'expected {folder, file, text}')
        path = data_path(self.server.data_dir, body.get('folder'), body.get('file'))
        if path is None:
            return self.refuse(400, 'not a data/<folder>/<file>.csv path')
        try:
            self.write_whole(path, body['text'].encode('utf-8'))
        except OSError as e:
            say('Could not save %s/%s: %s' % (body['folder'], body['file'], e))
            return self.send_json(500, {'ok': False, 'error': 'could not write the file'})
        say('Saved %s/%s' % (body['folder'], body['file']))
        return self.send_json(200, {'ok': True})

    # The whole file, every time (logger.js rewrites a part when it gets more rows). It goes to a temporary
    # file in the same folder first and is then renamed over the old one, which the disk does in one step:
    # a crash or a pulled plug leaves the old CSV or the new one, never half of one.
    def write_whole(self, path, data):
        folder = os.path.dirname(path)
        with self.server.lock:
            os.makedirs(folder, exist_ok=True)
            fd, tmp = tempfile.mkstemp(dir=folder, prefix='.saving-', suffix='.tmp')
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                os.chmod(tmp, 0o644)   # mkstemp makes it private; the teacher's spreadsheet app must open it
                os.replace(tmp, path)
            except BaseException:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
                raise


def main():
    parser = argparse.ArgumentParser(description='Serves Doomscroll AI and saves its CSV files.')
    parser.add_argument('--port', type=int, default=DEFAULT_PORT, help='port to use (default %d)' % DEFAULT_PORT)
    parser.add_argument('--data', default=os.path.join(ROOT, 'data'), help='where to save (default: data/ here)')
    args = parser.parse_args()

    data_dir = os.path.abspath(args.data)
    try:
        os.makedirs(data_dir, exist_ok=True)
    except OSError as e:
        say('Cannot use %s as the data folder: %s' % (data_dir, e))
        sys.exit(1)

    try:
        server = Server(args.port, data_dir)
    except OSError as e:
        if e.errno == errno.EADDRINUSE or getattr(e, 'winerror', None) == 10048:
            say('Port %d is already in use. Is the saving program already running in another window? '
                'If so, use that one. Otherwise start this one with: python3 server.py --port %d'
                % (args.port, args.port + 1))
            sys.exit(1)
        raise

    say('Saving to %s. Open http://localhost:%d (keep this window open; Ctrl+C stops it)' % (data_dir, args.port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        say('Stopped. The files are in %s.' % data_dir)
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
