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


class TeamBankTests(unittest.TestCase):
    def setUp(self):
        self.redis = FakeRedis()
        for target in (patch.object(team_bank, '_command', self.redis),
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


if __name__ == '__main__':
    unittest.main()
