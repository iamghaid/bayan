"""Prepare the unified runtime and review catalog in a fresh, explicit output directory."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def release_catalog(rows):
    """Keep unresolved contact cases out of the release review queue."""
    return [row for row in rows if not row.get('schema_errors')
            and row.get('frames', 0) > 0
            and not row.get('technical_preflight', '').startswith('hold_')]


def prepare(output):
    destination = output.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise SystemExit('Choose an empty output directory to avoid stale release assets.')
    subprocess.run([sys.executable, str(ROOT / 'tools/prep_deploy.py'), '--output', str(destination)], check=True)
    for name in ('motion-review.html', 'motion-review.js'):
        shutil.copy2(ROOT / name, destination / name)
    catalog = release_catalog(json.loads((ROOT / 'coverage/expansion/staging_qa.json').read_text(encoding='utf-8')))
    keys = ('id', 'ar', 'frames', 'seconds', 'tracked_ratio', 'schema_errors', 'motion_sha256')
    sanitized = [{key: row[key] for key in keys if key in row} for row in catalog]
    (destination / 'review-catalog.json').write_text(json.dumps(sanitized, ensure_ascii=False), encoding='utf-8')
    for row in catalog:
        source = ROOT / 'sshi_motion/staging' / f"{row['id']}.json"
        if not source.is_file():
            raise SystemExit(f"Missing review motion: {row['id']}")
        target = destination / 'sshi_motion/staging' / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    # The runtime review bundle includes motion JSON, never original footage.
    ignore = destination / '.vercelignore'
    ignore.write_text(ignore.read_text(encoding='utf-8').replace('sshi_motion/staging/\n', ''), encoding='utf-8')
    if list(destination.rglob('*.mp4')):
        raise SystemExit('Unexpected source media in runtime bundle.')
    print('Unified release prepared. Link it to khutbah-sign, then run tools/deploy_release.py.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    prepare(parser.parse_args().output)
