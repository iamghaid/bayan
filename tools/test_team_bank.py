import json
import os
import unittest
from unittest.mock import patch

import team_bank


class FakeRedis:
    def __init__(self):
        self.hash, self.list = {}, []

    def __call__(self, *args):
        name = args[0]
        if name == 'HGETALL':
            return [x for pair in self.hash.items() for x in pair]
        if name == 'HSET':
            self.hash[args[2]] = args[3]
            return 1
        if name == 'RPUSH':
            self.list.append(args[2])
            return len(self.list)
        raise AssertionError(name)


ROW = {'id': 6, 'ar': 'ال', 'motion_sha256': 'abc', 'schema_errors': []}
CHECKED = {key: 'checked' for key in team_bank.PASSES}


class FakeNeon:
    """Just enough of the two tables for team_bank's statements."""
    def __init__(self):
        self.rows, self.history, self.queries = {}, [], []

    def __call__(self, query, params=()):
        self.queries.append(query)
        if query.startswith('CREATE TABLE'):
            return []
        if query.startswith('SELECT id, record::text'):
            return [[key, value] for key, value in self.rows.items()]
        if query.startswith('INSERT INTO bayan_decisions'):
            self.rows[params[0]] = params[1]
            return []
        if query.startswith('INSERT INTO bayan_history'):
            self.history.append(params[0])
            return []
        raise AssertionError(query)


class TeamBankTests(unittest.TestCase):
    """Runs on the Redis path; NeonTests below repeats the core flow on Postgres."""
    def setUp(self):
        self.redis = FakeRedis()
        env = {'KV_REST_API_URL': 'https://redis.example', 'KV_REST_API_TOKEN': 't'}
        for target in (patch.dict(os.environ, env, clear=True), patch.object(team_bank, '_command', self.redis),
                       patch.object(team_bank.motion_catalog, 'row', return_value=ROW)):
            target.start()
            self.addCleanup(target.stop)

    def decide(self, **extra):
        payload = {'id': 6, 'decision': 'accepted', 'reviewer': 'غيد', 'motion_sha256': 'abc', 'passes': CHECKED}
        payload.update(extra)
        return team_bank.decide(payload, suggest=lambda *args: ('اقتراح', None))

    def test_accept_is_shared_with_reviewer_and_history(self):
        record = self.decide()
        self.assertEqual(record['list'], 'trusted')
        self.assertEqual(team_bank.records()['6']['reviewer'], 'غيد')
        self.assertEqual(json.loads(self.redis.list[0])['decision'], 'accepted')

    def test_reject_moves_to_redesign_with_suggestion(self):
        self.decide()
        record = self.decide(decision='rejected', reviewer='سارة', passes={})
        self.assertEqual(record['list'], 'redesign')
        self.assertEqual(record['suggestion'], 'اقتراح')
        self.assertEqual([h['reviewer'] for h in record['history']], ['غيد', 'سارة'])

    def test_rules(self):
        with self.assertRaisesRegex(ValueError, 'اسمك'):
            self.decide(reviewer='  ')
        with self.assertRaisesRegex(ValueError, 'المراجعات الأربع'):
            self.decide(passes={})
        with self.assertRaisesRegex(ValueError, 'تغيّر'):
            self.decide(motion_sha256='old')
        self.assertEqual(team_bank.records(), {})

    def test_password(self):
        with patch.dict(os.environ, {'REVIEW_PASSWORD': 'سر123'}):
            self.assertTrue(team_bank.password_ok('سر123'))
            self.assertFalse(team_bank.password_ok('x'))
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(team_bank.password_ok(''))


class NeonTests(unittest.TestCase):
    def setUp(self):
        self.neon = FakeNeon()
        team_bank._ready = False
        env = {'DATABASE_URL': 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require'}
        for target in (patch.dict(os.environ, env, clear=True), patch.object(team_bank, '_sql', self.neon),
                       patch.object(team_bank.motion_catalog, 'row', return_value=ROW)):
            target.start()
            self.addCleanup(target.stop)

    def test_shared_decision_round_trip(self):
        self.assertTrue(team_bank.configured())
        team_bank.decide({'id': 6, 'decision': 'accepted', 'reviewer': 'غيد', 'motion_sha256': 'abc', 'passes': CHECKED},
                         suggest=lambda *args: (None, None))
        self.assertEqual(team_bank.records()['6']['list'], 'trusted')
        self.assertEqual(json.loads(self.neon.history[0])['reviewer'], 'غيد')
        self.assertEqual(sum(q.startswith('CREATE TABLE') for q in self.neon.queries), 2)  # created once

    def test_prefixed_variable_from_vercel(self):
        with patch.dict(os.environ, {'bayan_DATABASE_URL': 'postgresql://u:p@ep-y.neon.tech/db'}, clear=True):
            self.assertEqual(team_bank._postgres_url(), 'postgresql://u:p@ep-y.neon.tech/db')

    def test_not_connected(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(team_bank.configured())
            with self.assertRaisesRegex(ValueError, 'غير موصولة'):
                team_bank.records()


if __name__ == '__main__':
    unittest.main()
