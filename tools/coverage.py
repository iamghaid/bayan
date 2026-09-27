"""
قياس تغطية قاموس لغة الإشارة السعودية (sshi.sa) لخطب جمعة حقيقية.
لا يُنزّل أي فيديو؛ يقارن كلمات الخطب بأسماء الإشارات ومرادفاتها فقط.
الاستخدام:  python tools/coverage.py
المخرجات:   coverage/report.txt  و  coverage/missing_words.csv (الكلمات الناقصة مرتبة بالتكرار — قائمة تسجيل للمترجم)
"""
import json, re, urllib.request, collections, pathlib, html as H, csv

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / 'coverage'; OUT.mkdir(exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0'}
KHUTAB = {
    'الصلاة وأهميتها (الألوكة)': 'https://www.alukah.net/sharia/0/126507/',
    'بر الوالدين (الألوكة)': 'https://www.alukah.net/sharia/0/124660/',
    'الصبر على البلاء (الألوكة)': 'https://www.alukah.net/sharia/0/103010/',
    'التقوى (الألوكة)': 'https://www.alukah.net/sharia/0/167534/',
    'أحكام الجمعة (الألوكة)': 'https://www.alukah.net/web/personal_pages/15/183793/',
}
# أدوات لا تُترجم بإشارة مستقلة عادةً (حروف جر وربط وضمائر وصل)
STOP = set('''في من على الى إلى عن ان أن إن ما ثم او أو قد لقد هذا هذه ذلك تلك الذي التي الذين اللذين اللاتي
كان كانت يكون هو هي هم هن انت أنت انتم أنتم نحن انا أنا اياكم إياكم به بها بهم له لها لهم لكم لنا عليه عليها عليهم عليكم
فيه فيها فيهم منه منها منهم منكم اليه إليه اليها إليها لي بل حتى الا إلا اي أي كما عند بين يا ايها أيها اما أما لما
لكن لكنه ولكن وان وإن فان فإن انه إنه انها إنها انهم إنهم ذا اذ إذ اذا إذا فلا ولا لم لن ليس قال فقال وقال
عنه عنها عنهم عنهما ومن وقد وهو وهي فهو فهي بما فيما مما عما لما وما فما رواه اخرجه متفق'''.split())
STOP = {re.sub('[أإآ]', 'ا', w).replace('ى', 'ي') for w in STOP}

AR = re.compile(r'[ء-يً-ٰٟـ]+')   # الحروف مع التشكيل والتطويل (وإلا انقسمت الكلمات المشكولة)
def norm(s):
    s = re.sub(r'[ً-ٰٟـ]', '', s)
    s = re.sub(r'[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    return s
PRE = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'س']
SUF = ['كموها', 'هما', 'كما', 'تموه', 'هم', 'هن', 'كم', 'كن', 'نا', 'ها', 'ون', 'ين', 'ان', 'ات', 'وا', 'ه', 'ي', 'ك', 'ت']
def cands(w):
    out = {w}
    for p in PRE:
        if w.startswith(p) and len(w) - len(p) >= 2: out.add(w[len(p):])
    for x in list(out):
        for s in SUF:
            if x.endswith(s) and len(x) - len(s) >= 2: out.add(x[:-len(s)])
    for x in list(out):   # أفعال مضارعة/أمر: يـ تـ نـ ا + الجذر
        if len(x) >= 4 and x[0] in 'يتنا': out.add(x[1:])
    return out

def fetch_json(url): return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120))
def fetch_text(url):
    h = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode('utf8', 'replace')
    h = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<footer.*?</footer>|<header.*?</header>', ' ', h, flags=re.S | re.I)
    paras = [re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', p))).strip() for p in re.findall(r'<(?:p|div)[^>]*>(.*?)</(?:p|div)>', h, flags=re.S)]
    paras = [p for p in paras if len(AR.findall(p)) >= 12 and '<' not in p]
    seen, body = set(), []
    for p in paras:   # بدون تكرار الفقرات المتداخلة
        if p in seen or any(p in b for b in body): continue
        seen.add(p); body.append(p)
    return '\n'.join(body)

# ---- القاموس السعودي ----
words = fetch_json('https://sshi.sa/api/Words/Words?page=1&row=50000')['info']['data']
DICT = {}
for w in words:
    cat = (w.get('category') or {}).get('nameAr') or ''
    if re.search(r'حروف|ارقام|أرقام', cat): continue      # الحروف والأرقام للتهجئة، لا لمطابقة الكلمات
    ar = (w.get('wordAr') or '').strip(); syn = (w.get('synonym') or '').strip()
    names = [ar] + re.split(r'\s*[-/()،,]\s*', ar)          # «صبر - جلد» ← صبر، جلد
    # المرادفات مفصولة بمسافات؛ نقسمها كلمات فقط إن كان اسم الإشارة كلمة واحدة، وإلا نأخذها كاملة
    names += syn.split() if len(ar.split()) == 1 else [syn]
    for n in names:
        n = norm(n.strip())
        if len(n) >= 2 and n != 'null': DICT.setdefault(n, (w['id'], ar, (w.get('category') or {}).get('nameAr')))
DICT_STEM = {}
for k, v in DICT.items():
    if ' ' in k: continue
    for c in cands(k):
        if len(c) >= 3: DICT_STEM.setdefault(c, v)
print('قاموس:', len(words), 'إشارة،', len(DICT), 'صيغة')

def strict(tok):   # الكلمة نفسها أو بعد حذف سابقة (و، ال، ب...) فقط
    if tok in DICT: return DICT[tok]
    for p in PRE:
        if tok.startswith(p) and tok[len(p):] in DICT and len(tok) - len(p) >= 3: return DICT[tok[len(p):]]
    return None
def lookup(tok):   # تقريبي: مع حذف اللواحق وحروف المضارعة
    r = strict(tok)
    if r: return r, 'strict'
    for c in cands(tok):
        if len(c) >= 3 and c in DICT: return DICT[c], 'loose'
    for c in cands(tok):
        if len(c) >= 3 and c in DICT_STEM: return DICT_STEM[c], 'loose'
    return None, None
SAMPLE = []

rep, missing_all, tot = [], collections.Counter(), collections.Counter()
for title, url in KHUTAB.items():
    try: text = fetch_text(url)
    except Exception as e:
        rep.append(f'## {title}\nتعذّر الجلب: {e}\n'); continue
    toks = [norm(t) for t in AR.findall(text)]
    i, content, covered, cstrict, miss = 0, 0, 0, 0, collections.Counter()
    while i < len(toks):
        t = toks[i]
        if i + 1 < len(toks) and (t + ' ' + toks[i + 1]) in DICT:     # عبارات من كلمتين
            content += 1; covered += 1; cstrict += 1
            SAMPLE.append((t + ' ' + toks[i + 1], DICT[t + ' ' + toks[i + 1]][1], 'phrase')); i += 2; continue
        if t in STOP or len(t) < 2: i += 1; continue
        content += 1
        hit, how = lookup(t)
        if hit:
            covered += 1; cstrict += how == 'strict'; SAMPLE.append((t, hit[1], how))
        else: miss[t] += 1
        i += 1
    uniq = {t for t in toks if t not in STOP and len(t) >= 2}
    ucov = sum(1 for t in uniq if lookup(t)[0])
    missing_all.update(miss)
    tot.update(words=len(toks), content=content, covered=covered, strict=cstrict, uniq=len(uniq), ucov=ucov)
    rep.append(f'## {title}\nالرابط: {url}\nعدد الكلمات: {len(toks)} | كلمات تُترجم: {content} | مطابقة صارمة: {cstrict} ({cstrict * 100 // max(1, content)}%) | مع التقريبية: {covered} ({covered * 100 // max(1, content)}%)\n'
               f'كلمات مختلفة: {len(uniq)} | الموجود منها: {ucov} ({ucov * 100 // max(1, len(uniq))}%)\n'
               f'أكثر الناقص: {"، ".join(f"{w}({n})" for w, n in miss.most_common(25))}\n')
summary = (f'# تغطية القاموس السعودي لـ {len(KHUTAB)} خطب\nالقاموس: {len(words)} إشارة (sshi.sa)\n'
           f'إجمالي الكلمات: {tot["words"]} | كلمات تُترجم: {tot["content"]}\n'
           f'مطابقة صارمة: {tot["strict"]} ({tot["strict"] * 100 // max(1, tot["content"])}%) | مع التقريبية: {tot["covered"]} ({tot["covered"] * 100 // max(1, tot["content"])}%)\n'
           f'ملاحظة: المطابقة آلية تقريبية (بلا تحليل صرفي كامل)، فقد تحسب إشارة لكلمة بمعنى آخر أو تفوّت صيغًا موجودة.\n\n')
(OUT / 'report.txt').write_text(summary + '\n'.join(rep), encoding='utf8')
with open(OUT / 'missing_words.csv', 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.writer(f); wr.writerow(['الكلمة (مطبّعة)', 'مرات التكرار في الخطب'])
    for w, n in missing_all.most_common(): wr.writerow([w, n])
import random; random.seed(7)
smp = random.sample(SAMPLE, min(120, len(SAMPLE)))
with open(OUT / 'sample_matches.csv', 'w', encoding='utf-8-sig', newline='') as f:
    wr = csv.writer(f); wr.writerow(['كلمة الخطبة', 'الإشارة المطابقة في القاموس', 'نوع المطابقة'])
    wr.writerows(smp)
print(summary + '\n'.join(rep))
