"""Team-approved new motions are used by /api/plan (voice and text) right away."""
import json
import os
import unittest
from unittest.mock import patch

import demo_server
import motion_catalog



def staged(label):
    return next(row for row in motion_catalog.build(demo_server.ROOT)
                if row.get('source') == 'staging' and row.get('ar') == label and not row.get('schema_errors'))


class TeamPlanTests(unittest.TestCase):
    def plan(self, text, records):
        env = {'DATABASE_URL': 'postgresql://u:p@ep-x.neon.tech/db'} if records is not None else {}
        with patch.dict(os.environ, env, clear=True), patch.object(demo_server.team_bank, 'records', return_value=records or {}):
            return demo_server.make_plan(text)['plan']

    def test_accepted_word_becomes_a_sign(self):
        row = staged('التشهد')
        before = self.plan('التشهد', None)
        self.assertEqual(before[0]['action'], 'spell')
        record = {'list': 'trusted', 'motion_sha256': row['motion_sha256'], 'reviewer': 'غيد', 'at': '2026-10-06T15:00:00+00:00'}
        after = self.plan('التشهد', {str(row['id']): record})
        self.assertEqual((after[0]['action'], after[0]['id'], after[0]['motion_dir']), ('sign', row['id'], 'staging'))
        self.assertEqual(after[0]['team_approved']['reviewer'], 'غيد')
        self.assertNotIn('letters', after[0])

    def test_rejected_or_changed_motion_stays_spelled(self):
        row = staged('التشهد')
        rejected = {str(row['id']): {'list': 'redesign', 'motion_sha256': row['motion_sha256']}}
        changed = {str(row['id']): {'list': 'trusted', 'motion_sha256': 'old-file'}}
        self.assertEqual(self.plan('التشهد', rejected)[0]['action'], 'spell')
        self.assertEqual(self.plan('التشهد', changed)[0]['action'], 'spell')

    def test_database_down_never_breaks_planning(self):
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://u:p@ep-x.neon.tech/db'}, clear=True), \
             patch.object(demo_server.team_bank, 'records', side_effect=ValueError('down')):
            self.assertEqual(demo_server.make_plan('التشهد')['plan'][0]['action'], 'spell')


class SermonWordsTests(unittest.TestCase):
    def test_sermon_words_are_rendered_like_the_sermons(self):
        with patch.dict(os.environ, {}, clear=True):
            plan = {p['text']: p for p in demo_server.make_plan('إن الحمد لله نحمده')['plan']}
        self.assertEqual(plan['إن']['action'], 'drop')
        self.assertEqual((plan['الحمد']['action'], plan['الحمد']['how']), ('sign', 'sermon'))
        self.assertTrue(all(str(p['id']) in demo_server.MOTIONS for p in plan.values() if p['action'] == 'sign'))

    def test_approved_link_beats_sermon(self):
        key, ident = next(iter(json.loads((demo_server.ROOT / 'tools/approved.json').read_text(encoding='utf-8')).items()))
        with patch.dict(os.environ, {}, clear=True):
            item = demo_server.make_plan(key)['plan'][0]
        if item['action'] == 'sign':
            self.assertEqual(item['how'], 'approved')


if __name__ == '__main__':
    unittest.main()
