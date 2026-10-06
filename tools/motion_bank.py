"""Local sign banks: reviewer decisions sort every motion into three lists.

- trusted (معتمد): accepted. Staged motions are copied into the playback library,
  the dictionary label is added to tools/approved.json, and matching words in the saved
  sermons switch to the sign.
- review (قيد المراجعة): no decision yet, or returned for another comparison with the video.
- redesign (يحتاج مراجعة): rejected; must be rebuilt. Stored with an AI correction suggestion.
Every change is recorded in tools/motion_bank.json so a later decision can undo it.
Runs only on the owner's loopback servers; the hosted site is read-only.
"""
import hashlib
import json
import re
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
try:
    from tools import motion_catalog, review_assistant
except ModuleNotFoundError:
    import motion_catalog
    import review_assistant

ROOT = Path(__file__).resolve().parents[1]
LOCAL_HOSTS = {'127.0.0.1:8020', 'localhost:8020', '127.0.0.1:8021', 'localhost:8021'}
LISTS = {'accepted': 'trusted', 'rework': 'review', 'rejected': 'redesign'}
DECISIONS = set(LISTS)
PASSES = ('joints', 'clarity', 'fidelity', 'depth')
LOCK = threading.Lock()


def norm(text):
    text = re.sub(r'[\u064b-\u065f\u0670\u0640]', '', text)
    return re.sub('[أإآٱ]', 'ا', text).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')


def clean(label):
    """Drop direction marks that the source dictionary leaves around labels."""
    return re.sub(r'[\u200e\u200f\u202a-\u202e]', '', label).strip()


def label_keys(label):
    """Approved-word keys for a dictionary label: the whole label and its listed alternatives."""
    label = clean(label)
    parts = [label] + re.split(r'\s*[-/()،,؛;:]\s*', label)
    keys = (' '.join(norm(part).split()) for part in parts)
    return list(dict.fromkeys(key for key in keys if len(key) >= 2 and not re.search(r'[-/()،,؛;:]', key)))


def read_json(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def write_json(path, data, indent=1):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=indent), encoding='utf-8')
    temporary.replace(path)


def paths():
    return {'bank': ROOT / 'tools/motion_bank.json', 'approved': ROOT / 'tools/approved.json',
            'blocked': ROOT / 'tools/blocked.json', 'holds': ROOT / 'tools/translation_holds.json',
            'index': ROOT / 'sshi_motion/index.json',
            'library': ROOT / 'sshi_motion/m', 'staging': ROOT / 'sshi_motion/staging', 'plans': ROOT / 'translations'}


def catalog_row(identifier):
    return motion_catalog.row(identifier, ROOT)


def summary(record):
    """Public view of a bank record without the stored undo data."""
    return {key: value for key, value in record.items() if key != 'undo'}


def state():
    return {'available': True, 'mode': 'local', 'records': {key: summary(value) for key, value in read_json(paths()['bank'], {}).items()}}


def check_promotable(identifier, row, copied_before):
    """Fail before any undo or copy when the staged file is missing or changed."""
    p = paths()
    if (p['library'] / f'{identifier}.json').exists() and not copied_before:
        return
    source = p['staging'] / f'{identifier}.json'
    if not source.is_file():
        raise ValueError('ملف الحركة غير موجود في staging؛ لا يمكن نقله إلى بنك الإشارات.')
    if hashlib.sha256(source.read_bytes()).hexdigest() != row.get('motion_sha256'):
        raise ValueError('ملف الحركة تغيّر بعد التدقيق؛ أعد تشغيل staging_audit.py ثم راجعه من جديد.')


def promote(identifier, row):
    """Move one accepted motion into playback and the saved sermons; return undo data and a report."""
    p = paths()
    target = p['library'] / f'{identifier}.json'
    copied = not target.exists()
    if copied:
        shutil.copy2(p['staging'] / f'{identifier}.json', target)
    index = read_json(p['index'], [])
    indexed = identifier not in index
    if indexed:
        write_json(p['index'], sorted(index + [identifier]), indent=None)
    approved = read_json(p['approved'], {})
    added, conflicts = [], []
    for key in label_keys(row.get('ar', '')):
        if key not in approved:
            approved[key] = identifier
            added.append(key)
        elif approved[key] != identifier:
            conflicts.append(key)
    if added:
        write_json(p['approved'], approved)
    blocked = read_json(p['blocked'], {})
    holds = read_json(p['holds'], {})
    blocked_ids = {str(value) for value in blocked.get('_ids', [])}
    changes = []
    if added and str(identifier) not in blocked_ids:
        for plan_file in sorted(p['plans'].glob('*_gemini.json')):
            data = read_json(plan_file, {})
            changed = False
            for position, item in enumerate(data.get('plan', [])):
                key = norm(item.get('text', ''))
                if key not in added or item.get('action') == 'quran' or key in holds or key in blocked:
                    continue
                changes.append({'file': plan_file.name, 'position': position, 'before': dict(item)})
                for field in ('letters', 'base', 'missing_letters', 'preview_only', 'review_note'):
                    item.pop(field, None)
                item.update(action='sign', id=identifier, sign=clean(row['ar']), conf='high', how='approved')
                changed = True
            if changed:
                write_json(plan_file, data)
    undo = {'copied': copied, 'indexed': indexed, 'approved_keys': added, 'plan_changes': changes}
    return undo, {'words': added, 'conflicts': conflicts, 'sermon_items': len(changes)}


