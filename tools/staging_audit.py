"""Audit staged motion structure and provenance without approving translation."""
import collections
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'coverage/expansion'


def check_motion(motion, ident):
    errors = []
    frames = motion.get('fr') or []
    if motion.get('id') != ident:
        errors.append('id_mismatch')
    if not isinstance(motion.get('fps'), (float, int)) or not 0 < motion['fps'] <= 120:
        errors.append('invalid_fps')
    if not isinstance(motion.get('asp'), (float, int)) or motion['asp'] <= 0:
        errors.append('invalid_aspect')
    if not frames:
        errors.append('no_frames')
    left = right = tracked = 0
    for frame in frames:
        valid = isinstance(frame, list) and len(frame) == 5
        valid = valid and isinstance(frame[0], list) and len(frame[0]) == 27 and isinstance(frame[1], list) and len(frame[1]) == 4
        if valid:
            for hand in frame[2:4]:
                if hand != 0 and (not isinstance(hand, list) or len(hand) != 63):
                    valid = False
        if valid:
            values = frame[0] + frame[1] + (frame[2] or []) + (frame[3] or [])
            valid = all(isinstance(value, int) and not isinstance(value, bool) for value in values)
        if not valid:
            errors.append('invalid_frame_schema')
            continue
        left += bool(frame[2])
        right += bool(frame[3])
        tracked += bool(frame[2] or frame[3])
    return {'schema_errors': sorted(set(errors)), 'frames': len(frames),
            'tracked_ratio': round(tracked / max(1, len(frames)), 3),
            'left_ratio': round(left / max(1, len(frames)), 3),
            'right_ratio': round(right / max(1, len(frames)), 3),
            'seconds': round(len(frames) / motion['fps'], 2) if isinstance(motion.get('fps'), (float, int)) and motion['fps'] > 0 else 0}


def audit():
    results = json.loads((OUT / 'extraction_results.json').read_text(encoding='utf-8'))
    for extra_report in sorted((ROOT / 'coverage/research').glob('*motion_results.json')):
        combined = {str(item['id']): item for item in results}
        combined.update({str(item['id']): item for item in json.loads(extra_report.read_text(encoding='utf-8'))})
        results = list(combined.values())
    rows = []
    for item in results:
        file = ROOT / f"sshi_motion/staging/{item['id']}.json"
        row = {'id': item['id'], 'ar': item['ar'], 'extraction_status': item['status'],
               'metadata_verified': item.get('metadata_verified', False), 'review_status': 'not_reviewed'}
        row['also_in_active_library'] = (ROOT / f"sshi_motion/m/{item['id']}.json").is_file()
        if file.exists():
            data = file.read_bytes()
            row.update(check_motion(json.loads(data), item['id']))
            row['motion_sha256'] = hashlib.sha256(data).hexdigest()
        else:
            row.update(schema_errors=['no_staged_motion'], frames=0, tracked_ratio=0, left_ratio=0, right_ratio=0, seconds=0, motion_sha256='')
        video = ROOT / f"sshi_motion/src/{item['id']}.mp4"
        row['reference_present'] = video.exists()
        row['reference_sha256'] = hashlib.sha256(video.read_bytes()).hexdigest() if video.exists() else ''
        row['visual_review'] = 'pending'
        row['linguistic_review'] = 'pending'
        rows.append(row)
    # Lowest tracking coverage and failed schemas are reviewed first.
    rows.sort(key=lambda row: (not bool(row['schema_errors']), row['tracked_ratio'], row['id']))
    (OUT / 'staging_qa.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    with (OUT / 'staging_qa.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    summary = {'processed': len(rows), 'staged': sum(row['frames'] > 0 for row in rows),
               'schema_valid': sum(not row['schema_errors'] for row in rows),
               'source_references_present': sum(row['reference_present'] for row in rows),
               'extraction_statuses': dict(collections.Counter(row['extraction_status'] for row in rows)),
               'active_library': len(list((ROOT / 'sshi_motion/m').glob('*.json')))}
    active_ids = {p.stem for p in (ROOT / 'sshi_motion/m').glob('*.json')}
    staged_ids = {p.stem for p in (ROOT / 'sshi_motion/staging').glob('*.json')}
    summary.update(active_staged_overlap=len(active_ids & staged_ids),
                   staged_only=len(staged_ids - active_ids),
                   unique_motion_files=len(active_ids | staged_ids))
    (OUT / 'staging_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    return summary


if __name__ == '__main__':
    print(json.dumps(audit(), ensure_ascii=True))
