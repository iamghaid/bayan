# Motion fixes | تصحيح الحركات

Motions are corrected one at a time in `signfix.js`, after comparing the avatar with the reference footage. Never apply a global rule to all motions: a change that fixes one sign can break another that is already correct.

## How a fix works

`signfix.js` maps a motion ID to a list of entries. Each entry targets one hand and a motion-frame window `[from, to]`, with eased ramps in and out, so frames outside the window and other motions are unchanged.

| Field | Effect |
| --- | --- |
| `shape` | Locks a handshape from `HANDSHAPES` (`S`, `A`, `B`, `F`, `bent2`, `hook2`, `clasp`) where MediaPipe misread the fingers. |
| `orient` | Palm/finger direction in body space: x = avatar's left, y = up, z = forward. |
| `face` | Contact or near-contact between a hand point (`palm`, `back`, `heel`, `knuckles`, `indexTip`, `fingertips`) and an anchor (`templeR/L`, `eyeR/L`, `mouth`, `chin`, `underChin`, `chestL/R`). `gap` is in metres (0.004 = touch); optional `offset`; `surface: true` keeps the original motion along the surface. |
| `hands` | The mover hand touches `basePoint` of the other hand (`palm`, `back`, `fist_front`, `top`), or `separate: true` only prevents penetration. |
| `only` | One-handed sign; the other detection was a MediaPipe error. |

Example (motion 9038, «فهم»: fist on the temple):

```js
9038: [
  { hand: 'Right', from: 5, to: 18, shape: 'S' },
  { hand: 'Right', from: 8, to: 16, face: { point: 'knuckles', anchor: 'templeR', gap: 0.004 } },
],
```

Fixed so far: 12225 عبد, 184 أشهد أن لا إله إلا الله, 841 دين, 3844 إيذاء, 6212 يظهر, 9465 همة, 419 النبي, 11149 رحمة, 9038 فهم, 855 سهل.

## Workflow

1. Find the motion ID (`python tools/case_lookup.py <ids>` gives the name and time in the reference video).
2. Build reference frames: `python tools/case_ref.py <ids>` writes a frame sheet labelled with motion frame numbers; `python tools/case_zoom.py <id> f1 f2 …` gives hand close-ups. These need the local source footage.
3. Add the smallest entry that fixes the affected frames only.
4. Bump `?v=N` on the changed script tags in `khutbah.html` and `motion-review.html` (browser cache).
5. Check the result on the real avatar (`python tools/demo_server.py`, or `tools/avatarcheck.html`) against the reference frames.
6. Run the regression checks below and compare with the baseline.

## Regression checks

```powershell
node tools/retarget_test.js
node tools/handfix_test.js 80 tools/hf_variants.json   # jitter, flicker, jumps, fidelity
node tools/hf_chiral.js 80 after                       # impossible backward-bending fingers
```

Baseline over the 80 most-used motions (do not make these worse):

| Metric | Now | Before cleanup |
| --- | ---: | ---: |
| Jitter (°/frame) | 3.6 | 11.5 |
| Flickers | 31 | 313 |
| Position jumps | 20 | 124 |
| Duplicate hands | 8 | 36 |
| Backward-bending fingers | 105 / 13,420 | 1,529 |
| Avatar not curling vs. video | 24 | 1,176 |
| Mean deviation from video | ≈ 6.5° | — |

## Pipeline notes

- `handfix.js` cleans tracking before retargeting: assigns detections to arms by continuity, removes duplicates and outliers, fills gaps, fixes MediaPipe depth flips (whole hand and per finger), and applies One-Euro smoothing. It also runs in Node for the tests above.
- `signer.js` retargets to the avatar: arm aiming by direction, hand orientation from palm vectors, finger flexion with anatomical limits, keeping hands in front of the body, and the contact solver (2-bone IK, face/chest anchors, hand–hand contact and anti-penetration).
- Motion file format (`sshi_motion/m/<id>.json`): `{fps, asp, fr: [[w(27), p(4), l(63)|0, r(63)|0, mouth]], id, ar}`, integers ×1000. `w` = pose world points [0, 7, 8, 11–16]; `p` = image wrists.

## بالعربية

كل تصحيح يخص حركة واحدة ونطاق إطارات محدد في `signfix.js`، بعد مقارنتها بالمرجع. لا نطبق قاعدة عامة على كل الحركات. بعد أي تعديل: حدّث رقم `?v=N`، وافحص على الأفتار الفعلي، وشغّل الاختبارات، وتأكد أن الأرقام أعلاه لم تسُؤ.