def demote(identifier, undo):
    """Reverse exactly what promote() changed, leaving later manual edits alone."""
    p = paths()
    by_file = {}
    for change in undo.get('plan_changes', []):
        by_file.setdefault(change['file'], []).append(change)
    for name, changes in by_file.items():
        plan_file = p['plans'] / name
        data = read_json(plan_file, {})
        for change in changes:
            plan = data.get('plan', [])
            if change['position'] < len(plan) and plan[change['position']].get('id') == identifier:
                plan[change['position']] = change['before']
        write_json(plan_file, data)
    approved = read_json(p['approved'], {})
    removed = [key for key in undo.get('approved_keys', []) if approved.get(key) == identifier]
    for key in removed:
        del approved[key]
    if removed:
        write_json(p['approved'], approved)
    if undo.get('indexed'):
        index = read_json(p['index'], [])
        write_json(p['index'], [value for value in index if value != identifier], indent=None)
    if undo.get('copied'):
        (p['library'] / f'{identifier}.json').unlink(missing_ok=True)


def ai_suggestion(identifier, decision, note, passes):
    issues = [name for name, value in (passes or {}).items() if value == 'issue']
    question = (f"قرار المراجع: {'رفض' if decision == 'rejected' else 'إعادة للمراجعة'}. "
                f"الجوانب التي فيها عيب: {'، '.join(issues) or 'غير محددة'}. ملاحظة المراجع: {note or 'لا توجد'}. "
                'اقترح خطوات محددة لتصحيح هذه الحركة قبل مراجعتها مرة أخرى.')[:2000]
    try:
        return review_assistant.suggest({'motion_id': identifier, 'question': question})['answer'], None
    except ValueError as error:
        return None, str(error)


def decide(payload, suggest=ai_suggestion):
    if not isinstance(payload, dict):
        raise ValueError('طلب غير صالح.')
    identifier, decision = payload.get('id'), payload.get('decision')
    if isinstance(identifier, bool) or not isinstance(identifier, int) or decision not in DECISIONS:
        raise ValueError('طلب غير صالح.')
    note = payload.get('note') if isinstance(payload.get('note'), str) else ''
    passes = payload.get('passes') if isinstance(payload.get('passes'), dict) else {}
    row = catalog_row(identifier)
    if payload.get('motion_sha256') != row.get('motion_sha256'):
        raise ValueError('ملف الحركة تغيّر؛ أعد تحميل الصفحة وراجعه من جديد.')
    if decision == 'accepted' and (row.get('schema_errors') or any(passes.get(key) != 'checked' for key in PASSES)):
        raise ValueError('للاعتماد، أكمل المراجعات الأربع وتأكد أن ملف الحركة سليم.')
    with LOCK:
        bank = read_json(paths()['bank'], {})
        previous = bank.get(str(identifier))
        if decision == 'accepted':
            check_promotable(identifier, row, (previous or {}).get('undo', {}).get('copied', False))
        if previous and previous.get('undo'):
            demote(identifier, previous['undo'])
        record = {'id': identifier, 'ar': clean(row.get('ar', '')), 'decision': decision, 'note': note[:4000],
                  'passes': {key: str(passes.get(key, 'pending'))[:20] for key in PASSES}, 'motion_sha256': row.get('motion_sha256'),
                  'at': datetime.now(timezone.utc).isoformat(),
                  'history': (previous or {}).get('history', []) + [decision]}
        record['list'] = LISTS[decision]
        if decision == 'accepted':
            record['undo'], record['result'] = promote(identifier, row)
        bank[str(identifier)] = record
        write_json(paths()['bank'], bank)
    if decision == 'accepted':
        return summary(record)
    # The decision is already saved; a slow or failed provider call never loses it.
    answer, error = suggest(identifier, decision, note, passes)
    record['suggestion'], record['suggestion_error'] = answer, error
    with LOCK:
        bank = read_json(paths()['bank'], {})
        if bank.get(str(identifier), {}).get('at') == record['at']:
            bank[str(identifier)] = record
            write_json(paths()['bank'], bank)
    return summary(record)


class BankHandler:
    """GET /api/bank and POST /api/decision for the owner's loopback servers only."""
    def bank_json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def bank_local(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host in LOCAL_HOSTS and (origin is None or origin == 'http://' + host)

    def bank_get(self):
        if not BankHandler.bank_local(self):
            return BankHandler.bank_json(self, 404, {'error': 'بنك الإشارات متاح على الخادم المحلي فقط.'})
        BankHandler.bank_json(self, 200, state())

    def bank_post(self):
        if not BankHandler.bank_local(self):
            return BankHandler.bank_json(self, 403, {'error': 'بنك الإشارات متاح على الخادم المحلي فقط.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return BankHandler.bank_json(self, 415, {'error': 'استخدم JSON.'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 20000:
                return BankHandler.bank_json(self, 413, {'error': 'الطلب أكبر من الحد المسموح.'})
            BankHandler.bank_json(self, 200, decide(json.loads(self.rfile.read(size))))
        except (ValueError, UnicodeDecodeError) as error:
            message = 'طلب غير صالح.' if isinstance(error, (json.JSONDecodeError, UnicodeDecodeError)) else str(error)
            BankHandler.bank_json(self, 400, {'error': message})
