import unittest
from unittest.mock import patch
import demo_server as demo


class MorphologyTests(unittest.TestCase):
    def entry(self, analyses):
        return {'candidate_ids': ['377'], 'analyses': analyses, 'lemmas': ['الله'], 'review': 'pending'}

    def test_ambiguous_analysis_never_plays_even_with_one_matching_sign(self):
        with patch.dict(demo.MORPH_INDEX, {'صيغةتجريبية': self.entry(2)}, clear=True):
            row = demo.make_plan('صيغةتجريبية', True)['plan'][0]
            self.assertEqual(row['action'], 'pending')
            self.assertEqual(row['reason'], 'ambiguous')

    def test_single_analysis_requires_explicit_unreviewed_preview(self):
        with patch.dict(demo.MORPH_INDEX, {'صيغةتجريبية': self.entry(1)}, clear=True):
            self.assertEqual(demo.make_plan('صيغةتجريبية')['plan'][0]['action'], 'pending')
            row = demo.make_plan('صيغةتجريبية', True)['plan'][0]
            self.assertTrue(row['preview_only'])
            self.assertEqual(row['how'], 'morphology-candidate')

    def test_negation_not_replaced_by_morphology(self):
        with patch.dict(demo.MORPH_INDEX, {'لم': self.entry(1)}, clear=True):
            self.assertNotIn(demo.lookup('لم')[1], {'morphology-candidate', 'morphology-ambiguous'})
