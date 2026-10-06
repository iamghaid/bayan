import unittest

import demo_server


class GreetingTests(unittest.TestCase):
    """The full greeting is one sign in the source dictionary (4857, listed with its long forms)."""
    def test_full_greeting_is_one_sign(self):
        for text in ('السلام عليكم ورحمة الله وبركاته', 'السلامُ عليكمْ ورحمةُ اللهِ وبركاتُه',
                     'السلام عليكم', 'سلام عليكم', 'السلام عليكم ورحمة الله'):
            plan = demo_server.make_plan(text)['plan']
            self.assertEqual([(item['action'], item.get('id')) for item in plan], [('sign', 4857)], text)

    def test_greeting_then_more_words(self):
        plan = demo_server.make_plan('السلام عليكم ورحمة الله وبركاته، الله')['plan']
        self.assertEqual([item.get('id') for item in plan], [4857, 377])


if __name__ == '__main__':
    unittest.main()
