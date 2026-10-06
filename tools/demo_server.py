"""Local audio/text demo. Run: python tools/demo_server.py"""
import base64
import json
import os
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
try:
    from tools import motion_catalog, team_bank
    from tools.motion_bank import BankHandler, label_keys
    from tools.review_assistant import ReviewAssistantHandler, provider_error
except ModuleNotFoundError:
    import motion_catalog
    import team_bank
    from motion_bank import BankHandler, label_keys
    from review_assistant import ReviewAssistantHandler, provider_error

ROOT = Path(__file__).resolve().parent.parent
MAX_AUDIO = 4 * 1024 * 1024
MIMES = {'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/flac'}
WORDS = json.loads((ROOT / 'coverage/sshi_words_v2.json').read_text(encoding='utf-8'))
BY_ID = {str(w['id']): w for w in WORDS}
TERM_FILE = ROOT / 'coverage/research/terminology_candidates.json'
MORPH_FILE = ROOT / 'coverage/research/morphology_candidates.json'
MORPH_INDEX = json.loads(MORPH_FILE.read_text(encoding='utf-8'))['words'] if MORPH_FILE.exists() else {}


def norm(text):
    return re.sub('[أإآٱ]', 'ا', re.sub(r'[\u064b-\u065f\u0670ـ]', '', text)).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')


TERM_INDEX = {}
if TERM_FILE.exists():
    for term in json.loads(TERM_FILE.read_text(encoding='utf-8')):
        TERM_INDEX.setdefault(' '.join(norm(term['title']).split()), []).append(
            {'title': term['title'], 'url': term['source_url'], 'review': 'pending'})


def term_references(text):
    """Meaning references only; title agreement never approves a sign."""
    tokens = re.findall(r'[ء-ي\u064b-\u065f\u0670ـ]+|[^\sء-ي\u064b-\u065f\u0670ـ]', text)
    found, seen = [], set()
    for start in range(len(tokens)):
        for size in range(min(12, len(tokens) - start), 0, -1):
            key = ' '.join(norm(t) for t in tokens[start:start + size])
            if key in TERM_INDEX:
                for reference in TERM_INDEX[key]:
                    if reference['url'] not in seen:
                        found.append({**reference, 'text': ' '.join(tokens[start:start + size])})
                        seen.add(reference['url'])
                break
    return found


INDEX = {}
DIRECT_INDEX = {}
MOTIONS = {p.stem for p in (ROOT / 'sshi_motion/m').glob('*.json')}
for word in WORDS:
    for direct in [word['ar']] + re.split(r'[,،;؛/\n]+', word.get('syn') or ''):
        direct_key = ' '.join(norm(direct).split()).strip()
        if direct_key and direct_key != 'null':
            direct_ids = DIRECT_INDEX.setdefault(direct_key, [])
            if str(word['id']) not in direct_ids:
                direct_ids.append(str(word['id']))
    # Synonyms separated explicitly in the source; do not split phrases into words.
    names = re.split(r'\s*[-/()،,؛;:]\s*', word['ar'])
    names.append(word['ar'])
    synonyms = re.split(r'[,،;؛/:\n]+', word.get('syn') or '')
    names += synonyms
    # Single-word source entries sometimes list inflections separated by spaces.
    # Keep these as proposed aliases, never as reviewed semantic equivalence.
    if len(word['ar'].split()) == 1:
        names += (word.get('syn') or '').split()
    # Article-free aliases extend recall while retaining all competing sign IDs.
    for name in names[:]:
        parts = name.split()
        if parts:
            names.append(' '.join(p[2:] if norm(p).startswith('ال') and len(p) > 4 else p for p in parts))
    for name in names:
        key = ' '.join(norm(name).split()).strip()
        if key and key != 'null':
            ids = INDEX.setdefault(key, [])
            if str(word['id']) not in ids:
                ids.append(str(word['id']))
# Direct source matches take precedence over derived aliases.
INDEX.update(DIRECT_INDEX)
MAX_PHRASE = min(12, max(len(key.split()) for key in INDEX))


