import hashlib
import json
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import motion_bank as bank

CHECKED = {key: 'checked' for key in bank.PASSES}


class MotionBankTests(unittest.TestCase):
    def setUp(self):
        fixtures = Path(__file__).resolve().parents[1] / 'output' / 'test-fixtures'
        fixtures.mkdir(parents=True, exist_ok=True)
        self.root = fixtures / ('bank-' + uuid.uuid4().hex)
        for folder in ('tools', 'coverage/expansion', 'sshi_motion/m', 'sshi_motion/staging', 'translations'):
            (self.root / folder).mkdir(parents=True)
        self.addCleanup(shutil.rmtree, self.root)
        motion = b'{"fps": 25, "fr": [[[0], [0, 0, 0, 0], 0, 0, 0]]}'
        (self.root / 'sshi_motion/staging/50.json').write_bytes(motion)
        self.sha = hashlib.sha256(motion).hexdigest()
        catalog = [{'id': 50, 'ar': '‏صبر - تحمل', 'schema_errors': [], 'motion_sha256': self.sha},
                   {'id': 60, 'ar': 'الله', 'schema_errors': [], 'motion_sha256': 'x'}]
        self.write('coverage/expansion/staging_qa.json', catalog)
        self.write('tools/approved.json', {'تحمل': 999}, indent=1)
        self.write('tools/blocked.json', {'_pairs': []}, indent=1)
        self.write('tools/translation_holds.json', {})
        (self.root / 'sshi_motion/index.json').write_text('[1, 2]', encoding='utf-8')
        plan = {'plan': [{'text': 'صبر', 'action': 'spell', 'letters': [1], 'base': 'صبر'},
                         {'text': 'صبر', 'action': 'quran'}, {'text': 'تحمل', 'action': 'spell'}]}
        self.write('translations/1_gemini.json', plan, indent=1)
        self.originals = {path: path.read_bytes() for path in self.root.rglob('*') if path.is_file()}
        patcher = patch.object(bank, 'ROOT', self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def write(self, name, data, indent=None):
        (self.root / name).write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding='utf-8')

    def read(self, name):
        return json.loads((self.root / name).read_text(encoding='utf-8'))

    def decide(self, decision, **extra):
        payload = {'id': 50, 'decision': decision, 'motion_sha256': self.sha, 'passes': CHECKED, 'note': 'الرسغ ملتوٍ', **extra}
        return bank.decide(payload)

    def test_accept_moves_motion_into_bank_and_sermons(self):
        result = self.decide('accepted')
        self.assertEqual(result['list'], 'trusted')
        self.assertNotIn('undo', result)
        self.assertTrue((self.root / 'sshi_motion/m/50.json').exists())
        self.assertEqual(self.read('sshi_motion/index.json'), [1, 2, 50])
        approved = self.read('tools/approved.json')
        self.assertEqual(approved['صبر'], 50)
        self.assertEqual(approved['تحمل'], 999)
        self.assertEqual(result['result']['conflicts'], ['تحمل'])
        plan = self.read('translations/1_gemini.json')['plan']
        self.assertEqual(plan[0]['action'], 'sign')
        self.assertEqual(plan[0]['id'], 50)
        self.assertNotIn('letters', plan[0])
        self.assertEqual(plan[1]['action'], 'quran')
        self.assertEqual(plan[2]['action'], 'spell')

    def test_reject_after_accept_restores_every_file(self):
        self.decide('accepted')
        result = self.decide('rejected')
        self.assertEqual(result['list'], 'redesign')
        self.assertEqual(result['history'], ['accepted', 'rejected'])
        for path, data in self.originals.items():
            self.assertEqual(path.read_bytes(), data, path)
        self.assertFalse((self.root / 'sshi_motion/m/50.json').exists())

    def test_accept_twice_is_idempotent(self):
        self.decide('accepted')
        self.decide('accepted')
        self.assertEqual(self.read('sshi_motion/index.json'), [1, 2, 50])
        self.decide('rework')
        self.assertEqual(self.read('tools/approved.json'), {'تحمل': 999})

    def test_rejects_changed_or_incomplete_motion(self):
        with self.assertRaises(ValueError):
            self.decide('accepted', motion_sha256='other')
        with self.assertRaises(ValueError):
            self.decide('accepted', passes={})
        (self.root / 'sshi_motion/staging/50.json').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            self.decide('accepted')
        self.assertFalse((self.root / 'tools/motion_bank.json').exists())

    def test_rework_is_saved_without_provider(self):
        result = bank.decide({'id': 50, 'decision': 'rework', 'motion_sha256': self.sha, 'passes': {}})
        self.assertNotIn('suggestion', result)
        self.assertEqual(bank.state()['records']['50']['list'], 'review')

    def test_label_keys(self):
        self.assertEqual(bank.label_keys('‏صبر - تحمل'), ['صبر', 'تحمل'])
        self.assertEqual(bank.label_keys('مسجد النمرة'), ['مسجد النمره'])


if __name__ == '__main__':
    unittest.main()
