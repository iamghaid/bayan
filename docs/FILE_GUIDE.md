# File guide | دليل الملفات

| File/group | Responsibility |
| --- | --- |
| `index.html`, `workspace.js`, `unified-view.js` | Workspace tabs, keyboard navigation, same-origin pause messages |
| `interface.css`, `demo.css` | Shared design and input styling |
| `khutbah.html`, `khutbah.js`, `demo.js` | Text/audio flow and sermon playback |
| `motion-review.html`, `motion-review.js` | Four passes, decisions and JSON export |
| `review-assistant.js` | AI suggestions panel, bounded requests and errors |
| `signer.js` | Skeleton calibration, retargeting and contact solving |
| `handfix.js`, `signfix.js` | Tracking cleanup and motion-specific corrections |
| `man_dress.js`, `avatar/`, `lib/` | Saudi appearance, model and rendering libraries |
| `api/` | Thin hosting entry points |
| `deployment.json`, `tools/deploy_release.py` | Hosting identity and project verification before publishing |
| `tools/demo_server.py`, `tools/review_assistant.py` | Runtime and provider calls |
| `sshi_motion/m/`, `translations/` | Active motion data and saved plans |
| `coverage/` | Dictionary, research inventories and audit results |
| `tools/approved.json`, `blocked.json`, `translation_holds.json` | Matching decisions and holds |

`coverage/expansion/staging_summary.json` is the current inventory; `batch_*_review.json` records sampled motion checks. Historical research reports are investigation records and may contain older counts. Use the summary and README snapshot for current inventory.

See [tools/README.md](../tools/README.md) for development script groups. Output bundles, source media, staging files, caches and provider secrets are excluded from Git.

ابدأ من `index.html` للواجهة، و`motion-review.js` للمراجعة، و`tools/review_assistant.py` للمساعد. محرك الأفتار في `signer.js` والتصحيحات في `signfix.js`. الملفات المولدة منفصلة عن محرك العرض والاختبارات.
