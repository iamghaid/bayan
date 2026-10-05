"""Local deterministic retarget regression page; no source videos or secrets."""
import re
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from motion_review_server import ROOT


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]
        allowed = {'/tools/avatarcheck.html', '/coverage/research/signer_previous.js',
                   '/sshi_motion/needed.json', '/avatar/man.glb', '/man_dress.js',
                   '/handfix.js', '/signfix.js', '/signer.js'}
        if path not in allowed and not re.fullmatch(r'/sshi_motion/(m|staging)/\d+\.json|/lib/(three\.min\.js|GLTFLoader\.js|three-vrm\.min\.js)', path):
            return self.send_error(404)
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8022)
    args=parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT))).serve_forever()