def lookup(text):
    key = norm(text)
    if key in INDEX:
        return INDEX[key], 'dictionary'
    # Only propose clitic variants; they remain unreviewed, never drop negation.
    if ' ' not in key and key not in {'لا', 'لم', 'لن', 'ليس', 'ولا', 'فلا'}:
        variants = []
        if key[:1] in {'و', 'ف'} and len(key) > 3:
            variants.append(key[1:])
        for value in [key] + variants[:]:
            if value.startswith('لل') and len(value) > 4:
                variants.append('ال' + value[2:])
            if value[:1] in {'ب', 'ك', 'ل'} and len(value) > 4:
                variants.append(value[1:])
            if value.startswith('ال') and len(value) > 4:
                variants.append(value[2:])
        # Two clitic layers: وبالصلاة -> الصلاة -> صلاة; no root guessing.
        for value in variants[:]:
            if value.startswith('ال') and len(value) > 4:
                variants.append(value[2:])
            if value[:1] in {'ب', 'ك', 'ل'} and len(value) > 4:
                variants.append(value[1:])
        hits = list(dict.fromkeys(ident for variant in variants for ident in INDEX.get(variant, [])))
        if hits:
            return hits, 'clitic-candidate'
        morphology = MORPH_INDEX.get(text)
        if morphology:
            return morphology['candidate_ids'], 'morphology-candidate' if morphology['analyses'] == 1 else 'morphology-ambiguous'
    return [], 'unknown'


def suggestions(text):
    """Suffix variants are review suggestions only; never automatically played."""
    key = norm(text)
    if ' ' in key or key in {'لا', 'لم', 'لن', 'ليس', 'ولا', 'فلا'}:
        return []
    stems = []
    for suffix in ('كما', 'هما', 'كم', 'كن', 'هم', 'هن', 'نا', 'ها', 'ه', 'ي', 'ات', 'ون', 'ين', 'ان'):
        if key.endswith(suffix) and len(key) - len(suffix) >= 3:
            stem = key[:-len(suffix)]
            stems += [stem, stem + 'ه']
    return list(dict.fromkeys(ident for stem in stems for ident in lookup(stem)[0]))[:20]


LETTERS = {}
for word in WORDS:
    if 'حروف' in (word.get('cat') or '') and str(word['id']) in MOTIONS:
        letter = norm(re.sub(r'^حرف\s*(ال)?', '', word['ar'])).strip()
        if len(letter) == 1:
            LETTERS.setdefault(letter, word['id'])


def spell(text):
    """Fingerspelling letter IDs, without leading clitics (same rule as translate.py)."""
    key = norm(text)
    for prefix in ('وال', 'فال', 'بال', 'ال', 'و', 'ف'):
        if key.startswith(prefix) and len(key) - len(prefix) >= 3:
            key = key[len(prefix):]
            break
    return [LETTERS.get(ch) for ch in key], key


def staged_ids():
    return {row['id'] for row in motion_catalog.build(ROOT) if row.get('source') == 'staging' and not row.get('schema_errors')}


def team_approved():
    """New motions the review team accepted on the hosted site: {id: (row, record)}.
    Empty when no team database is connected or it cannot be reached (planning never fails on it)."""
    if not team_bank.configured():
        return {}
    try:
        records = team_bank.records()
    except ValueError:
        return {}
    rows = {row['id']: row for row in motion_catalog.build(ROOT) if row.get('source') == 'staging' and not row.get('schema_errors')}
    return {int(key): (rows[int(key)], record) for key, record in records.items()
            if key.isdigit() and int(key) in rows and record.get('list') == 'trusted'
            and record.get('motion_sha256') == rows[int(key)].get('motion_sha256')}


