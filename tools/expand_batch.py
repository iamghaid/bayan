"""Verify live SSHI metadata, download local references and stage new motions.
Usage: python tools/expand_batch.py --limit 10
No staged motion is added to the player or marked reviewed.
"""
import argparse
import concurrent.futures
import json
import pathlib
import urllib.request

import sshi_extract as extract

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAGE = ROOT / 'sshi_motion/staging'
REPORT = ROOT / 'coverage/expansion/extraction_results.json'


def work(item, live):
    result = {'id': item['id'], 'ar': item['ar'], 'review_status': 'not_reviewed', 'status': 'pending', 'source': 'https://sshi.sa'}
    current = live.get(item['id'])
    if not current or (current.get('wordAr') or '').strip() != item['ar']:
        return dict(result, status='source_metadata_mismatch')
    video = current.get('video')
    if not video:
        return dict(result, status='no_source_video')
    result['source_video'] = video
    result['metadata_verified'] = True
    staged = STAGE / f"{item['id']}.json"
    if staged.exists():
        motion = json.loads(staged.read_text(encoding='utf-8'))
        frames = motion.get('fr') or []
        return dict(result, status='staged_needs_visual_and_linguistic_review', frames=len(frames), hand_frames=sum(bool(f[2] or f[3]) for f in frames), fps=motion.get('fps'), source_downloaded=(extract.SRC / f"{item['id']}.mp4").exists())
    try:
        src = extract.download({'id': item['id'], 'video': video})
        if not src:
            return dict(result, status='download_failed')
        motion, hands = extract.extract(src)
        frames = len(motion['fr'])
        if not frames or hands < frames * 0.5:
            return dict(result, status='technical_check_failed', frames=frames, hand_frames=hands)
        motion.update(id=item['id'], ar=item['ar'])
        destination = STAGE / f"{item['id']}.json"
        destination.write_text(json.dumps(motion, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        return dict(result, status='staged_needs_visual_and_linguistic_review', frames=frames, hand_frames=hands, fps=motion['fps'], source_downloaded=True)
    except Exception as exc:
        return dict(result, status='extraction_failed', error_type=type(exc).__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--manifest', type=pathlib.Path, default=ROOT / 'coverage/expansion/priority_500.json')
    parser.add_argument('--report', type=pathlib.Path, default=REPORT)
    args = parser.parse_args()
    if not 1 <= args.limit <= 500:
        parser.error('limit must be between 1 and 500')
    if not 1 <= args.workers <= 4:
        parser.error('workers must be between 1 and 4')
    STAGE.mkdir(parents=True, exist_ok=True)
    extract.SRC.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request('https://sshi.sa/api/Words/Words?page=1&row=50000', headers={'User-Agent': 'Bayan-source-verification/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = json.load(response)
    live = {int(w['id']): w for w in data['info']['data']}
    items = json.loads(args.manifest.read_text(encoding='utf-8'))[:args.limit]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, item, live) for item in items]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            temporary_report = args.report.with_suffix('.tmp')
            temporary_report.write_text(json.dumps(sorted(results, key=lambda x: x['id']), ensure_ascii=False, indent=2), encoding='utf-8')
            temporary_report.replace(args.report)
            print(f"{len(results)}/{len(items)} id={result['id']} {result['status']}", flush=True)


if __name__ == '__main__':
    main()
