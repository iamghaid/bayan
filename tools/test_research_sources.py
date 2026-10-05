import unittest
from research_sources import parse_titles, compare


class ResearchTests(unittest.TestCase):
    def test_only_valid_term_links_and_deduplicate(self):
        source = '''<h4><a href="https://terminologyenc.com/ar/browse/term/1">برٌّ &amp; <b>إحسان</b></a></h4>
        <h4><a href="https://terminologyenc.com/ar/browse/term/1">برٌّ &amp; <b>إحسان</b></a></h4>
        <h4><a href="https://other.example/term/2">خطأ</a></h4>'''
        rows = parse_titles(source)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['title'], 'برٌّ & إحسان')

    def test_candidates_never_approve_playback(self):
        row = compare({'title': 'الله', 'source_id': 'test', 'source_url': 'https://terminologyenc.com/ar'})
        self.assertFalse(row['playable_approved'])
        self.assertEqual(row['review'], 'pending')

    def test_unknown_term_does_not_get_invented_sign(self):
        row = compare({'title': 'مصطلحاختبارغيرموجود', 'source_id': 'test', 'source_url': 'https://terminologyenc.com/ar'})
        self.assertEqual(row['state'], 'new_term')
        self.assertEqual(row['candidate_sign_ids'], [])