def make_plan(text, preview_unreviewed=False):
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('أدخل نصًا من 1 إلى 4000 حرف.')
    if not re.search(r'[ء-ي]', text):
        raise ValueError('لم نجد نصًا عربيًا قابلًا للمعالجة.')
    approved = json.loads((ROOT / 'tools/approved.json').read_text(encoding='utf-8'))
    sentences = [s.strip() for s in re.split(r'(?<=[.!؟])|\n+', text) if s.strip()]
    plan = []
    for si, sentence in enumerate(sentences):
        tokens = re.findall(r'﴿[^﴾]*﴾|\[غير واضح\]|[ء-ي\u064b-\u065f\u0670ـ]+|[A-Za-z]+|\d+(?:[./:-]\d+)*|[,،;؛:]', sentence)
        position = 0
        while position < len(tokens):
            token = tokens[position]
            position += 1
            if token in {',', '،', ';', '؛', ':'}:
                continue
            if not token.startswith(('﴿', '[')):
                for length in range(min(MAX_PHRASE, len(tokens) - position + 1), 1, -1):
                    phrase_tokens = tokens[position - 1:position - 1 + length]
                    if any(t in {',', '،', ';', '؛', ':'} or t.startswith(('﴿', '[')) for t in phrase_tokens):
                        continue
                    phrase = ' '.join(phrase_tokens)
                    if norm(phrase) in INDEX:
                        token = phrase
                        position += length - 1
                        break
            item = {'s': si, 'text': token, 'action': 'pending', 'conf': 'review', 'sources': []}
            if token.startswith('﴿'):
                item['action'] = 'quran'
                item['text'] = token[1:-1]
            else:
                key = norm(token)
                chosen = str(approved[key]) if key in approved else None
                candidates, how = lookup(token)
                if not candidates and not chosen:
                    candidates = suggestions(token)
                    if candidates:
                        how = 'suffix-suggestion'
                candidates = [chosen] if chosen else candidates
                item['how'] = 'approved' if chosen else how
                for ident in candidates:
                    if ident not in BY_ID:
                        continue
                    w = BY_ID[ident]
                    motion = ident in MOTIONS
                    item['sources'].append({'id': ident, 'sign': w['ar'], 'source': 'https://sshi.sa', 'motion': motion, 'locally_reviewed': chosen == ident})
                if chosen and chosen in BY_ID and (ROOT / f'sshi_motion/m/{chosen}.json').is_file():
                    item.update(action='sign', id=int(chosen), sign=BY_ID[chosen]['ar'], conf='high')
                elif preview_unreviewed and how not in {'suffix-suggestion', 'morphology-ambiguous'} and len(candidates) == 1 and candidates[0] in MOTIONS:
                    ident = candidates[0]
                    item.update(action='sign', id=int(ident), sign=BY_ID[ident]['ar'], conf='review', preview_only=True)
                item['reason'] = 'ambiguous' if len(candidates) > 1 else 'unreviewed' if candidates else 'unknown'
                if how.startswith('morphology-'):
                    item['morphology'] = MORPH_INDEX[token]
                    if how == 'morphology-ambiguous':
                        item['reason'] = 'ambiguous'
            plan.append(item)
    if not plan:
        raise ValueError('لم نجد نصًا عربيًا قابلًا للمعالجة.')
    references = term_references(text)
    for item in plan:
        item['meaning_sources'] = term_references(item['text']) if item['action'] != 'quran' else []
    holds_file = ROOT / 'tools/translation_holds.json'
    holds = json.loads(holds_file.read_text(encoding='utf-8')) if holds_file.exists() else {}
    for item in plan:
        if item['action'] != 'quran' and norm(item['text']) in holds:
            item.update(action='pending', conf='review', reason='reported-translation-issue',
                        review_note=holds[norm(item['text'])])
            item.pop('id', None)
            item.pop('preview_only', None)
    # New signs the team accepted play straight away (same word rule as motion_bank: the sign's label
    # and its listed alternatives); words already linked in approved.json keep their sign.
    accepted = team_approved()
    team_words = {}
    for ident, (row, record) in accepted.items():
        for key in label_keys(row.get('ar', '')):
            if key not in approved:
                team_words.setdefault(key, ident)
    for item in plan:
        if item['action'] not in {'pending', 'spell'} or item.get('reason') == 'reported-translation-issue':
            continue
        key = ' '.join(norm(item['text']).split())
        ident = team_words.get(key)
        if ident is None:
            hits = [int(source['id']) for source in item['sources'] if int(source['id']) in accepted]
            ident = hits[0] if len(hits) == 1 and len(item['sources']) == 1 else None
        if ident is not None:
            row, record = accepted[ident]
            item.update(action='sign', id=ident, sign=row.get('ar', ''), conf='team', motion_dir='staging',
                        team_approved={'reviewer': record.get('reviewer', ''), 'at': record.get('at', '')})
            for name in ('letters', 'under_review', 'preview_only'):
                item.pop(name, None)
    # A new sign still under review is fingerspelled until the reviewer accepts it.
    staged = staged_ids() - set(accepted)
    for item in plan:
        if item['action'] != 'pending' or item.get('reason') == 'reported-translation-issue':
            continue
        new = [source for source in item['sources'] if not source['motion'] and int(source['id']) in staged]
        letters, base = spell(item['text'])
        if new and letters and None not in letters:
            item.update(action='spell', letters=letters, base=base, reason='new-sign-under-review',
                        under_review={'id': int(new[0]['id']), 'sign': new[0]['sign']})
    return {'sentences': sentences, 'plan': plan, 'meaning_references': references, 'coverage': {'meaning_entries': sum(len(v) for v in TERM_INDEX.values()), 'entries': len(WORDS), 'aliases': len(INDEX), 'motions': len(MOTIONS), 'playable': sum(p['action'] == 'sign' for p in plan), 'pending': sum(p['action'] == 'pending' for p in plan)}, 'note': 'معاينة تجريبية: الأحمر غير مراجع. المطابقات الملتبسة والحركات المفقودة تبقى نصًا. سجل المراجعة المحلي لا يثبت اعتماد الجملة أو أداء الأفتار.'}


