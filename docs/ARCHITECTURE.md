# Architecture | معمارية بيان

The browser owns playback, avatar rendering, draft notes and local review decisions. `index.html` hosts two same-origin views. `unified-view.js` pauses animation/media on tab switches; the frames stay mounted to preserve drafts. An ongoing microphone recording continues until its stop control or 60-second limit.

Python supplies conservative text planning, audio transcription and review suggestions. Vercel entry points reuse local logic. Provider credentials are server environment values.

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/plan` | JSON `text`, optional `preview_unreviewed` | Playlist and references |
| `POST /api/transcribe` | Supported audio body, ≤4 MiB | `text`, `model` |
| `POST /api/review_assistant` | JSON `motion_id`, `question` (1–2,000 characters), ≤12,000 bytes | `answer`, motion ID/hash, source URL, `visual_inspection: false` |

The assistant resolves metadata server-side. It does not treat caller-supplied measurements as facts. Questions and labels are untrusted input. Responses are rendered as text rather than HTML. Requests have a 45-second provider timeout and do not modify decisions, animations or the dataset.

`handfix.js` cleans source landmarks; `signer.js` retargets them; `signfix.js` applies per-motion corrections. `man_dress.js` handles appearance.

Local review records use `bayan-motion-review-notes-v1`. Records contain ID, label, note, four pass statuses, hash, decision, timestamp and decision history. Acceptance requires all four passes checked and a valid schema. A changed hash invalidates the displayed decision. Local records do not promote motions into the main library.

## بالعربية

المتصفح مسؤول عن العرض والمراجعة؛ الخادم مسؤول عن إعداد النص وتفريغ الصوت وطلب اقتراحات المساعد. الفصل يُبقي المفاتيح في الخادم، ويفصل اقتراحات الذكاء الاصطناعي عن قرار المراجع. البيانات تمر من البحث والاستخراج إلى التدقيق والمراجعة قبل نقلها إلى مكتبة التشغيل.

## Solid torso constraint

The render loop tests hand/finger spheres and six forearm samples against an ellipsoid sized from the pelvis and shoulders. It samples the sweep from the previously rendered pose, moves blocked paths toward the front surface through two-bone IK, and corrects an obstructed elbow pole. The final palm orientation is rate-limited in world space before a second clearance pass. This changes presentation only; source motion files are untouched.

`Signer.bodyOverlap` reports remaining displacement needed to clear the torso envelope. `tools/avatarcheck.html` records its maximum in millimetres alongside wrist jumps. The envelope is a conservative approximation of the torso, not collision against every clothing triangle or a complete head/limb physics system.

## Coupled arm joints

The player calibrates upper-arm and forearm lengths from the GLB bind pose. A shared two-link solver handles tracking, rest poses, contacts and torso clearance. The upper-arm frame carries a fixed hinge axis; the lower-arm frame bends about that axis rather than independently aiming a freely rotating joint. Source elbow hints are limited toward a stable outward/downward pole. Near extension, the previous bend direction avoids an ambiguous flip.

`ARM_LIMITS` defines conservative presentation envelopes: elbow flexion 2–145 degrees, shoulder elevation at most 165 degrees, forearm roll at most 85 degrees each way, and wrist bend components at most 65/25 degrees. Shoulder direction, elbow flexion and forearm roll advance at most 360 degrees/second; hinge-plane rotation advances at most 240 degrees/second. Each pass references the start of the rendered frame, so multiple collision iterations cannot multiply those speed limits. These are avatar settings, not medical or population-wide ranges.

Pronation transfers to the forearm; residual axial wrist twist is removed. The wrist retains flexion/extension and deviation within its configured envelope. `Signer.jointDiagnostics` reports actual rendered hinge error, flexion, shoulder elevation, forearm roll, wrist twist/bend and bone-length error. The local GLB check records maxima across every sampled frame.

References: [two-bone IK and bend hints (Unity)](https://docs.unity3d.com/ja/Packages/com.unity.animation.rigging%401.2/manual/constraints/TwoBoneIKConstraint.html), [clinical elbow anatomy](https://pmc.ncbi.nlm.nih.gov/articles/PMC5721323/). No source motion files are rewritten by this constraint.
