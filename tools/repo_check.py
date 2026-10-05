"""Check Git candidates for accidentally included credentials and local-only assets."""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
patterns = [re.compile(rb'AIza[A-Za-z0-9_-]{30,}'), re.compile(rb'AQ\.Ab8[A-Za-z0-9_-]{20,}'),
            re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]


def check():
    names = set(subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines())
    findings = []
    for name in sorted(names):
        path = ROOT / name
        if not path.is_file():
            continue
        parts = Path(name).parts
        if path.suffix.lower() in {'.mp4', '.key'} or parts[0] == 'output' or name.startswith(('sshi_motion/src/', 'review_cases/', 'review_video/', 'sshi_motion/staging/')):
            findings.append((name, 'local-only asset'))
        if path.suffix.lower() in {'.py','.js','.json','.md','.html','.txt','.yml','.yaml'}:
            data = path.read_bytes()
            if any(pattern.search(data) for pattern in patterns):
                findings.append((name, 'credential-like content'))
    for name, reason in findings:
        print(f'{reason}: {name}')  # Never print matched values.
    if findings:
        raise SystemExit(1)
    print(f'Repository check passed: {len(names)} candidate paths; no detected credentials or local-only media.')


if __name__ == '__main__':
    check()