DEFAULT_AUDIO_MODEL = 'gemini-flash-latest'
FALLBACK_AUDIO_MODEL = 'gemini-flash-lite-latest'
RETRY_CODES = {429, 500, 502, 503, 504}


def transcribe(data, mime):
    key = os.environ.get('GEMINI_API_KEY', '').strip()
    model = os.environ.get('BAYAN_AUDIO_MODEL', '').strip() or DEFAULT_AUDIO_MODEL
    if not key:
        raise ValueError('التفريغ غير مهيأ: مفتاح GEMINI_API_KEY غير موجود في إعدادات الخادم (Vercel: Settings ← Environment Variables ثم أعد النشر؛ محليًا: اضبطه في نافذة PowerShell قبل تشغيل الخادم).')
    if not re.fullmatch(r'[a-zA-Z0-9._-]{1,100}', model):
        raise ValueError('قيمة BAYAN_AUDIO_MODEL غير صالحة. احذفها لاستخدام النموذج الافتراضي.')
    prompt = 'فرغ الكلام العربي المسموع حرفيًا فقط، دون تلخيص أو إضافة أو إكمال آيات أو تصحيح المعنى. ضع [غير واضح] للجزء غير المسموع. إذا لا يوجد كلام أعد نصًا فارغًا. أعد JSON بمفتاح text.'
    body = {'contents': [{'parts': [{'text': prompt}, {'inline_data': {'mime_type': mime, 'data': base64.b64encode(data).decode()}}]}], 'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'}}
    # Overloaded providers answer 503/429; retry once on a lighter model within Vercel's 60 s limit.
    models = list(dict.fromkeys([model, FALLBACK_AUDIO_MODEL]))
    for attempt, current in enumerate(models):
        req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{current}:generateContent', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        try:
            with urllib.request.urlopen(req, timeout=30 if attempt == 0 else 24) as response:
                result = json.load(response)
            model = current
            break
        except urllib.error.HTTPError as exc:
            if exc.code in RETRY_CODES and attempt + 1 < len(models):
                print(f'transcribe: HTTP {exc.code} from {current}; retrying with {models[attempt + 1]}', file=sys.stderr, flush=True)
                time.sleep(1)
                continue
            raise ValueError(provider_error(exc, 'BAYAN_AUDIO_MODEL', 'رفض المزوّد ملف الصوت أو الطلب. جرّب تسجيلًا أقصر أو ملف MP3/WAV.')) from None
        except (TimeoutError, socket.timeout):
            raise ValueError('انتهت مهلة التفريغ. جرّب مقطعًا أقصر.') from None
        except (urllib.error.URLError, OSError):
            raise ValueError('تعذر الاتصال بخدمة التفريغ من الخادم. تحقق من الشبكة ثم حاول مجددًا.') from None
    try:
        raw = ''.join(p.get('text', '') for p in result['candidates'][0]['content']['parts'] if not p.get('thought'))
        text = json.loads(raw)['text']
        if not isinstance(text, str) or len(text) > 4000:
            raise ValueError()
        return {'text': text, 'model': model}
    except (KeyError, IndexError, TypeError, ValueError):
        reason = (result.get('promptFeedback') or {}).get('blockReason') if isinstance(result, dict) else None
        raise ValueError('رفض المزوّد المقطع.' if reason else 'تعذر الحصول على تفريغ صالح. حاول لاحقًا أو أدخل النص يدويًا.') from None


