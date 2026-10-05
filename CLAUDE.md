# Bayan (بيان) — Friday khutbah → Saudi Sign Language avatar

Read this whole file before changing anything. The owner (ghaid) writes in Levantine Arabic; answer in Arabic.

## Hard rules (never break)

1. **Never upload the sign-library videos anywhere** — `sshi_motion/src/`, `review_video/`, `review_cases/`, or any `.mp4`/frame taken from them. They stay on the owner's computer only. `.gitignore` already excludes them; keep it that way.
2. Deploy only to the owner's selected project and preserve its configured access protection. Motion data in `sshi_motion/m/` is derived from the Saudi Sign Language library (sshi.sa).
3. **Never print, commit, or send the Gemini key** (`tools/.gemini_key.txt`).
4. This GitHub repo (`iamghaid/bayan`) is **private**. Do not make it public.
5. The output is a demo: translations must be reviewed by a certified sign-language interpreter before being shown to Deaf viewers. Qur'an verses are shown as text (the decision to sign them belongs to a religious specialist). Keep the warning banner in `khutbah.html`.
6. Do not rebuild the system or change motions that are already correct. Fix problems locally and verify against the reference video (see "Verifying a change").

## How it works

1. **Text** — khutbahs from alukah.net (`translations/<id>.txt`). IDs: 103010, 124660, 126507, 167534, 183793.
2. **Translation** — `tools/translate.py` (+ `tools/llm_gemini.py`) maps each word to a sign in the SSHI dictionary (qalsadi lemmas, tashaphyne roots, Gemini for meaning), else fingerspelling. Word-level fixes: `tools/approved.json`, blocked false friends: `tools/blocked.json` (`_pairs`). Re-apply with `--reapply`. Output: `translations/<id>_gemini.json` (`plan`: per word `action` sign/spell/quran/drop, `id`, `letters`) and a readable `_gemini.txt`.
3. **Motion** — `tools/sshi_extract.py` downloads each needed sign video to `sshi_motion/src/<id>.mp4` (local only) and extracts MediaPipe Holistic + Hands landmarks to `sshi_motion/m/<id>.json`: `{fps, asp, fr:[[w(27), p(4), l(63)|0, r(63)|0, mouth]], id, ar}` as ints ×1000. `w` = pose world points [0,7,8,11–16]; `p` = image wrists. 1148 signs, all used by the 5 khutbahs.
4. **Player** (browser, three.js r133) — `khutbah.html` loads, in order: `man_dress.js`, `handfix.js`, `signfix.js`, `signer.js`, `khutbah.js`. Bump `?v=N` on all script tags after every change (browser cache).
   - `handfix.js` — hand-track cleanup: assigns detections to arms by continuity, removes duplicates/outliers, fills gaps, fixes MediaPipe depth flips (whole hand `chiral` and per finger `fingerDepth`: chooses the anatomically possible depth interpretation), One-Euro smoothing. Works in Node too (tests).
   - `signer.js` — retargets data to the avatar: direction-based arm aiming, hand orientation from palm vectors, finger flexion with anatomical limits (flex toward palm only, fixed flexion axis per finger, PIP excess moved to MCP, DIP coupled to PIP), `keepInFront` (hands in front of body, 13 cm from nose unless a face contact is configured), smoothing, and the contact solver (2-bone IK, face/chest anchors, hand–hand contact and anti-penetration). Test hooks: `Signer._tick`, `_bone`, `_dbg`, `_anch`, `_aw`, `_hp`.
   - `signfix.js` — **per-sign local fixes** (see below).
   - `man_dress.js` — materials, thobe collar/skirt, and the fitted shemagh + agal built from the head shape (hair hidden under it).
   - `khutbah.js` — builds the playlist from the plan and highlights words.
