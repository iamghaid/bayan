import json, sys, collections, random
sys.stdout.reconfigure(encoding='utf-8')
a = json.load(open('translations/103010.json', encoding='utf-8'))['plan']
b = json.load(open('translations/103010_gemini.json', encoding='utf-8'))['plan']
def lab(x):
    act = x.get('action')
    if act == 'sign': return 'إشارة:' + str(x.get('sign'))
    return act
print(len(a), len(b))
watch = ['آله', 'اله', 'محارم', 'بغير', 'وسلم', 'وحده', 'الله', 'لله', 'اتقوا', 'صلى', 'عليه']
for i, (x, y) in enumerate(zip(a, b)):
    t = x.get('text', '')
    if any(t.strip('،.') == w or t.endswith(w) for w in watch):
        if lab(x) != lab(y):
            print('WATCH', t, '|', lab(x), '=>', lab(y))
kinds = collections.Counter()
ch = []
for x, y in zip(a, b):
    if lab(x) != lab(y):
        k = (x.get('action'), y.get('action')); kinds[k] += 1; ch.append((x.get('text'), lab(x), lab(y), y.get('conf')))
print(kinds)
random.seed(1)
for c in random.sample(ch, min(45, len(ch))): print(' | '.join(map(str, c)))
# remaining signs per sign-name, most common, to eyeball
cnt = collections.Counter((y.get('text'), y.get('sign')) for y in b if y.get('action') == 'sign')
print('---top signs')
for (t, s), n in cnt.most_common(40): print(n, t, '->', s)
print('---review', [ (y['text'], lab(y)) for y in b if y.get('conf') == 'review'])
