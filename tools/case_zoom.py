"""لقطات مقرّبة لليدين من الفيديو المرجعي عند إطارات حركة محددة (محلي فقط).
python tools/case_zoom.py <id> f1 f2 ...  →  review_cases/<id>_zoom.jpg"""
import sys, json, pathlib, cv2, numpy as np
R = pathlib.Path(__file__).resolve().parent.parent
sid, js = sys.argv[1], [int(x) for x in sys.argv[2:]]
off = json.loads((R / 'review_cases/offsets.json').read_text(encoding='utf-8'))[sid]
d = json.loads((R / f'sshi_motion/m/{sid}.json').read_text(encoding='utf-8'))
cap = cv2.VideoCapture(str(R / f'sshi_motion/src/{sid}.mp4')); frames = []
while True:
    ok, im = cap.read()
    if not ok: break
    frames.append(im)
tiles = []
for j in js:
    im = frames[min(len(frames) - 1, off['k0'] + j * off['step'])]; h, w = im.shape[:2]
    f = d['fr'][j]; xs, ys = [], []
    for hk in (2, 3):
        if f[hk]: xs += [f[hk][i * 3] / 1000 * w for i in range(21)]; ys += [f[hk][i * 3 + 1] / 1000 * h for i in range(21)]
    if not xs: xs, ys = [f[1][0] / 1000 * w, f[1][2] / 1000 * w], [f[1][1] / 1000 * h, f[1][3] / 1000 * h]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    s = max(max(xs) - min(xs), max(ys) - min(ys), h * 0.18) * 1.5
    x0, y0 = int(max(0, cx - s / 2)), int(max(0, cy - s / 2)); x1, y1 = int(min(w, x0 + s)), int(min(h, y0 + s))
    t = cv2.resize(im[y0:y1, x0:x1], (320, 320))
    cv2.rectangle(t, (0, 0), (60, 22), (0, 0, 0), -1); cv2.putText(t, f'f{j}', (4, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
    tiles.append(t)
while len(tiles) % 4: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite(str(R / f'review_cases/{sid}_zoom.jpg'), np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print('ok', sid, js)
