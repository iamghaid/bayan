"""
صفحة مراجعة الترجمة لمترجم لغة الإشارة.
التشغيل:  python tools/review_server.py      ثم افتح  http://localhost:8010
كل قرار يُحفظ فورًا في tools/approved.json أو tools/blocked.json ويُطبَّق على كل الخطب (بدون Gemini).
يعمل على جهازك فقط — لا يرفع شيئًا لأي موقع.
"""
import json, sys, pathlib, collections, urllib.parse, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import translate as T
from audit_lib import close

HERE = T.HERE; TOOLS = T.TOOLS; OUT = T.OUT
REVIEWED = TOOLS / 'reviewed.json'
LOCK = threading.Lock()

def jload(p, d):
    return json.loads(p.read_text(encoding='utf8')) if p.exists() else d
def jsave(p, v):
    p.write_text(json.dumps(v, ensure_ascii=False, indent=1), encoding='utf8')

def why(p):
    h = str(p.get('how', ''))
    if p.get('llm') in ('no-answer', 'invalid'): return 'لم يراجعه Gemini'
    if h.startswith('gemini-alt'): return 'بديل بالمعنى: ' + h.split(':', 1)[1]
    if h.startswith('alt-missing'): return 'لا إشارة لـ«' + h.split(':', 1)[1] + '» — ستُهجّأ'
    if h.startswith('blocked'): return 'إشارة ممنوعة سابقًا — ستُهجّأ'
    if p.get('conf') == 'review': return 'Gemini غير متأكد'
    if p['action'] == 'sign' and h.startswith('gemini') and not close(p['text'], p['sign']): return 'اسم الإشارة مختلف عن الكلمة'
    if p['action'] == 'spell': return 'ستُهجّأ حرفًا حرفًا'
    return None

def items():
    """كل القرارات المشكوك فيها من كل الخطب، مجمّعة حسب (الكلمة، القرار)"""
    done = jload(REVIEWED, {})
    groups = {}
    for f in sorted(OUT.glob('*_gemini.json')):
        d = json.loads(f.read_text(encoding='utf8'))
        for p in d['plan']:
            if p['action'] not in ('sign', 'spell') or p.get('how') in ('approved', 'phrase'): continue
            r = why(p)
            if not r: continue
            w = T.norm(p['text']); dec = p.get('id') if p['action'] == 'sign' else 'spell'
            k = f'{w}|{dec}'
            if k in done: continue
            g = groups.setdefault(k, {'key': k, 'word': p['text'], 'norm': w, 'action': p['action'], 'id': p.get('id') if p['action'] == 'sign' else None,
                                      'sign': p.get('sign'), 'why': r, 'count': 0, 'examples': [], 'files': set()})
            g['count'] += 1; g['files'].add(f.stem.replace('_gemini', ''))
            if len(g['examples']) < 2: g['examples'].append(d['sentences'][p['s']][:220])
    out = []
    for g in groups.values():
        g['files'] = sorted(g['files'])
        if g['id']: g['video'] = T.BYID[g['id']].get('video'); g['desc'] = T.BYID[g['id']].get('desc') or ''
        g['cands'] = [dict(c, video=T.BYID[c['id']].get('video')) for c in T.candidates(g['word'], limit=10) if c['id'] != g['id']]
        out.append(g)
    order = {'لم يراجعه Gemini': 0}
    out.sort(key=lambda g: (-g['count'], g['norm']))
    return out

def search(q):
    q = T.norm(q.strip())
    if len(q) < 2: return []
    hits = [w for w in T.WORDS if q in T.norm(w['ar']) or q in T.norm(w['syn'])]
    hits.sort(key=lambda w: (T.norm(w['ar']) != q, len(w['ar'])))
    return [{'id': w['id'], 'sign': w['ar'], 'cat': w['cat'], 'desc': w.get('desc') or '', 'video': w.get('video')} for w in hits[:15]]

def decide(b):
    """b: {key, norm, verdict: ok|bad|use|spell, id?, sign?}"""
    with LOCK:
        ap = jload(TOOLS / 'approved.json', {}); bl = jload(TOOLS / 'blocked.json', {}); done = jload(REVIEWED, {})
        w = b['norm']; v = b['verdict']
        if v == 'ok' and b.get('id'): ap[w] = int(b['id'])
        elif v == 'bad' and b.get('sign'):
            pair = [w, T.norm(b['sign'])]
            if pair not in bl.setdefault('_pairs', []): bl['_pairs'].append(pair)
            ap.pop(w, None)
        elif v == 'use' and b.get('id'): ap[w] = int(b['id'])
        elif v == 'spell':
            ap.pop(w, None)
            if b.get('sign'):
                pair = [w, T.norm(b['sign'])]
                if pair not in bl.setdefault('_pairs', []): bl['_pairs'].append(pair)
        elif v != 'skip': return {'ok': False}
        done[b['key']] = v
        jsave(TOOLS / 'approved.json', ap); jsave(TOOLS / 'blocked.json', bl); jsave(REVIEWED, done)
        T.APPROVED.clear(); T.APPROVED.update(ap); T.BLOCKED.clear(); T.BLOCKED.update(bl)
        for f in OUT.glob('*_gemini.json'):          # نطبّق القرار على كل الخطب فورًا
            d = json.loads(f.read_text(encoding='utf8'))
            T.finalize(d['plan']); txt, st = T.report(d['source'], d['sentences'], d['plan']); d['stats'] = st
            jsave(f, d); f.with_suffix('.txt').write_text(txt, encoding='utf8')
    return {'ok': True}

def stats():
    r = []
    for f in sorted(OUT.glob('*_gemini.json')):
        s = json.loads(f.read_text(encoding='utf8'))['stats']
        r.append({'name': f.stem.replace('_gemini', ''), 'sign': s['signs'] * 100 // max(1, s['work']), 'spell': s['spell'] * 100 // max(1, s['work'])})
    return r

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype='application/json; charset=utf-8'):
        b = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf8')
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        if u.path in ('/', '/review.html'): return self.send(200, (TOOLS / 'review.html').read_bytes(), 'text/html; charset=utf-8')
        if u.path == '/api/items': return self.send(200, {'items': items(), 'stats': stats(), 'done': len(jload(REVIEWED, {}))})
        if u.path == '/api/search': return self.send(200, search(q.get('q', [''])[0]))
        self.send(404, {'error': 'not found'})
    def do_POST(self):
        if self.path != '/api/decide': return self.send(404, {'error': 'not found'})
        b = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        self.send(200, decide(b))

if __name__ == '__main__':
    print('صفحة المراجعة: http://localhost:8010', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8010), H).serve_forever()
