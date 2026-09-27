"""مرجع بصري لكل حالة (محلي فقط، لا يُرفع): يطابق زمن ملف الحركة مع الفيديو الأصلي،
ثم يحفظ صورة فيها إطارات من الفيديو بأرقام إطارات الحركة، وفوقها نقاط اليدين كما استخرجها MediaPipe
(أخضر = اليد اليسرى في البيانات، أحمر = اليمنى) للتأكد من صحة الاستخراج.
python tools/case_ref.py 12225 184 ...   →  review_cases/<id>.jpg + review_cases/offsets.json"""
import sys, json, pathlib, cv2, numpy as np
import mediapipe as mp
sys.stdout.reconfigure(encoding='utf-8')
R = pathlib.Path(__file__).resolve().parent.parent
OUT = R / 'review_cases'; OUT.mkdir(exist_ok=True)
offs = {}
try: offs = json.loads((OUT / 'offsets.json').read_text(encoding='utf-8'))
except Exception: pass
N = int(sys.argv[-1][2:]) if sys.argv[-1].startswith('n=') else 8
for sid in [a for a in sys.argv[1:] if not a.startswith('n=')]:
    d = json.loads((R / f'sshi_motion/m/{sid}.json').read_text(encoding='utf-8'))
    cap = cv2.VideoCapture(str(R / f'sshi_motion/src/{sid}.mp4')); vf = cap.get(5) or 25
    frames = []
    while True:
        ok, im = cap.read()
        if not ok: break
        frames.append(im)
    step = max(1, round(vf / d['fps']))
    # رسغا الجسم في كل إطار من الفيديو
    W = []
    with mp.solutions.pose.Pose(model_complexity=1, static_image_mode=False) as P:
        for im in frames:
            s = cv2.resize(im, (720, int(im.shape[0] * 720 / im.shape[1]))) if im.shape[1] > 720 else im
            r = P.process(cv2.cvtColor(s, cv2.COLOR_BGR2RGB))
            W.append([(r.pose_landmarks.landmark[i].x, r.pose_landmarks.landmark[i].y) for i in (15, 16)] if r.pose_landmarks else None)
    p = [[(f[1][0] / 1000, f[1][1] / 1000), (f[1][2] / 1000, f[1][3] / 1000)] for f in d['fr']]
    best = (1e9, 0)
    for k0 in range(0, max(1, len(frames) - (len(p) - 1) * step)):
        e = n = 0
        for j, q in enumerate(p):
            w = W[k0 + j * step] if k0 + j * step < len(W) else None
            if not w: continue
            e += sum(abs(q[s][0] - w[s][0]) + abs(q[s][1] - w[s][1]) for s in (0, 1)); n += 1
        if n > len(p) * 0.6 and e / n < best[0]: best = (e / n, k0)
    k0 = best[1]; offs[sid] = {'k0': k0, 'step': step, 'err': round(best[0], 4)}
    # إطارات موزعة على الجزء النشط (اليد فوق مستوى الورك)
    act = [j for j, q in enumerate(p) if min(q[0][1], q[1][1]) < 0.85] or list(range(len(p)))
    js = sorted(set(int(round(x)) for x in np.linspace(act[0], act[-1], N)))
    tiles = []
    for j in js:
        im = frames[min(len(frames) - 1, k0 + j * step)].copy(); h, w = im.shape[:2]
        f = d['fr'][j]
        for hk, col in ((2, (0, 200, 0)), (3, (0, 0, 230))):
            if f[hk]:
                pts = [(int(f[hk][i * 3] / 1000 * w), int(f[hk][i * 3 + 1] / 1000 * h)) for i in range(21)]
                for a, b in [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(17,18),(18,19),(19,20),(0,17)]:
                    cv2.line(im, pts[a], pts[b], col, max(1, w // 400))
        y0, y1 = 0, int(h * 0.75); x0, x1 = int(w * 0.15), int(w * 0.85)
        t = cv2.resize(im[y0:y1, x0:x1], (300, int(300 * (y1 - y0) / (x1 - x0))))
        cv2.rectangle(t, (0, 0), (70, 22), (0, 0, 0), -1)
        cv2.putText(t, f'f{j}', (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
        tiles.append(t)
    while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)])
    cv2.imwrite(str(OUT / f'{sid}.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(sid, 'frames', js, 'offset', offs[sid], flush=True)
(OUT / 'offsets.json').write_text(json.dumps(offs), encoding='utf-8')
