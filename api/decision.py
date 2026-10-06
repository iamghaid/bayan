"""Vercel: record a team decision (needs the reviewers' password). See tools/team_bank.py."""
from tools.demo_server import Handler
from tools.team_bank import TeamHandler


class handler(Handler):
    def do_GET(self):
        self.send_json(405, {'error': 'استخدم طلب POST.'})

    def do_POST(self):
        return TeamHandler.team_post(self)
