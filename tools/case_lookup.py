"""يبحث عن كل رقم إشارة: اسمها، وجودها، ومتى يظهر في الفيديو المرجعي (نفس تسلسل make_ref_video)."""
import sys, json, pathlib, cv2
sys.stdout.reconfigure(encoding='utf-8')
R = pathlib.Path(__file__).resolve().parent.parent
ids = [int(x) for x in sys.argv[1:]]
plan = json.loads((R / 'translations/103010_gemini.json').read_text(encoding='utf-8'))['plan']
SRC = R / 'sshi_motion/src'
have = lambda i: i is not None and (SRC / f'{i}.mp4').exists()
prob = {}
try: prob = json.loads((R / 'sshi_motion/problems.json').read_text(encoding='utf-8'))
except Exception: pass
need = {x['id']: x for x in json.loads((R / 'sshi_motion/needed.json').read_text(encoding='utf-8'))}
dur = {}
def D(i):
    if i not in dur:
        c = cv2.VideoCapture(str(SRC / f'{i}.mp4')); n = c.get(7); f = c.get(5) or 25; dur[i] = n / f
    return dur[i]
t, s, occ = 0.0, 0, {}
for k, p in enumerate(plan):
    if p['s'] != s: t += 0.4; s = p['s']
    a = p['action']
    clips = []
    if a == 'sign' and have(p.get('id')): clips = [(p['id'], p.get('sign'))]
    elif a == 'quran': t += min(6, 1 + len(p['text']) / 25); continue
    elif a in ('spell', 'sign'): clips = [(x, 'حرف') for x in (p.get('letters') or []) if have(x)]
    for x, nm in clips:
        if x in ids: occ.setdefault(x, []).append((round(t, 1), p['text'], nm))
        t += D(x)
for i in ids:
    m = R / f'sshi_motion/m/{i}.json'
    info = json.loads(m.read_text(encoding='utf-8')) if m.exists() else None
    o = occ.get(i, [])
    ts = ', '.join(f'{int(x[0]//60)}:{x[0]%60:04.1f}' for x in o[:4])
    print(i, '|', need.get(i, {}).get('ar') or (o[0][2] if o else '?'), '| كلمة:', (o[0][1] if o else '-'),
          '| مرات:', len(o), '| توقيت:', ts, '| حركة:', f"{len(info['fr'])}f@{info['fps']}" if info else 'لا يوجد',
          '| مشكلة:', prob.get(str(i)) if isinstance(prob, dict) else '')

