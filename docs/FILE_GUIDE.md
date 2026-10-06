# File guide | دليل الملفات

| File/group | Responsibility |
| --- | --- |
| `index.html`, `workspace.js`, `unified-view.js` | Workspace tabs, keyboard navigation, same-origin pause messages |
| `interface.css`, `demo.css` | Shared design and input styling |
| `khutbah.html`, `khutbah.js`, `demo.js` | Text/audio flow and sermon playback |
| `motion-review.html`, `motion-review.js` | Four passes, decisions and JSON export |
| `signer.js` | Skeleton calibration, retargeting and contact solving |
| `handfix.js`, `signfix.js` | Tracking cleanup and motion-specific corrections |
| `man_dress.js`, `avatar/`, `lib/` | Saudi appearance, model and rendering libraries |
| `api/` | Thin hosting entry points |
| `tools/demo_server.py`, `tools/gemini_errors.py` | Runtime and provider calls |
| `sshi_motion/m/`, `translations/` | Active motion data and saved plans |
| `coverage/` | Dictionary, research inventories and audit results |
| `tools/approved.json`, `blocked.json`, `translation_holds.json` | Matching decisions and holds |
| `tools/motion_bank.py`, `tools/motion_bank.json`, `tools/motion_catalog.py` | Three sign banks (trusted, under review, needs rework) on the local server, and the review catalog |
| `tools/team_bank.py`, `api/bank.py`, `api/decision.py`, `api/catalog.py` | Shared team decisions on the hosted site (Neon) and the hosted review catalog |
| `sshi_motion/staging/` | New motions under review (landmark JSON only) |
| `brand/`, `fonts/`, `fonts.css` | Logo, icons and the Thmanyah typeface (woff2 only) |
| `docs/images/` | README screenshots |
| `docs/` | Architecture, development, motion fixes, avatar signing review spec |
| `.github/workflows/checks.yml` | CI checks on every push and pull request |
| `.env.example` | Names of the server environment variables (not loaded automatically) |
| `vercel.json`, `.vercelignore` | Hosting functions and excluded paths |
| `scripts/مراجعة الترجمة.bat` | Windows shortcut that starts the local translation review page (`tools/review_server.py`, port 8010) |

See [tools/README.md](../tools/README.md) for development script groups. Output bundles, source media, caches and provider secrets are excluded from Git.

ابدأ من `index.html` للواجهة، و`motion-review.js` للمراجعة. محرك الأفتار في `signer.js` والتصحيحات في `signfix.js`. الملفات المولدة منفصلة عن محرك العرض والاختبارات.
