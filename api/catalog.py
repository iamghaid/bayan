"""Vercel review catalog: every motion with its source, fidelity and sermon use (read-only)."""
from tools.demo_server import Handler


class handler(Handler):
    def do_GET(self):
        self.path = '/api/catalog'
        return Handler.do_GET(self)

    def do_POST(self):
        self.send_json(405, {'error': 'استخدم طلب GET.'})
