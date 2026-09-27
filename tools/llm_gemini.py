"""
فهم المعنى من السياق عبر Gemini: لكل جملة، يختار النموذج لكل كلمة إشارة من المرشحين فقط
(من قاموس لغة الإشارة السعودية)، أو التهجئة، أو الحذف — ولا يُسمح له باختراع إشارة.
المفتاح: متغير البيئة GEMINI_API_KEY، أو ملف tools/.gemini_key (لا تشاركه ولا ترفعه).
النموذج: يُختار تلقائيًا (أحدث flash متاح لمفتاحك)، أو حدده بـ GEMINI_MODEL.
"""
import json, os, re, time, pathlib, urllib.request, urllib.error

BASE = 'https://generativelanguage.googleapis.com/v1beta'
KEYFILE = pathlib.Path(__file__).with_name('.gemini_key')

def api_key():
    k = os.environ.get('GEMINI_API_KEY', '')
    for f in (KEYFILE, KEYFILE.with_name('.gemini_key.txt')):     # المفكرة تضيف .txt تلقائيًا
        if not k and f.exists(): k = f.read_text(encoding='utf-8-sig').strip()
    if not k: raise SystemExit('لا يوجد مفتاح Gemini: ضعه في tools/.gemini_key أو في متغير البيئة GEMINI_API_KEY')
    return k

def _get(url):
    return json.load(urllib.request.urlopen(url, timeout=60))

busy = {}
MODELS = []   # قائمة احتياطية: لكل نموذج حصة يومية مستقلة في الخطة المجانية (20 طلبًا/يوم تقريبًا)

def pick_model(key):
    global MODELS
    if os.environ.get('GEMINI_MODEL'): MODELS = [os.environ['GEMINI_MODEL']]; return MODELS[0]
    ms = _get(f'{BASE}/models?key={key}&pageSize=200').get('models', [])
    ok = [m['name'].split('/')[-1] for m in ms if 'generateContent' in m.get('supportedGenerationMethods', [])]
    bad = ('image', 'tts', 'audio', 'live', 'omni', 'preview', 'exp')
    ver = lambda m: float((re.findall(r'(\d+(?:\.\d+)?)', m) or ['0'])[0])
    flash = sorted([m for m in ok if 'flash' in m and 'lite' not in m and not any(b in m for b in bad) and ver(m) >= 3], key=ver, reverse=True)
    lite = sorted([m for m in ok if 'flash-lite' in m and not any(b in m for b in bad)], key=ver, reverse=True)
    MODELS = flash + lite + [m for m in ('gemini-flash-latest', 'gemini-flash-lite-latest') if m in ok]
    if not MODELS: raise SystemExit('لا توجد نماذج متاحة لهذا المفتاح')
    return MODELS[0]

def ask_json(key, model, prompt, tries=12):
    body = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                       'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'}}).encode('utf8')
    for n in range(tries):
        model = MODELS[0] if MODELS else model
        url = f'{BASE}/models/{model}:generateContent?key={key}'
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}), timeout=90))
            txt = ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts'] if not p.get('thought'))
            return json.loads(txt)
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf8', 'replace')
            if e.code == 429 and 'PerDay' in msg and len(MODELS) > 1:   # انتهت حصة اليوم لهذا النموذج ← التالي
                print(f'    انتهت حصة اليوم لـ {MODELS.pop(0)} ← الانتقال إلى {MODELS[0]}', flush=True); continue
            if e.code == 404 and len(MODELS) > 1:
                MODELS.pop(0); continue
            if e.code in (500, 502, 503, 504) and len(MODELS) > 1:
                busy[model] = busy.get(model, 0) + 1
                if busy[model] >= 2:                   # النموذج مزدحم: نؤخره لآخر القائمة ونجرب غيره
                    MODELS.append(MODELS.pop(0)); busy[model] = 0
                    print(f'    {model} مزدحم ← تجربة {MODELS[0]}', flush=True); time.sleep(2); continue
            if e.code in (429, 500, 502, 503, 504):  # حد الطلبات في الدقيقة أو ضغط على الخادم: ننتظر ونعيد
                print(f'    Gemini {e.code} — إعادة بعد انتظار', flush=True)
                time.sleep(min(60, 10 * (n + 1))); continue
            raise SystemExit(f'Gemini: خطأ {e.code}: {msg[:300]}')
        except (KeyError, IndexError, json.JSONDecodeError):
            print('    رد غير مفهوم — إعادة', flush=True); time.sleep(3)
        except Exception as e:                        # انقطاع اتصال أو مهلة: نعيد بدل التعليق
            print(f'    انقطاع ({type(e).__name__}) — إعادة', flush=True); time.sleep(5)
    return None

