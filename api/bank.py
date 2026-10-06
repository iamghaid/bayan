"""Vercel: shared team decisions (read). See tools/team_bank.py."""
from tools.demo_server import Handler
from tools.team_bank import TeamHandler


class handler(Handler):
    def do_GET(self):
        return TeamHandler.team_get(self)

    def do_POST(self):
        self.send_json(405, {'error': 'استخدم طلب GET.'})
