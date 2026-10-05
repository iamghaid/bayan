"""Index public term titles and source links for local expansion research.

Does not copy definitions, download sign videos, or approve any sign mapping.
Run offline by default; --fetch indexes alphabet pages sequentially, respecting errors.
"""
import argparse
import collections
import csv
import html
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from demo_server import DIRECT_INDEX, MOTIONS, norm

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'coverage/research'
LETTERS = list('أبتثجحخدذرزسشصضطظعغفقكلمن') + ['هـ', 'و', 'ي']


def parse_titles(document):
    pattern = r'<h4\b[^>]*>\s*<a\b[^>]*href=["\'](https://terminologyenc\.com/ar/browse/term/(\d+))["\'][^>]*>(.*?)</a>'
    entries = {}
    for url, ident, label in re.findall(pattern, document, flags=re.S | re.I):
        title = ' '.join(html.unescape(re.sub('<[^>]+>', '', label)).split())
        if title:
            entries[ident] = {'source_id': ident, 'title': title, 'source_url': url}
    return list(entries.values())


def compare(entry):
    key = ' '.join(norm(entry['title']).split())
    ids = sorted(set(DIRECT_INDEX.get(key, [])), key=int)
    # Exact label agreement suggests review candidates, not semantic equivalence.
    return {**entry, 'normalized_title': key, 'candidate_sign_ids': ids,
            'candidate_motion_ids': [i for i in ids if i in MOTIONS],
            'state': 'new_term' if not ids else 'ambiguous_label' if len(ids) > 1 else 'label_with_motion' if ids[0] in MOTIONS else 'label_without_motion',
            'review': 'pending', 'permission': 'not_verified', 'playable_approved': False}


def fetch():
    OUT.mkdir(parents=True, exist_ok=True)
    errors = []
    for letter in LETTERS:
        target = OUT / ('terminology_alpha_' + '_'.join(str(ord(c)) for c in letter) + '.html')
        if target.exists():
            continue
        url = 'https://terminologyenc.com/ar/browse/alpha/' + quote(letter)
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(12 * 1024 * 1024).decode('utf-8')
            if not parse_titles(content):
                errors.append({'url': url, 'error': 'no_term_titles'})
                continue
            target.write_text(content, encoding='utf-8')
            print(f'{letter}: {len(parse_titles(content))} titles', flush=True)
        except (urllib.error.URLError, OSError) as exc:
            code = getattr(exc, 'code', None)
            errors.append({'url': url, 'error': code or type(exc).__name__})
            if code in (403, 429):
                break
        time.sleep(1)
    (OUT / 'fetch_errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')


def audit():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = {}
    pages = sorted(OUT.glob('terminology_alpha_*.html'))
    if (OUT / 'terminology_alpha_1571.html').exists():
        pages = [p for p in pages if p.name != 'terminology_alpha_a.html']
    for page in pages:
        for entry in parse_titles(page.read_text(encoding='utf-8')):
            entries[entry['source_id']] = entry
    rows = [compare(e) for e in entries.values()]
    rows.sort(key=lambda e: (e['normalized_title'], e['source_id']))
    summary = {'checked_at_utc': datetime.now(timezone.utc).isoformat(), 'indexed_pages': len(pages),
               'source_entries': len(rows), 'unique_normalized_titles': len({r['normalized_title'] for r in rows}),
               'states': dict(collections.Counter(r['state'] for r in rows)), 'new_approved_motions': 0,
               'note': 'Titles and links only. Label candidates are unreviewed; no runtime mappings changed.'}
    khutbahs = []
    for file in sorted((ROOT / 'translations').glob('*_gemini.json')):
        data = json.loads(file.read_text(encoding='utf-8'))
        khutbahs.append(' '.join(norm(' '.join(data.get('sentences', []))).split()))
    ranked = []
    for row in rows:
        key = row['normalized_title']
        hits = sum(len(re.findall(r'(?<!\w)' + re.escape(key) + r'(?!\w)', text)) for text in khutbahs)
        # Exact phrase occurrences first; long personal names are not vocabulary priorities.
        if len(key.split()) > 3 or any(token in key.split() for token in ('بن', 'بنت', 'ابن')):
            continue
        score = hits * 100 + {'label_with_motion': 30, 'label_without_motion': 20, 'new_term': 5, 'ambiguous_label': 0}[row['state']]
        ranked.append({**row, 'khutbah_exact_occurrences': hits, 'priority_score': score})
    ranked.sort(key=lambda r: (-r['priority_score'], r['normalized_title'], r['source_id']))
    (OUT / 'priority_100.json').write_text(json.dumps(ranked[:100], ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'terminology_candidates.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    with (OUT / 'terminology_candidates.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=['title', 'source_url', 'state', 'candidate_sign_ids', 'candidate_motion_ids', 'review', 'permission'])
        writer.writeheader()
        for row in rows:
            writer.writerow({k: ','.join(row[k]) if isinstance(row[k], list) else row[k] for k in writer.fieldnames})
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    args = parser.parse_args()
    if args.fetch:
        fetch()
    audit()