PROMPT = '''أنت مساعد لمترجم لغة الإشارة السعودية، تترجم خطبة جمعة. لكل كلمة مرقّمة أدناه اختر قرارًا واحدًا:
- "sign" مع "id": فقط إذا كانت إحدى الإشارات المرشحة لها تطابق معنى الكلمة في هذه الجملة بالذات (انتبه للكلمات متعددة المعاني:
  «آله» في «صلى الله عليه وعلى آله» تعني أهله لا الآلة، «محارم الله» ليست شهر محرّم، «وحده» ليست «وحدة»، «وهم» الضمير ليست الخيال).
- "spell": اسم علم (شخص، مكان، كتاب) أو كلمة لا يوجد لها مرشح بنفس المعنى — ستُهجّأ بالحروف.
- "drop": كلمة لا تحمل معنى مستقلًا في لغة الإشارة (أداة، ضمير متصل، حرف عطف) أو معناها مفهوم مما قبلها.
- "alt" مع "alt": إذا لم يطابق أي مرشح المعنى وليست اسم علم، اكتب كلمة أو عبارة عربية فصيحة قصيرة شائعة بنفس المعنى
  يُرجّح وجود إشارة لها في قاموس لغة الإشارة السعودية (أمثلة: «اتقوا الله» ← "تقوى الله"، «العبودية» ← "عبادة"،
  «ومعاصينا» ← "معصية"، «قدير» ← "قدرة"، «يهون» ← "سهل"). اكتب الكلمة بصيغتها المعجمية بلا ضمائر ولا «و/ف».
قواعد صارمة: لا تستخدم أي "id" غير موجود في قائمة مرشحي الكلمة نفسها. المرشحون قد يكونون من نفس الجذر بمعنى مختلف — لا تخترهم إلا إن تطابق المعنى
(أخطاء سابقة لا تكررها: «محتسبًا» ليست «حاسوب»، «ثوابها» ليست «ثوب»، «التوكل» ليست «توكيل»، «يهون» ليست «إهانة»، «الهموم» ليست «همّة»، «أعظم» ليست «معظم»، «التوبة النصوح» ليست «النصيحة»).
إن لم تكن متأكدًا ضع "confident": false. «صلى الله عليه وسلم» عبارة واحدة لها إشارة خاصة.
أرجع JSON فقط بالشكل: {"items":[{"k":"<مفتاح الكلمة>","action":"sign|spell|drop|alt","id":<رقم أو null>,"alt":"<عبارة أو null>","confident":true|false}]}

الجمل والكلمات:
'''

def refine(sentences, plan, cands_of, per_call=6, log=lambda *a: print(*a, flush=True), alt_of=lambda p: None):
    """يعدّل plan في مكانه. cands_of(item) ← قائمة [{id, sign, cat, desc}]"""
    key = api_key(); model = pick_model(key); log(f'Gemini: النماذج بالترتيب {MODELS}')
    work = {}   # s -> [(key, item)]
    for n, it in enumerate(plan):
        if it['action'] in ('sign', 'spell') and it.get('how') != 'phrase' and it.get('how') != 'approved':
            it['_k'] = f'w{n}'; work.setdefault(it['s'], []).append(it)
    ss = sorted(work); changed = 0
    for b in range(0, len(ss), per_call):
        block = ss[b:b + per_call]; parts = []; allowed = {}
        for s in block:
            parts.append(f'\n### الجملة: {sentences[s]}')
            for it in work[s]:
                cs = cands_of(it); allowed[it['_k']] = {c['id'] for c in cs}
                cl = '; '.join(f'{c["id"]}={c["sign"]} [{c["cat"]}]' + (f' ({c["desc"][:70]})' if c.get('desc') else '') for c in cs) or 'لا مرشحين'
                parts.append(f'- {it["_k"]}: «{it["text"]}» ← المرشحون: {cl}')
        res = ask_json(key, model, PROMPT + '\n'.join(parts))
        byk = {r.get('k'): r for r in (res or {}).get('items', []) if isinstance(r, dict)}
        for s in block:
            for it in work[s]:
                r = byk.get(it['_k'])
                if not r: it['llm'] = 'no-answer'; continue
                a = r.get('action'); ok = bool(r.get('confident', False))
                if a == 'sign' and r.get('id') in allowed[it['_k']]:
                    new = {'action': 'sign', 'id': r['id'], 'conf': 'llm' if ok else 'review', 'how': 'gemini'}
                elif a == 'alt' and r.get('alt'):
                    i2 = alt_of(r['alt'])            # نبحث عن العبارة البديلة في القاموس محليًا — لا اختراع
                    if i2: new = {'action': 'sign', 'id': i2, 'conf': 'review', 'how': 'gemini-alt:' + r['alt']}
                    else: new = {'action': 'spell', 'conf': 'low', 'how': 'alt-missing:' + r['alt']}
                elif a in ('spell', 'drop'):
                    new = {'action': a, 'conf': 'llm' if ok else 'review', 'how': 'gemini'}
                else:
                    it['llm'] = 'invalid'; continue
                if new['action'] != it['action'] or new.get('id') != it.get('id'): changed += 1; it['before'] = it.get('sign') or it['action']
                it.update(new); it['llm'] = 'ok'
        log(f'  جمل {b + 1}–{b + len(block)} من {len(ss)}')
    for it in plan: it.pop('_k', None)
    return changed
