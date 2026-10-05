"""Verify grounding, input boundaries and provider failure handling without live keys."""
import json
import os
import unittest
from unittest.mock import patch, MagicMock
from tools import review_assistant as assistant


class ReviewAssistantTests(unittest.TestCase):
    def test_unknown_and_invalid_motion(self):
        for value in (True, -1, '589', 9999999):
            with self.assertRaises(ValueError):
                assistant.motion_context(value)

    def test_context_has_no_media_and_no_visual_claim(self):
        context = assistant.motion_context(589)
        self.assertEqual(context['id'], 589)
        self.assertFalse(context['visual_inspection'])
        self.assertNotIn('video', context)
        self.assertNotIn('reference_file', context)

    def test_bad_question(self):
        for value in ('', 'x' * 2001, None, 123):
            with self.assertRaises(ValueError):
                assistant.suggest({'motion_id': 589, 'question': value})

    def test_provider_receives_grounded_context(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'candidates':[{'content':{'parts':[{'text':'افحص الرسغ عند التوقيت المحدد.'}]}}]}).encode()
        with patch.dict(os.environ, {'GEMINI_API_KEY':'test-only','BAYAN_REVIEW_MODEL':'test-model'}), patch.object(assistant.urllib.request,'urlopen',return_value=response) as call:
            result=assistant.suggest({'motion_id':589,'question':'كيف أفحص الرسغ؟','ar':'untrusted override'})
        sent=json.loads(call.call_args.args[0].data)
        context=json.loads(sent['contents'][0]['parts'][0]['text'])['motion']
        self.assertNotEqual(context['ar'],'untrusted override')
        self.assertEqual(result['motion_id'],589)
        self.assertFalse(result['visual_inspection'])

    def test_provider_failures_do_not_leak(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY':'test-only','BAYAN_REVIEW_MODEL':'test-model'}), patch.object(assistant.urllib.request,'urlopen',side_effect=OSError('private detail')):
            with self.assertRaises(ValueError) as error:
                assistant.suggest({'motion_id':589,'question':'سؤال'})
        self.assertNotIn('private detail',str(error.exception))

    def test_origin_restriction(self):
        request=object.__new__(assistant.ReviewAssistantHandler)
        request.headers={'Host':'khutbah-sign.vercel.app'}
        self.assertTrue(request.allowed_review_origin('https://khutbah-sign.vercel.app'))
        self.assertFalse(request.allowed_review_origin('https://other.example'))


if __name__ == '__main__':
    unittest.main()
