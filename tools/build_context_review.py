"""Prioritize unresolved meanings using actual khutbah contexts, never guess signs."""
import collections
import json
from demo_server import ROOT, make_plan
from khutbah_coverage import weight


def build():
    records = {}
    for path in sorted((ROOT / 'translations').glob('*_gemini.json')):
        grouped = collections.defaultdict(list)
        for item in json.loads(path.read_text(encoding='utf-8'))['plan']:
            value = item.get('text', '')
            grouped[item['s']].append('﴿' + value + '﴾' if item['action'] == 'quran' else value)
        for sentence_id, chunks in grouped.items():
            text = ' '.join(chunks)
            for item in make_plan(text, True)['plan']:
                if item['action'] != 'pending':
                    continue
                key = (item['text'], item.get('how', ''), tuple(str(s['id']) for s in item['sources']))
                record = records.setdefault(key, {'text': item['text'], 'how': item.get('how'),
                    'occurrences': 0, 'word_occurrences': 0, 'candidates': item['sources'],
                    'meaning_sources': item.get('meaning_sources', []),
                    'morphology': item.get('morphology'), 'contexts': [],
                    'review_status': 'not_reviewed', 'selected_sign': None})
                record['occurrences'] += 1
                record['word_occurrences'] += weight(item['text'])
                context = {'khutbah': path.stem.split('_')[0], 'sentence': sentence_id, 'text': text}
                if len(record['contexts']) < 3 and context not in record['contexts']:
                    record['contexts'].append(context)
    ordered = sorted(records.values(), key=lambda r: (-r['word_occurrences'], r['text']))
    out = ROOT / 'coverage/research/context_review_queue.json'
    out.write_text(json.dumps({'purpose': 'Human review of meaning and sign selection; not training labels or automatic approvals',
        'items': ordered}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'review_items': len(ordered), 'pending_word_occurrences': sum(r['word_occurrences'] for r in ordered),
        'top': [{'text': r['text'], 'occurrences': r['occurrences']} for r in ordered[:12]]}, ensure_ascii=True))


if __name__ == '__main__':
    build()