class Handler(SimpleHTTPRequestHandler):
    def allowed_origin(self, origin):
        return origin in {'http://localhost:8020', 'http://127.0.0.1:8020'}

    def log_message(self, *args):
        pass

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Serve only demo/player assets; do not expose tools, source videos or secrets.
        path = self.path.split('?')[0]
        if path == '/api/bank':
            return BankHandler.bank_get(self)
        if path == '/api/catalog':
            return self.send_json(200, motion_catalog.build(ROOT))
        allowed = {'/', '/index.html', '/workspace.js', '/khutbah.html', '/khutbah.js', '/demo.js', '/demo.css', '/interface.css', '/fonts.css', '/unified-view.js', '/motion-review.html', '/motion-review.js', '/review-assistant.js', '/handfix.js', '/signfix.js', '/signer.js', '/man_dress.js'}
        valid = path in allowed or bool(re.fullmatch(r'/lib/(three\.min\.js|GLTFLoader\.js|three-vrm\.min\.js)|/avatar/man\.glb|/fonts/thmanyah[a-z]+-(Regular|Medium|Bold)\.woff2|/sshi_motion/index\.json|/sshi_motion/(m|staging)/\d+\.json|/translations/\d+_gemini\.json', path))
        if not valid:
            return self.send_json(404, {'error': 'غير موجود'})
        return super().do_GET()

    def do_HEAD(self):
        self.send_error(405)

    def do_POST(self):
        if self.path == '/api/review_assistant':
            return ReviewAssistantHandler.do_POST(self)
        if self.path == '/api/decision':
            return BankHandler.bank_post(self)
        if self.path not in {'/api/plan', '/api/transcribe'}:
            return self.send_json(404, {'error': 'غير موجود'})
        origin = self.headers.get('Origin')
        if origin and not self.allowed_origin(origin):
            return self.send_json(403, {'error': 'مصدر الطلب غير مسموح'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            limit = 20000 if self.path == '/api/plan' else MAX_AUDIO
            if not 0 < size <= limit:
                return self.send_json(413, {'error': 'ملف فارغ أو أكبر من الحد المسموح.'})
            mime = self.headers.get('Content-Type', '').split(';')[0]
            if self.path == '/api/transcribe' and mime not in MIMES:
                return self.send_json(415, {'error': 'صيغة الصوت غير مدعومة.'})
            data = self.rfile.read(size)
            if self.path == '/api/plan':
                payload = json.loads(data)
                result = make_plan(payload.get('text'), payload.get('preview_unreviewed') is True)
            else:
                result = transcribe(data, mime)
            self.send_json(200, result)
        except (ValueError, TypeError, AttributeError) as exc:
            self.send_json(400, {'error': str(exc) if isinstance(exc, ValueError) and not isinstance(exc, json.JSONDecodeError) else 'طلب غير صالح.'})


class DemoServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


if __name__ == '__main__':
    server = DemoServer(('127.0.0.1', 8020), partial(Handler, directory=str(ROOT)))
    print('Bayan demo: http://127.0.0.1:8020/khutbah.html', flush=True)
    print('GEMINI_API_KEY: ' + ('configured' if os.environ.get('GEMINI_API_KEY') else 'MISSING'), flush=True)
    print('BAYAN_AUDIO_MODEL: ' + (os.environ.get('BAYAN_AUDIO_MODEL') or f'default ({DEFAULT_AUDIO_MODEL})'), flush=True)
    server.serve_forever()
