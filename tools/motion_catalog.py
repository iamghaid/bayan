"""Review catalog: every playable motion plus the staged candidates, with fidelity and usage.

Active motions (sshi_motion/m, used by the sermons) and staged motions (sshi_motion/staging,
new candidates) share one list so the review page can sort them into the three banks.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = ('id', 'ar', 'source', 'frames', 'seconds', 'tracked_ratio', 'schema_errors', 'motion_sha256', 'fidelity', 'signfix', 'uses', 'video')
_cache = {}


def _read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def _clean(label):
    return label.replace('‏', '').replace('‎', '').strip()


def _active_row(path, labels):
    raw = path.read_bytes()
    data = json.loads(raw)
    frames = data.get('fr', [])
    errors = [] if frames else ['no_frames']
    tracked = sum(1 for frame in frames if len(frame) > 3 and (frame[2] or frame[3]))
    identifier = int(path.stem)
    return {'id': identifier, 'ar': _clean(data.get('ar') or labels.get(identifier, '')), 'source': 'active',
            'frames': len(frames), 'seconds': round(len(frames) / data['fps'], 2) if data.get('fps') else 0,
            'tracked_ratio': round(tracked / len(frames), 3) if frames else 0, 'schema_errors': errors,
            'motion_sha256': hashlib.sha256(raw).hexdigest()}


def _uses(root):
    """How often each sign or fingerspelling letter appears in the saved sermon plans."""
    counts = {}
    for plan_file in (root / 'translations').glob('*_gemini.json'):
        for item in _read(plan_file, {}).get('plan', []):
            ids = [item.get('id')] if item.get('action') == 'sign' else item.get('letters') or [] if item.get('action') == 'spell' else []
            for identifier in ids:
                if isinstance(identifier, int):
                    counts[identifier] = counts.get(identifier, 0) + 1
    return counts


def build(root=None):
    root = Path(root or ROOT)
    library = root / 'sshi_motion/m'
    stamp = (str(root), *(p.stat().st_mtime_ns if p.exists() else 0 for p in (
        library, root / 'coverage/expansion/staging_qa.json', root / 'coverage/fidelity/motions.csv', root / 'translations')))
    if _cache.get('stamp') == stamp:
        return _cache['rows']
    released = root / 'review-catalog.json'    # written into hosted bundles by prepare_interface_release.py
    if released.exists():
        return _read(released, [])
    words = _read(root / 'coverage/sshi_words_v2.json', [])
    labels = {word['id']: _clean(word['ar']) for word in words}
    videos = {word['id']: word['video'] for word in words if word.get('video')}   # public file name on sshi.sa
    rows = {}
    for path in library.glob('*.json') if library.exists() else []:
        if path.stem.isdigit():
            rows[int(path.stem)] = _active_row(path, labels)
    for row in _read(root / 'coverage/expansion/staging_qa.json', []):
        if row['id'] not in rows:
            rows[row['id']] = {**row, 'ar': _clean(row.get('ar', '')), 'source': 'staging'}
    fidelity_file = root / 'coverage/fidelity/motions.csv'
    if fidelity_file.exists():
        with fidelity_file.open(encoding='utf-8') as stream:
            for line in csv.DictReader(stream):
                row = rows.get(int(line['id']))
                if row and row['source'] == 'active' and line.get('match'):
                    row['fidelity'], row['signfix'] = float(line['match']), line.get('signfix') == '1'
    uses = _uses(root)
    result = []
    for identifier in sorted(rows):
        row = rows[identifier]
        row['uses'] = uses.get(identifier, 0)
        if identifier in videos:
            row['video'] = videos[identifier]
        result.append({key: row[key] for key in KEYS if key in row})
    _cache.update(stamp=stamp, rows=result)
    return result


def row(identifier, root=None):
    found = next((item for item in build(root) if item['id'] == identifier), None)
    if found is None:
        raise ValueError('الحركة غير موجودة في سجل المراجعة.')
    return found
