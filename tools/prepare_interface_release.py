"""Prepare the unified runtime and review catalog in a fresh, explicit output directory."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import motion_catalog  # noqa: E402


def prepare(output):
    destination = output.resolve()
    if destination.exists() and any(destination.iterdir()):
        raise SystemExit('Choose an empty output directory to avoid stale release assets.')
    subprocess.run([sys.executable, str(ROOT / 'tools/prep_deploy.py'), '--output', str(destination)], check=True)
    for name in ('motion-review.html', 'motion-review.js'):
        shutil.copy2(ROOT / name, destination / name)
    catalog = motion_catalog.build(ROOT)
    (destination / 'review-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False), encoding='utf-8')
    for source in (ROOT / 'sshi_motion/staging').glob('*.json'):
        target = destination / 'sshi_motion/staging' / source.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    # The runtime review bundle includes motion JSON, never original footage.
    ignore = destination / '.vercelignore'
    ignore.write_text(ignore.read_text(encoding='utf-8').replace('sshi_motion/staging/\n', ''), encoding='utf-8')
    if list(destination.rglob('*.mp4')):
        raise SystemExit('Unexpected source media in runtime bundle.')
    print('Unified release prepared. Link the output directory to the intended hosting project before deployment.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    prepare(parser.parse_args().output)
