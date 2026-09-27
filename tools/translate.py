"""
مترجم الخطبة: نص عربي ← خطة إشارات كاملة (كل كلمة لها قرار).
  sign   : إشارة من قاموس لغة الإشارة السعودية (sshi.sa)
  spell  : تهجئة بحروف الإشارة السعودية (أسماء، أو كلمة بلا إشارة)
  drop   : أداة لا تُترجم بإشارة مستقلة (في، على، أن...)
الثقة: high = مطابقة مباشرة أو عبارة معروفة | review = عبر المحلل الصرفي، تحتاج اعتماد | low = تهجئة
الاستخدام:
  python tools/translate.py khutbah.txt            (ملف نص)
  python tools/translate.py https://...            (رابط خطبة)
المخرجات: translations/<الاسم>.json و translations/<الاسم>.txt
القرارات المعتمدة يدويًا في tools/approved.json و tools/blocked.json (تُعاد لكل الخطب).
"""
import json, re, sys, pathlib, urllib.request, html as H, collections
import qalsadi.lemmatizer

HERE = pathlib.Path(__file__).resolve().parent.parent
TOOLS = HERE / 'tools'; OUT = HERE / 'translations'; OUT.mkdir(exist_ok=True)
CACHE = HERE / 'coverage' / 'sshi_words_v2.json'
UA = {'User-Agent': 'Mozilla/5.0'}
AR = re.compile(r'[ء-يً-ٰٟـ]+')

