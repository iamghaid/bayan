import unittest
from unittest.mock import patch
import demo_server as demo


class MeaningTests(unittest.TestCase):
    def test_references_do_not_approve_new_signs(self):
        result = demo.make_plan('إباحة')
        self.assertTrue(result['meaning_references'])
        self.assertTrue(all(p['action'] == 'pending' for p in result['plan']))

    def test_different_senses_are_preserved(self):
        references = [{'title': 'عين', 'url': 'https://example.org/1', 'review': 'pending'},
                      {'title': 'عين', 'url': 'https://example.org/2', 'review': 'pending'}]
        with patch.dict(demo.TERM_INDEX, {'عين': references}, clear=True):
            self.assertEqual(len(demo.term_references('عين')), 2)

    def test_phrases_never_cross_punctuation(self):
        with patch.dict(demo.TERM_INDEX, {'بر الوالدين': [{'title': 'بر الوالدين', 'url': 'https://example.org/1'}]}, clear=True):
            self.assertEqual(len(demo.term_references('بر الوالدين')), 1)
            self.assertEqual(demo.term_references('بر، الوالدين'), [])

    def test_existing_approved_playback_is_preserved(self):
        result = demo.make_plan('الله')
        self.assertEqual(result['plan'][0]['action'], 'sign')
        self.assertEqual(result['plan'][0]['id'], 377)

    def test_numbers_and_foreign_names_are_not_silently_dropped(self):
        result = demo.make_plan('موعد Zoom 2026/10/04')
        labels = [item['text'] for item in result['plan']]
        self.assertIn('Zoom', labels)
        self.assertIn('2026/10/04', labels)