5. **Avatar** — `avatar/man.glb`, MakeHuman (CC0) built with MPFB2 in bpy 5.0.1 by `~/Downloads/avatar-build/step2_build.py` (pass `short02.mhclo` as hair; shape keys must be baked with `shape_key_remove(apply_mix=True)`). Game-engine rig names (`hand_r`, `index_01_r`…); map in `signer.js` (`GE`).

## Per-sign fixes (`signfix.js`)

Keyed by sign id, each entry has a motion-frame window `[from, to]` with eased ramps, so nothing else changes:
- `shape` — lock handshape from `HANDSHAPES` (S, A, B, F, bent2, hook2, clasp) where MediaPipe got fingers wrong.
- `orient` — palm/finger direction in body space (x = avatar's left, y up, z forward).
- `face` — contact/near-contact of a hand point (`palm`, `back`, `heel`, `knuckles`, `indexTip`, `fingertips`) with an anchor (`templeR/L`, `eyeR/L`, `mouth`, `chin`, `underChin`, `chestL/R`), `gap` in metres (0.004 = touch), optional `offset`, `surface:true` keeps motion along the surface.
- `hands` — mover hand touches `basePoint` of the other hand (`palm`, `back`, `fist_front`, `top`), or `separate:true` only prevents penetration.
- `only` — one-handed sign (the other detection was a MediaPipe error).

Fixed so far: 12225 عبد, 184 أشهد أن لا إله إلا الله, 841 دين, 3844 إيذاء, 6212 يظهر, 9465 همة, 419 النبي, 11149 رحمة, 9038 فهم, 855 سهل. Before adding a fix, find the sign id and look at the reference frames.

## Verifying a change (do this every time)

- Local server: `python -m http.server 8000 --bind 127.0.0.1` in the project folder, open `http://localhost:8000/khutbah.html?k=103010&v=N`.
- In the page console load `tools/_testhelpers.js` (local only): `sheet(id, frames)` avatar contact sheet, `at(id, t)` pause at time, `traj(id, side, anchor)` max step/accel (jumps), `handGap(id, frames)` hand–hand distance (negative = overlap), `checkAll(80)` finger-curl agreement over the 80 most-used signs.
- Reference: `python tools/case_ref.py <ids>` aligns each motion file with its video and writes `review_cases/<id>.jpg` (frames labelled with motion frame numbers, MediaPipe hands overlaid); `python tools/case_zoom.py <id> f1 f2…` hand close-ups; `python tools/case_lookup.py <ids>` name + time in the review video. `tools/make_ref_video.py <khutbah>` builds the full reference video with .srt.
- Node checks: `node tools/handfix_test.js 80 tools/hf_variants.json` (jitter/flicker/jumps/fidelity), `node tools/hf_chiral.js 80 after` (impossible backward-bending fingers).
- Current numbers (80 signs): jitter 3.6°/frame (was 11.5), flickers 31 (313), position jumps 20 (124), duplicate hands 8 (36), backward fingers 105/13420 (1529), avatar-not-curling vs video 24 (1176), mean deviation from video ≈ 6.5°. Don't make these worse.

## Known open issues

- #34 «و»: owner saw a problem; not reproduced in tested frames — ask him for the timestamp.
- #419 النبي: right hand higher/further out than the reference (pose estimate).
- 1416 translation items still unreviewed; «الرب» maps to the sign «الله» (from `approved.json`) — needs interpreter review. ~9% of words are fingerspelled.
- No facial expressions (they carry grammar in sign language). Shemagh back is flat and flares at the shoulders.
- Other signs may still have hand–hand penetration or missing face contact; fix them per sign in `signfix.js`, never globally.

## Environment notes (Windows)

- Never edit Arabic text files with PowerShell `Get-Content`/`Set-Content` string replace without `-Encoding UTF8` — it corrupts Arabic. Prefer a Python read-modify-write.
- Deploy (owner runs it): update `sshi_motion/index.json`, `python tools/prep_deploy.py` (copies only public files to `~/Downloads/khutbah-sign-deploy`), then `vercel deploy --prod` there. Add any new player file to `prep_deploy.py`.
