"""Shared team decisions for the hosted review page.

Every reviewer on the team sees the same three banks. Decisions are stored in a Redis
database (Upstash, connected to the Vercel project) through its REST API, so no package
is needed. Writing needs the team password (REVIEW_PASSWORD); reading is open to anyone
who can open the review page.

Hosted decisions do not edit the sermons by themselves: `python tools/team_bank.py --apply`
on the owner's computer applies accepted motions through motion_bank (copy into the
library, approved.json, sermon plans), then the owner pushes.
"""
import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from tools import motion_catalog, review_assistant
except ModuleNotFoundError:
    import motion_catalog
    import review_assistant

KEY = 'bayan:decisions'
HISTORY = 'bayan:history'
LISTS = {'accepted': 'trusted', 'rework': 'review', 'rejected': 'redesign'}
PASSES = ('joints', 'clarity', 'fidelity', 'depth')


def _store():
    url = os.environ.get('KV_REST_API_URL') or os.environ.get('UPSTASH_REDIS_REST_URL') or ''
    token = os.environ.get('KV_REST_API_TOKEN') or os.environ.get('UPSTASH_REDIS_REST_TOKEN') or ''
    return url.rstrip('/'), token


def configured():
    url, token = _store()
    return bool(url and token)


def _command(*args):
    url, token = _store()
    if not (url and token):
        raise ValueError('قاعدة بيانات الفريق غير موصولة بعد (Vercel: Storage ← Upstash for Redis).')
    request = urllib.request.Request(url, data=json.dumps(list(args)).encode(), method='POST',
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.load(response)
    except (urllib.error.URLError, OSError, ValueError):
        raise ValueError('تعذر الوصول إلى قاعدة بيانات الفريق. حاول مجددًا.') from None
    if 'error' in result:
        raise ValueError('رفضت قاعدة بيانات الفريق الطلب.')
    return result.get('result')


def records():
    flat = _command('HGETALL', KEY) or []
    out = {}
    for field, value in zip(flat[::2], flat[1::2]):
        try:
            out[field] = json.loads(value)
        except ValueError:
            continue
    return out


def password_ok(given):
    expected = os.environ.get('REVIEW_PASSWORD', '')
    return bool(expected) and isinstance(given, str) and hmac.compare_digest(given.encode(), expected.encode())


def _suggestion(identifier, decision, note, passes):
    issues = [name for name, value in passes.items() if value == 'issue']
    question = (f"قرار المراجع: {'رفض' if decision == 'rejected' else 'إعادة للمراجعة'}. "
                f"الجوانب التي فيها عيب: {'، '.join(issues) or 'غير محددة'}. ملاحظة المراجع: {note or 'لا توجد'}. "
                'اقترح خطوات محددة لتصحيح هذه الحركة قبل مراجعتها مرة أخرى.')[:2000]
    try:
        return review_assistant.suggest({'motion_id': identifier, 'question': question})['answer'], None
    except ValueError as error:
        return None, str(error)


def decide(payload, root=None, suggest=_suggestion):
    if not isinstance(payload, dict):
        raise ValueError('طلب غير صالح.')
    identifier, decision = payload.get('id'), payload.get('decision')
    if isinstance(identifier, bool) or not isinstance(identifier, int) or decision not in LISTS:
        raise ValueError('طلب غير صالح.')
    reviewer = payload.get('reviewer') if isinstance(payload.get('reviewer'), str) else ''
    reviewer = ' '.join(reviewer.split())[:60]
    if not reviewer:
        raise ValueError('اكتب اسمك قبل تسجيل القرار.')
    note = payload.get('note') if isinstance(payload.get('note'), str) else ''
    passes = payload.get('passes') if isinstance(payload.get('passes'), dict) else {}
    passes = {key: str(passes.get(key, 'pending'))[:20] for key in PASSES}
    row = motion_catalog.row(identifier, root)
    if payload.get('motion_sha256') != row.get('motion_sha256'):
        raise ValueError('ملف الحركة تغيّر؛ أعد تحميل الصفحة وراجعه من جديد.')
    if decision == 'accepted' and (row.get('schema_errors') or any(passes[key] != 'checked' for key in PASSES)):
        raise ValueError('للاعتماد، أكمل المراجعات الأربع وتأكد أن ملف الحركة سليم.')
    previous = records().get(str(identifier)) or {}
    record = {'id': identifier, 'ar': row.get('ar', ''), 'decision': decision, 'list': LISTS[decision],
              'note': note[:4000], 'passes': passes, 'motion_sha256': row.get('motion_sha256'),
              'reviewer': reviewer, 'at': datetime.now(timezone.utc).isoformat(), 'team': True,
              'history': (previous.get('history') or [])[-20:] + [{'decision': decision, 'reviewer': reviewer, 'at': None}]}
    record['history'][-1]['at'] = record['at']
    if decision != 'accepted':
        record['suggestion'], record['suggestion_error'] = suggest(identifier, decision, note, passes)
    _command('HSET', KEY, str(identifier), json.dumps(record, ensure_ascii=False))
    _command('RPUSH', HISTORY, json.dumps({k: record[k] for k in ('id', 'decision', 'reviewer', 'at')}, ensure_ascii=False))
    return record


def apply_accepted():
    """Owner's computer: bring team approvals into the library and sermon plans via motion_bank."""
    try:
        from tools import motion_bank
    except ModuleNotFoundError:
        import motion_bank
    local = motion_bank.read_json(motion_bank.paths()['bank'], {})
    done = []
    for key, record in sorted(records().items(), key=lambda item: item[1].get('at', '')):
        if local.get(key, {}).get('at') == record.get('at') or local.get(key, {}).get('team_at') == record.get('at'):
            continue
        result = motion_bank.decide({'id': record['id'], 'decision': record['decision'], 'note': record.get('note', ''),
                                     'passes': record.get('passes', {}), 'motion_sha256': record.get('motion_sha256')},
                                    suggest=lambda *args: (record.get('suggestion'), record.get('suggestion_error')))
        bank = motion_bank.read_json(motion_bank.paths()['bank'], {})
        bank[key]['team_at'], bank[key]['reviewer'] = record['at'], record.get('reviewer')
        motion_bank.write_json(motion_bank.paths()['bank'], bank)
        done.append((record['id'], record.get('ar'), result['list']))
    return done


class TeamHandler:
    """GET /api/bank and POST /api/decision on the hosted site."""
    def team_get(self):
        if not configured():
            return self.send_json(404, {'error': 'قاعدة بيانات الفريق غير موصولة بعد.'})
        try:
            self.send_json(200, {'available': True, 'mode': 'team', 'records': records()})
        except ValueError as error:
            self.send_json(503, {'error': str(error)})

    def team_post(self):
        origin = self.headers.get('Origin')
        if origin and origin != 'https://' + self.headers.get('Host', ''):
            return self.send_json(403, {'error': 'مصدر الطلب غير مسموح.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.send_json(415, {'error': 'استخدم JSON.'})
        if not os.environ.get('REVIEW_PASSWORD'):
            return self.send_json(503, {'error': 'كلمة سر المراجعين غير مضبوطة في إعدادات الموقع (REVIEW_PASSWORD).'})
        if not password_ok(self.headers.get('X-Review-Key', '')):
            return self.send_json(401, {'error': 'كلمة سر المراجعين غير صحيحة.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 20000:
                return self.send_json(413, {'error': 'الطلب أكبر من الحد المسموح.'})
            self.send_json(200, decide(json.loads(self.rfile.read(size))))
        except (ValueError, UnicodeDecodeError) as error:
            message = 'طلب غير صالح.' if isinstance(error, (json.JSONDecodeError, UnicodeDecodeError)) else str(error)
            self.send_json(400, {'error': message})


if __name__ == '__main__':
    if '--apply' not in sys.argv:
        raise SystemExit('Usage: set KV_REST_API_URL and KV_REST_API_TOKEN, then python tools/team_bank.py --apply')
    for identifier, label, bank_list in apply_accepted():
        print(f'{identifier} {label}: {bank_list}')
    print('Done. Review the changes, then commit and push.')
