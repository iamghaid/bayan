"""Deploy a prepared bundle only when it is linked to Bayan's selected project."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify_project(destination, expected):
    link = destination / '.vercel/project.json'
    if not link.is_file():
        raise ValueError('Link the prepared output directory to khutbah-sign first.')
    actual = json.loads(link.read_text(encoding='utf-8'))
    if any(actual.get(key) != expected[key] for key in ('projectId', 'orgId')):
        raise ValueError('This bundle is linked to a different Vercel project. Deployment stopped.')
    if not (destination / 'khutbah.html').is_file():
        raise ValueError('The output directory is missing khutbah.html.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    destination = args.output.resolve()
    expected = json.loads((ROOT / 'deployment.json').read_text(encoding='utf-8'))
    try:
        verify_project(destination, expected)
    except (ValueError, json.JSONDecodeError) as error:
        parser.exit(1, f'{error}\n')
    print(f"Release target: {expected['projectName']} ({expected['url']})", flush=True)
    if args.check_only:
        return
    executable = shutil.which('vercel')
    if not executable:
        parser.exit(1, 'Vercel CLI is not installed.\n')
    subprocess.run([executable, 'deploy', '--prod', '--yes', '--scope', expected['scope']],
                   cwd=destination, check=True)


if __name__ == '__main__':
    main()
