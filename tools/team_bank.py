"""Shared team decisions for the hosted review page.

Every reviewer on the team sees the same three banks. Decisions are stored in the database
connected to the Vercel project: Neon Postgres (DATABASE_URL, through Neon's HTTPS SQL
endpoint) or Upstash Redis (KV_REST_API_*, REST). Both use urllib, so no package is needed. Writing needs the team password (REVIEW_PASSWORD); reading is open to anyone
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
import urllib.parse
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


NOT_CONNECTED = 'قاعدة بيانات الفريق غير موصولة بعد (Vercel: Storage ← Neon).'
UNREACHABLE = 'تعذر الوصول إلى قاعدة بيانات الفريق. حاول مجددًا.'


def _postgres_url():
    # Vercel's Neon integration may add a custom prefix (e.g. bayan_DATABASE_URL).
    for suffix in ('DATABASE_URL', 'POSTGRES_URL', 'DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING'):
        for name in sorted(os.environ, key=len):
            value = os.environ[name]
            if (name == suffix or name.endswith('_' + suffix)) and value.startswith(('postgres://', 'postgresql://')):
                return value
    return ''


def _redis():
    url = os.environ.get('KV_REST_API_URL') or os.environ.get('UPSTASH_REDIS_REST_URL') or ''
    token = os.environ.get('KV_REST_API_TOKEN') or os.environ.get('UPSTASH_REDIS_REST_TOKEN') or ''
    return url.rstrip('/'), token


def configured():
    return bool(_postgres_url() or all(_redis()))


def _post(url, body, headers):
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                     headers={'Content-Type': 'application/json', **headers})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error).get('message', '')
        except ValueError:
            detail = ''
        raise ValueError('رفضت قاعدة بيانات الفريق الطلب.' + (f' ({detail[:120]})' if detail and 'password' not in detail.lower() else '')) from None
    except (urllib.error.URLError, OSError, ValueError):
        raise ValueError(UNREACHABLE) from None


def _sql(query, params=()):
    """One statement over Neon's HTTPS endpoint; rows come back as lists of text."""
    url = _postgres_url()
    host = urllib.parse.urlsplit(url).hostname or ''
    api_host = 'api.' + host.split('.', 1)[1] if '.' in host else host   # same rule as @neondatabase/serverless
    result = _post(f'https://{api_host}/sql', {'query': query, 'params': list(params)},
                   {'Neon-Connection-String': url, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true'})
    return result.get('rows') or []


def _command(*args):
    url, token = _redis()
    result = _post(url, list(args), {'Authorization': 'Bearer ' + token})
    if 'error' in result:
        raise ValueError('رفضت قاعدة بيانات الفريق الطلب.')
    return result.get('result')


_ready = False


def _ensure_tables():
    global _ready
    if not _ready:
        _sql('CREATE TABLE IF NOT EXISTS bayan_decisions (id text PRIMARY KEY, record jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())')
        _sql('CREATE TABLE IF NOT EXISTS bayan_history (n bigserial PRIMARY KEY, entry jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now())')
        _ready = True


def records():
    if _postgres_url():
        _ensure_tables()
        pairs = _sql('SELECT id, record::text FROM bayan_decisions')
    elif all(_redis()):
        flat = _command('HGETALL', KEY) or []
        pairs = list(zip(flat[::2], flat[1::2]))
    else:
        raise ValueError(NOT_CONNECTED)
    out = {}
    for field, value in pairs:
        try:
            out[str(field)] = json.loads(value)
        except (TypeError, ValueError):
            continue
    return out


def _save(identifier, record):
    text = json.dumps(record, ensure_ascii=False)
    entry = json.dumps({k: record[k] for k in ('id', 'decision', 'reviewer', 'at')}, ensure_ascii=False)
    if _postgres_url():
        _ensure_tables()
        _sql('INSERT INTO bayan_decisions (id, record) VALUES ($1, $2::jsonb) '
             'ON CONFLICT (id) DO UPDATE SET record = EXCLUDED.record, updated_at = now()', (str(identifier), text))
        _sql('INSERT INTO bayan_history (entry) VALUES ($1::jsonb)', (entry,))
    elif all(_redis()):
        _command('HSET', KEY, str(identifier), text)
        _command('RPUSH', HISTORY, entry)
    else:
        raise ValueError(NOT_CONNECTED)


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
    _save(identifier, record)
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
            payload = json.loads(self.rfile.read(size))
            if isinstance(payload, dict) and payload.get('check') is True:   # login: password is right
                return self.send_json(200, {'ok': True})
            self.send_json(200, decide(payload))
        except (ValueError, UnicodeDecodeError) as error:
            message = 'طلب غير صالح.' if isinstance(error, (json.JSONDecodeError, UnicodeDecodeError)) else str(error)
            self.send_json(400, {'error': message})


if __name__ == '__main__':
    if '--apply' not in sys.argv:
        raise SystemExit('Usage: set DATABASE_URL (from Vercel → Storage → Neon), then python tools/team_bank.py --apply')
    for identifier, label, bank_list in apply_accepted():
        print(f'{identifier} {label}: {bank_list}')
    print('Done. Review the changes, then commit and push.')
