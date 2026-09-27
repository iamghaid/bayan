import json, sys, collections
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, 'tools')
from audit_lib import far_signs
for f in ['103010', '124660', '126507', '167534', '183793']:
    base = json.load(open(f'translations/{f}.json', encoding='utf-8'))['stats']
    d = json.load(open(f'translations/{f}_gemini.json', encoding='utf-8')); s = d['stats']; p = d['plan']
    na = sum(x.get('llm') in ('no-answer', 'invalid') for x in p)
    alt = sum(x.get('how', '').startswith('gemini-alt') for x in p)
    blk = sum(x.get('how') == 'blocked-pair' for x in p)
    print(f"{f}: قبل {base['signs'] * 100 // base['work']}% إشارة/{base['spell'] * 100 // base['work']}% تهجئة ← بعد {s['signs'] * 100 // s['work']}%/{s['spell'] * 100 // s['work']}% | بالمعنى {alt} | ممنوع {blk} | بلا رد {na} | تحتاج اعتماد {s['review']}")
    if f != '103010':
        print('   مشكوك:', ' ، '.join(f'{t}→{g}' for (t, g), n in far_signs(p).most_common(400)))