def norm(s):
    s = re.sub(r'[ً-ٰٟـ]', '', s)
    s = re.sub(r'[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    return s

STOP = {norm(w) for w in '''في من على الى إلى عن ان أن إن ما ثم او أو قد لقد هذا هذه ذلك تلك الذي التي الذين اللذين اللاتي
كان كانت يكون هو هي هم هن انت أنت انتم أنتم نحن انا أنا اياكم إياكم به بها بهم له لها لهم لكم لنا عليه عليها عليهم عليكم
فيه فيها فيهم منه منها منهم منكم اليه إليه اليها إليها لي بل حتى الا إلا اي أي كما عند بين يا ايها أيها اما أما لما
لكن لكنه ولكن وان وإن فان فإن انه إنه انها إنها انهم إنهم ذا اذ إذ اذا إذا فلا ولا لم لن ليس
عنه عنها عنهم عنهما ومن وقد وهو وهي فهو فهي بما فيما مما عما وما فما
تعالى وتعالى سبحانه عز وجل'''.split()}                     # ألفاظ التعظيم بعد «الله» تُفهم من إشارة «الله»
PRE = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك']

# ---------- القاموس ----------
def load_words():
    if CACHE.exists(): return json.loads(CACHE.read_text(encoding='utf8'))
    d = json.load(urllib.request.urlopen(urllib.request.Request('https://sshi.sa/api/Words/Words?page=1&row=50000', headers=UA), timeout=120))
    ws = [{'id': w['id'], 'ar': (w.get('wordAr') or '').strip(), 'syn': (w.get('synonym') or '').strip(),
           'cat': (w.get('category') or {}).get('nameAr') or '', 'video': w.get('video'),
           'desc': '' if (w.get('description') or 'null') == 'null' else w.get('description')} for w in d['info']['data']]
    CACHE.parent.mkdir(exist_ok=True); CACHE.write_text(json.dumps(ws, ensure_ascii=False), encoding='utf8')
    return ws

WORDS = load_words()
BYID = {w['id']: w for w in WORDS}
DICT, LETTERS, MULTI = {}, {}, {}
for w in WORDS:
    ar = w['ar']
    if re.search(r'حروف', w['cat']):
        n = norm(re.sub(r'^حرف\s*(ال)?', '', ar)).strip()
        if len(n) == 1: LETTERS.setdefault(n, w['id'])
        continue
    if re.search(r'ارقام|أرقام', w['cat']): continue
    names = [ar] + re.split(r'\s*[-/()،,]\s*', ar)
    names += w['syn'].split() if len(ar.split()) == 1 else [w['syn']]
    for n in names:
        n = re.sub(r'\s+', ' ', norm(n)).strip(' ؟?.')
        if len(n) >= 2 and n != 'null':
            DICT.setdefault(n, w['id'])
            if w['id'] not in MULTI.setdefault(n, []): MULTI[n].append(w['id'])   # كل الإشارات بالاسم نفسه
MAXPH = max(len(k.split()) for k in DICT)

APPROVED = json.loads((TOOLS / 'approved.json').read_text(encoding='utf8')) if (TOOLS / 'approved.json').exists() else {}
BLOCKED = json.loads((TOOLS / 'blocked.json').read_text(encoding='utf8')) if (TOOLS / 'blocked.json').exists() else {}
LEM = qalsadi.lemmatizer.Lemmatizer()

# فهرس الجذور: كلمة بلا إشارة مباشرة («التوكل») تجد إشارات من نفس الجذر («توكل»، «وكيل») ويختار Gemini المعنى المناسب
import tashaphyne.stemming as _ST
_STEM = _ST.ArabicLightStemmer()
def root(w):
    try: _STEM.light_stem(w); return _STEM.get_root()
    except Exception: return ''
ROOTS = {}
for _n, _ids in MULTI.items():
    if ' ' not in _n and len(_n) >= 3:
        r = root(_n)
        if len(r) >= 3:
            for _i in _ids:
                if _i not in ROOTS.setdefault(r, []): ROOTS[r].append(_i)

def strip_pre(t):
    out = [t]
    for p in PRE:
        if t.startswith(p) and len(t) - len(p) >= 2: out.append(t[len(p):])
    return out

def alt_lookup(phrase):
    """عبارة بديلة اقترحها Gemini (مثل «تقوى الله») ← id إشارة إن وُجدت في القاموس"""
    p = re.sub(r'\s+', ' ', norm(phrase)).strip(' .؟?')
    if p in APPROVED: return APPROVED[p]
    for k in [p] + strip_pre(p):
        if k in DICT and k not in BLOCKED: return DICT[k]
    if ' ' not in p:
        r = lookup_word(phrase)
        if r and r[1] == 'high': return r[0]
    return None

def candidates(raw, limit=8):
    """كل الإشارات المحتملة لكلمة (بكل المعاني ومن نفس الجذر) ليختار منها النموذج حسب السياق"""
    t = norm(raw); ids = []
    keys = strip_pre(t)
    try: lem = norm(LEM.lemmatize(raw)); keys += [lem, lem.replace('ه', '')]
    except Exception: pass
    if t in APPROVED: ids.append(APPROVED[t])
    for k in keys:
        if len(k) < 2 or k in BLOCKED: continue
        ids += MULTI.get(k, [])
        if len(k) >= 3: ids += MULTI.get('ال' + k, [])          # «صبر» و«الصبر» قد تكونان إشارتين
    if len(ids) < limit and len(t) >= 3 and t not in STOP:
        r = root(t)
        if len(r) >= 3: ids += ROOTS.get(r, [])[:limit]         # نفس الجذر: قد يكون المعنى نفسه أو لا — القرار لـ Gemini
    out = []
    for i in dict.fromkeys(ids):
        w = BYID[i]; out.append({'id': i, 'sign': w['ar'], 'cat': w['cat'], 'desc': w.get('desc') or ''})
    return out[:limit]

def lookup_word(raw):
    """يعيد (id, الثقة, الطريقة) أو None"""
    t = norm(raw)
    if t in APPROVED: return APPROVED[t], 'high', 'approved'
    if t in BLOCKED: return None
    for c in strip_pre(t):
        if c in DICT and len(c) >= 2 and c not in BLOCKED: return DICT[c], 'high', 'exact'
    try: lem = norm(LEM.lemmatize(raw))
    except Exception: lem = ''
    for c in {lem, lem.replace('ه', '')} - {''}:
        if len(c) >= 3 and c in DICT and c not in BLOCKED and ('lemma:' + c) not in BLOCKED:
            return DICT[c], 'review', 'lemma:' + c
    return None

# ---------- الترجمة ----------
def spell(raw):
    t = norm(raw)
    for p in ['وال', 'فال', 'بال', 'ال', 'و', 'ف']:          # نتهجأ الاسم بلا سوابق
        if t.startswith(p) and len(t) - len(p) >= 3: t = t[len(p):]; break
    return [LETTERS.get(ch) for ch in t], t

END = re.compile(r'أضف تعليقك|حقوق النشر محفوظة|الألوكة تقترب منك|^\s*\[\d+\]|^\s*(?:الهوامش|المراجع|الحواشي)\s*:?\s*$', re.M)
SALAWAT = re.compile(r'صل[ىي]\s+الله\s+عليه\s+و\s*على\s+آله(?:\s+و\s*(?:صحبه|أصحابه|سلم)|\s+أجمعين)*')
SALAWAT2 = re.compile(r'(?<![ء-ي])(?:اللهم\s+)?صل[ىي]?\s+(?:الله\s+)?و\s*سلم(?:\s+و\s*بارك)?(?:\s+عليه)?(?![ء-ي])')

def translate(text):
    h = re.search(r'الحمد', text)
    m = END.search(text, h.start() if h else 0)
    if m: text = text[:m.start()]                                   # قص تعليقات الموقع وتذييله والهوامش
    text = SALAWAT.sub('صلى الله عليه وسلم', text)                  # «...وعلى آله وصحبه وسلم» ← إشارة الصلاة على النبي
    text = SALAWAT2.sub('صلى الله عليه وسلم', text)                 # «صلى الله وسلم عليه»، «اللهم صل وسلم»
    text = re.sub(r'\[[^\]]{0,60}\]', ' ', text)                   # إحالات مثل [البقرة: 281]
    sents = [s.strip() for s in re.split(r'(?<=[.!?؟:])\s+|\n+', text) if AR.search(s)]
    start = next((k for k, s in enumerate(sents) if re.search(r'الحمد|إن الحمد|ان الحمد', s)), 0)
    sents = sents[start:]                                             # ما قبل «الحمد لله» غالبًا قوائم الموقع واسم الكاتب
    plan = []
    for si, s in enumerate(sents):
        for seg in re.split(r'(﴿[^﴾]*﴾?)', s):
            if not AR.search(seg): continue
            if seg.startswith('﴿'):
                # الآيات لا تُترجم كلمة كلمة — تُعرض نصًا مع إشارة «آية»، والقرار النهائي للمختص الشرعي
                plan.append({'s': si, 'text': seg.strip('﴿﴾ '), 'action': 'quran', 'id': DICT.get('ايه') or DICT.get('الايه')}); continue
            translate_segment(seg, si, plan)
    return sents, plan

def translate_segment(s, si, plan):
        toks = AR.findall(s); nt = [norm(t) for t in toks]; i = 0
        while i < len(toks):
            hit = None
            for n in range(min(MAXPH, len(toks) - i), 1, -1):          # أطول عبارة معروفة أولًا
                key = ' '.join(nt[i:i + n])
                for k in (key, key[1:] if key[:1] in 'وف' else None):
                    if k and k in DICT: hit = (n, DICT[k]); break
                if hit: break
            if hit:
                plan.append({'s': si, 'text': ' '.join(toks[i:i + hit[0]]), 'action': 'sign', 'id': hit[1],
                             'sign': BYID[hit[1]]['ar'], 'conf': 'high', 'how': 'phrase'}); i += hit[0]; continue
            t = toks[i]; i += 1
            if nt[i - 1] in STOP or len(nt[i - 1]) < 2:
                plan.append({'s': si, 'text': t, 'action': 'drop'}); continue
            r = lookup_word(t)
            if r:
                plan.append({'s': si, 'text': t, 'action': 'sign', 'id': r[0], 'sign': BYID[r[0]]['ar'], 'conf': r[1], 'how': r[2]})
            else:
                ids, base = spell(t)
                plan.append({'s': si, 'text': t, 'action': 'spell', 'letters': ids, 'base': base, 'conf': 'low',
                             'missing_letters': [ch for ch, x in zip(base, ids) if x is None]})

def finalize(plan):
    """بعد Gemini: نملأ اسم الإشارة/حروف التهجئة، ونطبّق قائمة المنع مهما كان القرار"""
    for p in plan:
        t = norm(p['text'])
        if p.get('how') == 'blocked-pair':                              # نعيد فحص المنع بعد أي تعديل على blocked.json
            p.update(action='sign', how=p.pop('how0', 'gemini')); p.pop('letters', None)
        if t in APPROVED and p['action'] != 'quran':                   # القرارات المعتمدة يدويًا تغلب أي قرار آلي
            p.update(action='sign', id=APPROVED[t], conf='high', how='approved')
        elif t in STOP and p['action'] in ('sign', 'spell') and p.get('how') != 'phrase':
            p.update(action='drop', how='stop')
        if p['action'] == 'sign' and p.get('how') not in ('phrase', 'approved'):
            sg = norm(BYID[p['id']]['ar'])
            if any(norm(a) in t and norm(b) in sg for a, b in BLOCKED.get('_pairs', [])):
                p['how0'] = p.get('how'); p.update(action='spell', conf='review', how='blocked-pair'); p.pop('letters', None)
        if p['action'] == 'sign':
            if norm(p['text']) in BLOCKED or str(p['id']) in BLOCKED.get('_ids', []):
                p.update(action='spell', conf='review', how='blocked')
            else: p['sign'] = BYID[p['id']]['ar']
        if p['action'] == 'spell' and 'letters' not in p:
            ids, base = spell(p['text']); p.update(letters=ids, base=base, missing_letters=[ch for ch, x in zip(base, ids) if x is None])
        if p['action'] != 'sign': p.pop('sign', None)

# ---------- الإدخال والمخرجات ----------
def fetch_text(url):
    h = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode('utf8', 'replace')
    c = re.search(r'class=[\'"][^\'"]*\b(?:commentBox|comments?-?(?:area|list|section)|btnSortHolder)\b', h)
    if c: h = h[:c.start()]                                           # تعليقات الزوار ليست من الخطبة
    h = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<footer.*?</footer>|<header.*?</header>', ' ', h, flags=re.S | re.I)
    paras = [re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', p))).strip() for p in re.findall(r'<(?:p|div)[^>]*>(.*?)</(?:p|div)>', h, flags=re.S)]
    paras = [p for p in paras if len(AR.findall(p)) >= 12 and '<' not in p]
    body = []
    for p in paras:
        if not any(p in b for b in body): body.append(p)
    return '\n'.join(body)

def report(name, sents, plan):
    c = collections.Counter(p['action'] for p in plan)
    conf = collections.Counter(p.get('conf') for p in plan if p['action'] == 'sign')
    work = [p for p in plan if p['action'] != 'drop']
    signs = {p['id'] for p in plan if p['action'] == 'sign'}
    letters_used = {x for p in plan if p['action'] == 'spell' for x in p['letters'] if x}
    miss_letters = collections.Counter(ch for p in plan if p['action'] == 'spell' for ch in p['missing_letters'])
    review = collections.Counter((norm(p['text']), p.get('sign', p['action']), p.get('how', '')) for p in plan if p.get('conf') == 'review')
    spelled = collections.Counter(p['base'] for p in plan if p['action'] == 'spell')
    L = [f'# ترجمة: {name}', f'الكلمات: {len(plan)} عنصر | تُترجم: {len(work)} | إشارة: {c["sign"]} ({c["sign"] * 100 // max(1, len(work))}%) '
         f'[مباشرة/عبارة: {conf["high"]} — Gemini واثق: {conf["llm"]} — تحتاج اعتماد: {conf["review"]}] | آيات (نص): {c["quran"]} | تهجئة: {c["spell"]} ({c["spell"] * 100 // max(1, len(work))}%) | أدوات محذوفة: {c["drop"]}',
         f'إشارات مختلفة مطلوبة: {len(signs)} + {len(letters_used)} حرفًا للتهجئة' + (f' | حروف بلا إشارة: {dict(miss_letters)}' if miss_letters else ''), '']
    for si, s in enumerate(sents):
        parts = []
        for p in (x for x in plan if x['s'] == si):
            if p['action'] == 'sign': parts.append(f'[{p["sign"]}]' + ('?' if p['conf'] == 'review' else ''))
            elif p['action'] == 'spell': parts.append('~' + '-'.join(p['base']) + '~' + ('?' if p.get('conf') == 'review' else ''))
            elif p['action'] == 'quran': parts.append('«آية: نص فقط»')
        L += [f'{si + 1}. {s}', '   ← ' + ' '.join(parts), '']
    ch = [p for p in plan if 'before' in p]
    if ch:
        L += [f'# تصحيحات Gemini من السياق ({len(ch)})'] + [f'«{p["text"]}»: {p["before"]} ← {p.get("sign") or p["action"]}' for p in ch[:150]] + ['']
    L += ['# مطابقات تحتاج اعتماد (كلمة ← إشارة) — اعتمدها في approved.json أو امنعها في blocked.json']
    L += [f'{w} ← {sg} ({how}) ×{n}' for (w, sg, how), n in review.most_common()]
    L += ['', '# كلمات ستُهجّأ (الأكثر تكرارًا) — مرشحة لتسجيل إشارة'] + [f'{w} ×{n}' for w, n in spelled.most_common(60)]
    return '\n'.join(L), {'signs': c['sign'], 'spell': c['spell'], 'drop': c['drop'], 'work': len(work), 'high': conf['high'], 'review': conf['review'], 'unique_signs': sorted(signs)}

if __name__ == '__main__':
    if '--reapply' in sys.argv:
        # بعد تعديل approved.json/blocked.json: نعيد تطبيقها على ترجمات محفوظة بدون استهلاك حصة Gemini
        for name in [a for a in sys.argv[1:] if not a.startswith('--')]:
            f = OUT / f'{name}.json'; d = json.loads(f.read_text(encoding='utf8'))
            finalize(d['plan']); txt, st = report(d['source'], d['sentences'], d['plan']); d['stats'] = st
            f.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf8'); (OUT / f'{name}.txt').write_text(txt, encoding='utf8')
            print(txt.split('\n\n')[0], '\n')
        sys.exit()
    use_llm = '--llm' in sys.argv
    for src in [a for a in sys.argv[1:] if not a.startswith('--')]:
        text = fetch_text(src) if src.startswith('http') else pathlib.Path(src).read_text(encoding='utf8')
        name = re.sub(r'[^\w؀-ۿ]+', '_', src.rstrip('/').split('/')[-1] or 'khutbah')[:40] + ('_gemini' if use_llm else '')
        sents, plan = translate(text)
        if use_llm:
            import llm_gemini
            n = llm_gemini.refine(sents, plan, lambda it: candidates(it['text']), alt_of=alt_lookup)
            print(f'Gemini غيّر {n} قرارًا')
        finalize(plan)
        txt, st = report(src, sents, plan)
        (OUT / f'{name}.json').write_text(json.dumps({'source': src, 'sentences': sents, 'plan': plan, 'stats': st}, ensure_ascii=False, indent=1), encoding='utf8')
        (OUT / f'{name}.txt').write_text(txt, encoding='utf8')
        print(txt.split('\n\n')[0], '\n', f'← translations/{name}.txt', '\n')
    print('حروف التهجئة في القاموس:', len(LETTERS), ''.join(sorted(LETTERS)))
