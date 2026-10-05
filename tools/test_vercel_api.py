import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.transcribe import handler
from api.plan import handler as plan_handler


class VercelTests(unittest.TestCase):
    def test_same_host_origin(self):
        request = object.__new__(handler)
        request.headers = {'Host': 'khutbah-sign.vercel.app'}
        self.assertTrue(request.allowed_origin('https://khutbah-sign.vercel.app'))
        self.assertFalse(request.allowed_origin('https://other.vercel.app'))
        self.assertFalse(request.allowed_origin('http://khutbah-sign.vercel.app'))

    def test_shared_handler(self):
        self.assertTrue(issubclass(plan_handler, handler))


if __name__ == '__main__':
    unittest.main()
