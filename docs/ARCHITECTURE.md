# Architecture | معمارية بيان

The browser owns playback, avatar rendering, draft notes and local review decisions. `index.html` hosts two same-origin views. `unified-view.js` pauses animation/media on tab switches; the frames stay mounted to preserve drafts. An ongoing microphone recording continues until its stop control or 60-second limit.

Python supplies conservative text planning, audio transcription and the shared review decisions. Vercel entry points reuse local logic. Provider credentials are server environment values.

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/plan` | JSON `text`, optional `preview_unreviewed` | Playlist and references |
| `POST /api/transcribe` | Supported audio body, ≤4 MiB | `text`, `model` |
| `GET /api/catalog` | — | Every motion (active and staged) with fidelity, sermon use and source-video name |
| `GET /api/bank` | — | Shared team decisions: `{mode: "team", records}` (hosted) or `{mode: "local", records}` (loopback) |
| `POST /api/decision` | JSON `id`, `decision` (`accepted`/`rejected`/`rework`), `reviewer`, `note`, `passes`, `motion_sha256`; header `X-Review-Key` | The stored record; `{check: true}` only verifies the password |

### Word → sign planning

`/api/plan` decides each word in this order: (1) a link in `tools/approved.json`; (2) how the five saved sermons render the word (sign, drop or fingerspelling; most common wins; signs only with an existing motion; 2,868 words); (3) a new motion the review team accepted (its label and listed alternatives, same file hash), played from `sshi_motion/staging/`; (4) fingerspelling while a new sign is still under review. Qur'an stays text and held words stay pending. If the team database is unreachable, planning continues without step 3.

### Team review (hosted)

`tools/team_bank.py` stores decisions in the Neon Postgres database connected to the Vercel project, through Neon's HTTPS SQL endpoint (no driver package). It also accepts Upstash Redis. Reading is open to the review page; writing needs `REVIEW_PASSWORD` and a reviewer name. Records keep the motion hash, the four passes, the reviewer, the time and a short history; a separate table logs every decision. On the hosted site a decision is saved only to this store. `python tools/team_bank.py --apply` on the owner's computer brings team approvals into the library and the saved sermon plans through `motion_bank.py`.

`handfix.js` cleans source landmarks; `signer.js` retargets them; `signfix.js` applies per-motion corrections. `man_dress.js` handles appearance.

Local review records use `bayan-motion-review-notes-v1`. Records contain ID, label, note, four pass statuses, hash, decision, timestamp and decision history. Acceptance requires all four passes checked and a valid schema. A changed hash invalidates the displayed decision. On the hosted site these browser records do not change the library. On the owner's loopback servers, `tools/motion_bank.py` also handles `GET /api/bank` and `POST /api/decision`: acceptance copies the staged motion (hash-checked) into `sshi_motion/m/`, adds it to `sshi_motion/index.json`, adds its label to `tools/approved.json` without overriding existing entries, and updates matching items in `translations/*_gemini.json` (never Qur'an, held or blocked words). Lists: `trusted` (accepted; sermon motions default here and keep playing), `review` (new motions undecided or returned; `/api/plan` fingerspells a word whose only new sign is under review), `redesign` (rejected). `tools/motion_catalog.py` builds the review catalog from both the active library and staging, with fidelity and sermon usage. Each record keeps undo data, so a new decision reverses the previous one exactly.

## بالعربية

المتصفح مسؤول عن العرض والمراجعة؛ الخادم مسؤول عن إعداد النص وتفريغ الصوت. الفصل يُبقي المفاتيح في الخادم، وقرار الاعتماد يبقى للمراجع وحده. البيانات تمر من البحث والاستخراج إلى التدقيق والمراجعة قبل نقلها إلى مكتبة التشغيل.
