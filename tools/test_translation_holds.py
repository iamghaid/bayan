import json
import unittest
from demo_server import ROOT, make_plan, norm


class TranslationHoldTests(unittest.TestCase):
    def test_plural_does_not_play_in_preview(self):
        for text in ['الأنبياء', 'أنبياء']:
            with self.subTest(text=text):
                item = make_plan(text, True)['plan'][0]
                self.assertEqual(item['action'], 'pending')
                self.assertEqual(item['reason'], 'reported-translation-issue')
                self.assertNotIn('id', item)

    def test_surah_is_a_different_entry(self):
        item = make_plan('سورة الأنبياء', True)['plan'][0]
        self.assertEqual(item['text'], 'سورة الأنبياء')
        self.assertEqual([s['id'] for s in item['sources']], ['557'])
        self.assertNotEqual(item.get('reason'), 'reported-translation-issue')

    def test_saved_plans_do_not_keep_reported_plural_sign(self):
        count = 0
        for path in (ROOT / 'translations').glob('*_gemini.json'):
            for item in json.loads(path.read_text(encoding='utf-8'))['plan']:
                if norm(item.get('text', '')) in {'الانبياء', 'انبياء'}:
                    count += 1
                    self.assertEqual(item['action'], 'pending')
                    self.assertNotIn('id', item)
        self.assertGreaterEqual(count, 2)
