import json, sys, collections, re
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, 'tools')
from translate import norm, strip_pre
d = json.load(open(f'translations/{sys.argv[1]}_gemini.json', encoding='utf-8'))
plan = d['plan']
alt = [(p['text'], p['how'].split(':', 1)[1], p.get('sign')) for p in plan if p.get('how', '').startswith('gemini-alt')]
miss = [(p['text'], p['how'].split(':', 1)[1]) for p in plan if p.get('how', '').startswith('alt-missing')]
print('=== بديل بالمعنى وُجد في القاموس', len(alt))
for a in alt: print('  ', a[0], '→', a[1], '→ [', a[2], ']')
print('=== بديل غير موجود (تهجئة)', len(miss), miss)
# إشارات لا يشبه اسمها الكلمة (قد تكون من الجذر بمعنى مختلف)
def close(t, s):
    ks = set(strip_pre(norm(t))); ss = {norm(x).strip() for x in re.split(r'[-/()،,\s]+', s) if x}
    return any(k in x or x in k for k in ks for x in ss if len(x) >= 2)
far = collections.Counter((p['text'], p['sign']) for p in plan if p['action'] == 'sign' and p.get('how') == 'gemini' and not close(p['text'], p['sign']))
print('=== إشارات Gemini اسمها مختلف عن الكلمة', sum(far.values()))
for (t, s), n in far.most_common(): print('  ', t, '→', s, '×%d' % n)
print('=== ما زال يُهجّأ', [p['text'] for p in plan if p['action'] == 'spell'])
