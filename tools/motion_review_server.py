"""Loopback-only viewer for staged avatars and local reference videos."""
import json
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
try:
    from tools import motion_catalog
    from tools.motion_bank import BankHandler
    from tools.review_assistant import ReviewAssistantHandler
except ModuleNotFoundError:
    import motion_catalog
    from motion_bank import BankHandler
    from review_assistant import ReviewAssistantHandler

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/review_assistant':
            return ReviewAssistantHandler.do_POST(self)
        if self.path == '/api/decision':
            return BankHandler.bank_post(self)
        self.send_error(404)

    def log_message(self, *args):
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/bank':
            return BankHandler.bank_get(self)
        if path == '/api/catalog':
            data = json.dumps(motion_catalog.build(ROOT), ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        match = re.fullmatch(r'/reference/(\d+)\.mp4', path)
        if match:
            ids = {str(item['id']) for item in motion_catalog.build(ROOT)}
            if match[1] not in ids:
                return self.send_error(404)
            file = ROOT / f'sshi_motion/src/{match[1]}.mp4'
            if not file.is_file():
                return self.send_error(404)
            size = file.stat().st_size
            start, end = 0, size - 1
            request_range = self.headers.get('Range')
            if request_range:
                interval = re.fullmatch(r'bytes=(\d+)-(\d*)', request_range)
                if not interval:
                    return self.send_error(416)
                start = int(interval[1])
                end = min(int(interval[2]) if interval[2] else end, end)
                if start > end:
                    return self.send_error(416)
            self.send_response(206 if request_range else 200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(end - start + 1))
            if request_range:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            with file.open('rb') as stream:
                stream.seek(start)
                remaining = end - start + 1
                try:
                    while remaining:
                        chunk = stream.read(min(65536, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
            return
        allowed = {'/motion-review.html', '/motion-review.js', '/review-assistant.js', '/unified-view.js', '/interface.css', '/fonts.css', '/man_dress.js', '/handfix.js', '/signfix.js', '/signer.js'}
        valid = path in allowed or bool(re.fullmatch(r'/lib/(three\.min\.js|GLTFLoader\.js|three-vrm\.min\.js)|/avatar/man\.glb|/fonts/thmanyah[a-z]+-(Regular|Medium|Bold)\.woff2|/brand/(logo|icon-64|icon-180|favicon-32)\.png|/sshi_motion/(m|staging)/\d+\.json', path))
        if not valid:
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        self.send_error(405)


if __name__ == '__main__':
    print('Motion review: http://127.0.0.1:8021/motion-review.html', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8021), partial(Handler, directory=str(ROOT))).serve_forever()
