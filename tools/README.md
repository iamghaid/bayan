# Development tools

| Group | Files | Purpose |
| --- | --- | --- |
| Runtime | `demo_server.py`, `gemini_errors.py` | Text/audio endpoints and provider error messages |
| Review | `motion_review_server.py`, `review_server.py`, `review.html`, `motion_bank.py`, `team_bank.py`, `motion_catalog.py` | Local motion and translation review; local sign bank; shared team decisions (hosted); review catalog |
| Visual checks | `avatarcheck.html`, `avatarcheck_server.py`, `case_ref.py`, `case_zoom.py`, `case_lookup.py`, `make_ref_video.py` | Actual GLB and local reference diagnostics |
| Extraction | `sshi_extract.py`, `expand_batch.py`, `needed_signs.py` | Landmarks and staging candidates |
| Research | `research_sources.py`, `build_morphology_candidates.py`, `build_context_review.py` | Meaning links and review queues |
| Translation | `translate.py`, `llm_gemini.py`, `apply_translation_holds.py`, `compare_llm.py` | Saved plans and matching holds |
| Audits | `audit.py`, `audit_lib.py`, `coverage.py`, `summary.py`, `expansion_audit.py`, `khutbah_coverage.py`, `staging_audit.py` | Coverage and integrity reports |
| Motion regressions | `handfix_test.js`, `hf_chiral.js`, `hf_diag.js`, `hf_dups.js`, `hf_variants.json`, `retarget_test.js` | Tracking and retargeting checks |
| Fidelity | `fidelity_report.js`, `fidelity.html` | Avatar vs landmarks extracted from the source videos, all motions → `coverage/fidelity/` |
| Releases | `prep_deploy.py`, `prepare_interface_release.py` | Explicit runtime bundles |
| Tests | `test_*.py` | Unit/API regressions |

Historical diagnostic scripts remain because they reproduce motion investigations. Keep source media/frame checks local. The website does not require extraction dependencies at runtime.
