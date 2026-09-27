"""
ينزّل فيديو كل إشارة مطلوبة من مكتبة لغة الإشارة السعودية (بإذن)، ويستخرج حركة المترجم بـ MediaPipe Holistic،
ويحفظها بصيغة مضغوطة في sshi_motion/m/<id>.json ليؤديها الأفاتار.
الفيديوهات تبقى محليًا في sshi_motion/src/ — لا تُرفع لأي موقع.
الاستخدام: python tools/sshi_extract.py [عدد_العمال=3]
الصيغة (أعداد صحيحة ×1000): {fps, asp, fr:[[w(27), p(4), l(63)|0, r(63)|0, mouth]]}
  w: نقاط الجسم الحقيقية: 0 أنف، 7 و8 أذنان، 11-16 كتفان ومرفقان ورسغان — p: الرسغان في الصورة — l/r: 21 نقطة لكل يد
"""
import json, sys, pathlib, urllib.request, urllib.parse, time, multiprocessing as mpc

HERE = pathlib.Path(__file__).resolve().parent.parent
BASE = HERE / 'sshi_motion'; SRC = BASE / 'src'; OUT = BASE / 'm'
WI = [0, 7, 8, 11, 12, 13, 14, 15, 16]
I = lambda v: int(round(v * 1000))

def download(item):
    f = SRC / f"{item['id']}.mp4"
    if f.exists() and f.stat().st_size > 1000: return f
    url = 'https://sshi.sa/api/file/' + urllib.parse.quote(item['video'])
    for k in range(4):
        try:
            d = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60).read()
            if len(d) > 1000: f.write_bytes(d); return f
        except Exception: time.sleep(2 + 3 * k)
    return None

def extract(src):
    import cv2, mediapipe as mp
    cap = cv2.VideoCapture(str(src)); fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = 2 if fps >= 24 else 1
    rows, k, asp = [], 0, 16 / 9
    # نموذج اليد المستقل يكشف اليدين أكثر من المدمج في Holistic بمرتين تقريبًا في مقاطع المكتبة
    hm = mp.solutions.hands.Hands(max_num_hands=2, model_complexity=1, min_detection_confidence=0.3, min_tracking_confidence=0.3)
    with mp.solutions.holistic.Holistic(static_image_mode=False, model_complexity=1, smooth_landmarks=True,
                                        refine_face_landmarks=False) as h:
        while True:
            ok, img = cap.read()
            if not ok: break
            k += 1
            if (k - 1) % step: continue          # نعالج الإطارات المحفوظة فقط (نصف الوقت، والتتبع يكفيه 12-15 إطارًا/ث)
            big = img if img.shape[1] <= 1280 else cv2.resize(img, (1280, int(img.shape[0] * 1280 / img.shape[1])))
            if img.shape[1] > 720: img = cv2.resize(img, (720, int(img.shape[0] * 720 / img.shape[1])))
            asp = img.shape[1] / img.shape[0]
            r = h.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            hr = hm.process(cv2.cvtColor(big, cv2.COLOR_BGR2RGB))
            if (k - 1) % step: continue
            LH, RH = r.left_hand_landmarks, r.right_hand_landmarks
            if hr.multi_hand_landmarks and r.pose_landmarks:
                # نسند كل يد لأقرب رسغ في الجسم: 15 يسار المترجم، 16 يمينه
                L0 = r.pose_landmarks.landmark; lh = rh = None
                for hl in hr.multi_hand_landmarks[:2]:
                    w0 = hl.landmark[0]
                    d = lambda i: (w0.x - L0[i].x) ** 2 + (w0.y - L0[i].y) ** 2
                    if d(15) < d(16): lh = lh or hl
                    else: rh = rh or hl
                LH, RH = lh or LH, rh or RH
            pw, pi = r.pose_world_landmarks, r.pose_landmarks
            if not pw or not pi: rows.append(None); continue
            w = [I(c) for i in WI for c in (pw.landmark[i].x, pw.landmark[i].y, pw.landmark[i].z)]
            p = [I(pi.landmark[15].x), I(pi.landmark[15].y), I(pi.landmark[16].x), I(pi.landmark[16].y)]
            hand = lambda hl: [I(c) for q in hl.landmark for c in (q.x, q.y, q.z)] if hl else 0
            m = 0
            if r.face_landmarks:
                fl = r.face_landmarks.landmark
                m = I(abs(fl[14].y - fl[13].y) / max(1e-6, abs(fl[152].y - fl[10].y)))
            L = pi.landmark
            # نشط: يد مكتشفة داخل الصورة، أو رسغ مرفوع فوق منتصف الجذع (الحوض غالبًا خارج الصورة في مقاطع المكتبة)
            sh = (L[11].y + L[12].y) / 2
            act = bool(LH or RH) or min(L[15].y, L[16].y) < sh + 0.22
            rows.append([w, p, hand(LH), hand(RH), m, int(act)])
    cap.release(); hm.close()
    idx = [i for i, x in enumerate(rows) if x and x[5]]
    if idx: rows = rows[max(0, idx[0] - 3): idx[-1] + 4]
    for i, x in enumerate(rows):
        if x is None: rows[i] = next((rows[j] for j in list(range(i - 1, -1, -1)) + list(range(i + 1, len(rows))) if rows[j]), None)
    rows = [x[:5] for x in rows if x]
    hands = sum(1 for x in rows if x[2] or x[3])
    return {'fps': round(fps / step, 3), 'asp': round(asp, 4), 'fr': rows}, hands

def work(item):
    out = OUT / f"{item['id']}.json"
    if out.exists(): return item['id'], 'skip', 0, 0
    try:
        src = download(item)
        if not src: return item['id'], 'no-video', 0, 0
        d, hands = extract(src)
        if not d['fr']: return item['id'], 'no-body', 0, 0
        d['id'] = item['id']; d['ar'] = item['ar']
        out.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
        return item['id'], 'ok', len(d['fr']), hands
    except Exception as e:
        return item['id'], 'error: ' + repr(e)[:120], 0, 0

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    SRC.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    need = json.loads((BASE / 'needed.json').read_text(encoding='utf8'))
    if len(sys.argv) > 2: need = need[:int(sys.argv[2])]
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    t0 = time.time(); done = 0; bad = []
    with mpc.Pool(n) as pool:
        for i, st, frames, hands in pool.imap_unordered(work, need):
            done += 1
            if st not in ('ok', 'skip'): bad.append((i, st))
            elif st == 'ok' and frames and hands < frames * 0.5: bad.append((i, f'hands {hands}/{frames}'))
            if done % 10 == 0 or st.startswith('error'):
                print(f'{done}/{len(need)}  {time.time() - t0:.0f}s  last={i} {st}', flush=True)
    ids = sorted(int(p.stem) for p in OUT.glob('*.json'))
    (BASE / 'index.json').write_text(json.dumps(ids), encoding='utf8')
    (BASE / 'problems.json').write_text(json.dumps(bad, ensure_ascii=False), encoding='utf8')
    print(f'انتهى: {done} في {time.time() - t0:.0f}s — جاهز {len(ids)} — مشاكل {len(bad)}', flush=True)
