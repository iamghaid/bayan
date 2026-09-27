"""فيديو مرجعي للمراجعة (محلي فقط — لا يُرفع أبدًا): مقاطع المترجمين الحقيقيين من المكتبة
مرتّبة بنفس تسلسل ترجمة الخطبة، مع ملف ترجمة نصية .srt يُظهر الكلمة العربية فوق كل مقطع.
python tools/make_ref_video.py 103010
الناتج: review_video/خطبة_<id>_مرجع.mp4 + .srt بنفس الاسم (يفتحهما VLC معًا تلقائيًا)"""
import sys, json, pathlib, cv2, numpy as np
sys.stdout.reconfigure(encoding='utf-8')
ROOT = pathlib.Path(__file__).resolve().parent.parent
K = sys.argv[1] if len(sys.argv) > 1 else '103010'
d = json.loads((ROOT / 'translations' / f'{K}_gemini.json').read_text(encoding='utf-8'))
plan = d['plan']
SRC = ROOT / 'sshi_motion' / 'src'
have = lambda i: i is not None and (SRC / f'{i}.mp4').exists()

# نفس منطق khutbah.js: إشارة، أو تهجئة بالحروف، أو آية تُعرض نصًا، والأدوات تُحذف
items = []; s = 0
for i, p in enumerate(plan):
    if p['s'] != s: items.append(('pause', 0.4, None)); s = p['s']
    a = p['action']
    if a == 'sign' and have(p.get('id')): items.append(('clip', p['id'], f"{p['text']}  ←  إشارة: {p['sign']}"))
    elif a == 'quran': items.append(('pause', min(6, 1 + len(p['text']) / 25), '﴿' + p['text'] + '﴾  (آية — نص)'))
    elif a == 'spell' or a == 'sign':
        L = [x for x in (p.get('letters') or []) if have(x)]
        base = '-'.join(p.get('base') or p['text'])
        for x in L: items.append(('clip', x, f"{p['text']}  ←  تهجئة: {base}"))

W, H, FPS = 640, 480, 25
out = ROOT / 'review_video'; out.mkdir(exist_ok=True)
mp4 = out / f'خطبة_{K}_مرجع.mp4'
vw = cv2.VideoWriter(str(mp4), cv2.VideoWriter_fourcc(*'mp4v'), FPS, (W, H))
def fit(fr):
    h, w = fr.shape[:2]; sc = min(W / w, H / h)
    fr = cv2.resize(fr, (int(w * sc), int(h * sc)))
    c = np.zeros((H, W, 3), np.uint8); y, x = (H - fr.shape[0]) // 2, (W - fr.shape[1]) // 2
    c[y:y + fr.shape[0], x:x + fr.shape[1]] = fr; return c
srt, t, n = [], 0.0, 0
def ts(x): h, r = divmod(x, 3600); m, s_ = divmod(r, 60); return f'{int(h):02}:{int(m):02}:{int(s_):02},{int((s_ % 1) * 1000):03}'
for kind, v, cap in items:
    t0 = t
    if kind == 'pause':
        for _ in range(int(v * FPS)): vw.write(np.full((H, W, 3), 30, np.uint8)); t += 1 / FPS
    else:
        cap_ = cv2.VideoCapture(str(SRC / f'{v}.mp4')); sf = cap_.get(cv2.CAP_PROP_FPS) or 25; acc = 0.0
        while True:
            ok, fr = cap_.read()
            if not ok: break
            acc += FPS / sf
            fr = fit(fr)
            cv2.putText(fr, f'#{v}', (8, H - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
            while acc >= 1: vw.write(fr); t += 1 / FPS; acc -= 1
        cap_.release()
    if cap: n += 1; srt.append(f'{n}\n{ts(t0)} --> {ts(t)}\n{cap}\n')
vw.release()
mp4.with_suffix('.srt').write_text('\n'.join(srt), encoding='utf-8-sig')
print(f'تم: {mp4.name} — {len(items)} عنصر، {t / 60:.1f} دقيقة')
