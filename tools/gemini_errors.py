"""Arabic explanations for Gemini HTTP failures, without echoing credentials."""
import json
import re
import sys

KEY_PATTERN = re.compile(r'AIza[A-Za-z0-9_-]{20,}')


def provider_error(exc, model_variable, bad_request):
    """Explain a Gemini HTTP failure in Arabic without echoing credentials."""
    try:
        detail = json.loads(exc.read().decode('utf-8', 'replace')).get('error', {})
    except (ValueError, OSError, AttributeError):
        detail = {}
    message = KEY_PATTERN.sub('***', str(detail.get('message', '')))[:200]
    print(f'gemini: HTTP {exc.code} {detail.get("status", "")} {message}', file=sys.stderr, flush=True)
    if exc.code == 400 and 'api key' in message.lower():
        reason = 'مفتاح GEMINI_API_KEY غير صالح. انسخه من جديد من Google AI Studio بدون مسافات.'
    elif exc.code == 400:
        reason = bad_request
    elif exc.code in (401, 403):
        reason = 'المفتاح مرفوض أو لا يملك صلاحية Gemini API. تأكد من المفتاح وتفعيل الخدمة في مشروع Google.'
    elif exc.code == 404:
        reason = f'اسم النموذج في {model_variable} غير متاح. احذف المتغير لاستخدام النموذج الافتراضي أو صحّح الاسم.'
    elif exc.code == 429:
        reason = 'تجاوزت حد الاستخدام عند المزوّد. انتظر دقيقة ثم حاول مجددًا.'
    elif exc.code >= 500:
        reason = 'خوادم Gemini مشغولة أو متوقفة مؤقتًا (ليست مشكلة في المفتاح). حاول بعد دقيقة.'
    else:
        reason = 'تعذر الاتصال بخدمة Gemini.'
    return f'{reason} (HTTP {exc.code})'
