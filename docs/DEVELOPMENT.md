# Development | التطوير

## Local services

`python tools/demo_server.py` starts the unified workspace on port 8020. `python tools/motion_review_server.py` starts reference review on port 8021. `python tools/avatarcheck_server.py` serves deterministic GLB checks on port 8022. Stop the existing instance before starting another on the same port.

Configure the variables documented in `.env.example` in the shell or hosting settings. The server does not load that example automatically. Audio and text models may differ.

## Dataset tools

Active motion JSON is versioned. Staged JSON and source footage are local assets. `tools/expand_batch.py` requires OpenCV and a MediaPipe environment exposing `solutions`; `tools/staging_audit.py` generates the review catalog. These packages are not required by the demo runtime.

## Validation and releases

Run the README's Python and Node checks. Motion changes also require actual-model inspection and reference comparisons. Use motion-specific fixes rather than guessing a global handshape.

### Hosted project

The selected project is **khutbah-sign**, team **gheid**, at https://khutbah-sign.vercel.app/khutbah.html. `deployment.json` stores its non-secret identifiers. Gemini variables are configured on that project. Publishing a bundle does not require re-entering them.

Build a fresh bundle, link that output directory to the existing project, and verify the link before publishing:

```powershell
python tools/prepare_interface_release.py --output output/release
Push-Location output/release
vercel link --yes --project khutbah-sign --scope gheid
Pop-Location
python tools/deploy_release.py --output output/release --check-only
python tools/deploy_release.py --output output/release
```

Use a new empty output directory for each build. Run the deployment wrapper from the repository root; it rejects bundles linked to another project. Do not deploy from a root checkout whose `.vercel/project.json` points elsewhere. Output bundles are ignored by Git. Preserve the project's configured deployment access settings.

The review bundle includes valid motion files and excludes candidates with a `hold_` technical preflight status. Audit records are bound to motion hashes so changing a motion invalidates its earlier preflight. `coverage/expansion/batch_07_review.json` records the latest sampled checks.

**بالعربية:** النشر دائمًا على `khutbah-sign` ضمن `gheid`. أنشئ مجلد نشر جديدًا، واربطه بالمشروع نفسه، ثم شغّل `deploy_release.py`؛ يتوقف الأمر إذا كان الربط بمشروع آخر. تبقى متغيرات Gemini في إعدادات المشروع الحالي.

## Contributions

Explain behavior changes, comment non-obvious coordinate conversions and validation boundaries, use UTF-8 for Arabic, bump changed browser script versions, and add focused regression tests. Export review records before clearing storage or changing origins.
