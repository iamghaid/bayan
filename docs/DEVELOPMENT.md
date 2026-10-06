# Development | التطوير

## Local services

`python tools/demo_server.py` starts the unified workspace on port 8020. `python tools/motion_review_server.py` starts reference review on port 8021. `python tools/avatarcheck_server.py` serves deterministic GLB checks on port 8022. Stop the existing instance before starting another on the same port.

Configure the variables documented in `.env.example` in the shell or hosting settings. The server does not load that example automatically. Audio and text models may differ. On Vercel, team review needs a connected Neon database (`DATABASE_URL`, any prefix) and `REVIEW_PASSWORD` for Production and Preview.

## Dataset tools

Active and staged motion JSON are versioned; source footage stays local. `tools/expand_batch.py` requires OpenCV and a MediaPipe environment exposing `solutions`; `tools/staging_audit.py` generates the review catalog. These packages are not required by the demo runtime.

## Validation and releases

Run the README's Python and Node checks. Motion changes also require actual-model inspection and reference comparisons. Use motion-specific fixes rather than guessing a global handshape; the workflow, fields and regression baseline are in [MOTION_FIXES.md](MOTION_FIXES.md).

`python tools/prep_deploy.py --output <new-empty-directory>` builds the main bundle. `python tools/prepare_interface_release.py --output <new-empty-directory>` adds the review catalog. Link that directory to the intended hosting project. Use a fresh output directory; output bundles are ignored by Git. Preserve configured deployment access settings.

## Contributions

Explain behavior changes, comment non-obvious coordinate conversions and validation boundaries, use UTF-8 for Arabic, bump changed browser script versions, and add focused regression tests. Export review records before clearing storage or changing origins.
