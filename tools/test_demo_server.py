import io
import json
import re
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import demo_server as demo


class DemoTests(unittest.TestCase):
    def test_only_reviewed_available_motions_play(self):
        result = demo.make_plan('لله كلمةمجهولة ﴿الحمد لله﴾')
        self.assertEqual([p['action'] for p in result['plan']], ['sign', 'pending', 'quran'])
        self.assertEqual(result['plan'][0]['id'], 377)
        self.assertTrue(result['plan'][0]['sources'][0]['locally_reviewed'])

    def test_unreviewed_exact_match_stays_pending(self):
        word = next(w for w in demo.WORDS if demo.norm(w['ar']) not in json.loads((demo.ROOT/'tools/approved.json').read_text(encoding='utf-8')) and len(w['ar'].split()) == 1)
        self.assertNotEqual(demo.make_plan(word['ar'])['plan'][0]['action'], 'sign')

    def test_invalid_input(self):
        for text in ['', 'a' * 4001, None, 'English only']:
            with self.assertRaises(ValueError):
                demo.make_plan(text)

    def test_preview_requires_unique_candidate_and_motion(self):
        word = next(w for w in demo.WORDS if str(w['id']) in demo.MOTIONS and len(demo.INDEX[demo.norm(w['ar'])]) == 1)
        result = demo.make_plan(word['ar'], True)
        self.assertEqual(result['plan'][0]['action'], 'sign')
        for item in demo.make_plan('كلمةمجهولة', True)['plan']:
            self.assertEqual(item['action'], 'pending')

    def test_longest_phrase_and_negation_preserved(self):
        phrase = next(key for key in demo.INDEX if len(key.split()) == 2 and all(re.fullmatch(r'[ء-ي]+', word) for word in key.split()))
        result = demo.make_plan('لا ' + phrase)
        self.assertEqual(result['plan'][0]['text'], 'لا')
        self.assertEqual(result['plan'][1]['text'], phrase)
        self.assertEqual(demo.lookup('ولا')[1], 'unknown' if 'ولا' not in demo.INDEX else 'dictionary')

    def test_suffix_suggestions_never_play(self):
        with patch.object(demo, 'lookup', return_value=([], 'unknown')), patch.object(demo, 'suggestions', return_value=['377']):
            item = demo.make_plan('كلماتنا', True)['plan'][0]
            self.assertEqual(item['how'], 'suffix-suggestion')
            self.assertEqual(item['action'], 'pending')

    def test_dictionary_synonym_inflection_is_indexed(self):
        self.assertIn('1227', demo.INDEX[demo.norm('اصبري')])

    def test_phrase_does_not_cross_punctuation(self):
        result = demo.make_plan('أركان، الاسلام')
        self.assertEqual(len(result['plan']), 2)

    def test_missing_provider_configuration(self):
        with patch.dict('os.environ', {}, clear=True), self.assertRaises(ValueError):
            demo.transcribe(b'audio', 'audio/wav')

    def test_missing_key_message_names_variable(self):
        with patch.dict('os.environ', {'BAYAN_AUDIO_MODEL': 'm'}, clear=True), self.assertRaises(ValueError) as error:
            demo.transcribe(b'audio', 'audio/wav')
        self.assertIn('GEMINI_API_KEY', str(error.exception))

    def test_default_model_and_stripped_key(self):
        response = io.BytesIO(json.dumps({'candidates': [{'content': {'parts': [{'text': '{"text": "بسم الله"}'}]}}]}).encode())
        with patch.dict('os.environ', {'GEMINI_API_KEY': ' test-only\n'}, clear=True), patch.object(demo.urllib.request, 'urlopen', return_value=response) as call:
            self.assertEqual(demo.transcribe(b'audio', 'audio/wav'), {'text': 'بسم الله', 'model': demo.DEFAULT_AUDIO_MODEL})
        request = call.call_args.args[0]
        self.assertEqual(request.get_header('X-goog-api-key'), 'test-only')
        self.assertIn(demo.DEFAULT_AUDIO_MODEL, request.full_url)

    def test_provider_errors_are_explained_without_key(self):
        cases = {400: ('API key not valid. AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE', 'GEMINI_API_KEY'), 403: ('denied', 'صلاحية'), 404: ('not found', 'BAYAN_AUDIO_MODEL'), 429: ('quota', 'حد الاستخدام')}
        for code, (message, expected) in cases.items():
            body = io.BytesIO(json.dumps({'error': {'message': message}}).encode())
            exc = urllib.error.HTTPError('https://example.invalid', code, 'x', {}, body)
            with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}, clear=True), patch.object(demo.urllib.request, 'urlopen', side_effect=exc), patch.object(demo.time, 'sleep'), patch('sys.stderr', io.StringIO()), self.assertRaises(ValueError) as error:
                demo.transcribe(b'audio', 'audio/wav')
            self.assertIn(expected, str(error.exception))
            self.assertIn(f'HTTP {code}', str(error.exception))
            self.assertNotIn('AIza', str(error.exception))

    def test_overloaded_model_falls_back_once(self):
        busy = urllib.error.HTTPError('https://example.invalid', 503, 'x', {}, io.BytesIO(b'{}'))
        ok = io.BytesIO(json.dumps({'candidates': [{'content': {'parts': [{'text': '{"text": "الحمد لله"}'}]}}]}).encode())
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}, clear=True), patch.object(demo.urllib.request, 'urlopen', side_effect=[busy, ok]) as call, patch.object(demo.time, 'sleep'), patch('sys.stderr', io.StringIO()):
            self.assertEqual(demo.transcribe(b'audio', 'audio/wav'), {'text': 'الحمد لله', 'model': demo.FALLBACK_AUDIO_MODEL})
        self.assertEqual(call.call_count, 2)
        busy_again = urllib.error.HTTPError('https://example.invalid', 503, 'x', {}, io.BytesIO(b'{}'))
        with patch.dict('os.environ', {'GEMINI_API_KEY': 'test-only'}, clear=True), patch.object(demo.urllib.request, 'urlopen', side_effect=[busy, busy_again]), patch.object(demo.time, 'sleep'), patch('sys.stderr', io.StringIO()), self.assertRaises(ValueError) as error:
            demo.transcribe(b'audio', 'audio/wav')
        self.assertIn('HTTP 503', str(error.exception))
        self.assertIn('ليست مشكلة في المفتاح', str(error.exception))

    def test_http_assets_and_security(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(demo.Handler, directory=str(demo.ROOT)))
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urllib.request.urlopen(base + '/khutbah.html') as response:
                self.assertIn('audioInput', response.read().decode())
            for path in ['/tools/approved.json', '/tools/.gemini_key', '/sshi_motion/src/1.mp4', '/%2e%2e/tools/approved.json']:
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base + path)
                self.assertEqual(error.exception.code, 404)
                error.exception.close()
            req = urllib.request.Request(base + '/api/plan', data=json.dumps({'text':'لله'}).encode(), headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(req) as response:
                self.assertEqual(json.load(response)['plan'][0]['action'], 'sign')
            req.add_header('Origin', 'https://example.com')
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(req)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
