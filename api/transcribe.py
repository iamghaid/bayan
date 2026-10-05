"""Vercel audio endpoint. Secrets are read only from server environment."""
from tools.demo_server import Handler


class handler(Handler):
    def allowed_origin(self, origin):
        return origin == 'https://' + self.headers.get('Host', '')

    def do_GET(self):
        self.send_json(405, {'error': 'استخدم طلب POST.'})
