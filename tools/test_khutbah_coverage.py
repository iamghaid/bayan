import unittest
from khutbah_coverage import weight


class CoverageTests(unittest.TestCase):
    def test_phrases_are_counted_as_words_not_single_sign_items(self):
        self.assertEqual(weight('لا إله إلا الله'), 4)

    def test_diacritics_do_not_inflate_word_count(self):
        self.assertEqual(weight('رَحْمَةٌ'), 1)
