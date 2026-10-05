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
