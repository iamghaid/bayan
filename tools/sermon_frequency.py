"""Rank sermon vocabulary and missing source motions without approving ambiguous matches."""
import collections
import json
import re

from demo_server import BY_ID, ROOT, lookup, norm

OUT = ROOT / 'coverage/expansion'
TOKEN = re.compile(r'[ء-ي\u064b-\u065f\u0670ـ]+')
STOP = {norm(word) for word in 'من في على إلى عن أن إن ما لا لم لن هو هي هم هذا هذه ذلك تلك و أو ثم يا كل كان قد التي الذي الذين'.split()}


def analyze():
    counts = collections.Counter()
    documents = collections.defaultdict(set)
    forms = collections.defaultdict(collections.Counter)
    candidate_counts = collections.Counter()
    examples = collections.defaultdict(collections.Counter)
    files = sorted((ROOT / 'translations').glob('*_gemini.json'))
    for file in files:
        saved = json.loads(file.read_text(encoding='utf-8'))
        for item in saved['plan']:
            if item['action'] == 'quran':
                continue
            for token in TOKEN.findall(item.get('text', '')):
                display = re.sub(r'[\u064b-\u065f\u0670ـ]', '', token)
                # Preserve hamza and word spelling in counts: الإمام != الأمام.
                key = display
                counts[key] += 1
                documents[key].add(file.stem.split('_')[0])
                forms[key][display] += 1
                ids, _ = lookup(token)
                # Competing source IDs are candidates for inspection, not translations.
                for ident in ids:
                    candidate_counts[ident] += 1
                    examples[ident][display] += 1
    vocabulary = [{'word': forms[key].most_common(1)[0][0], 'normalized': key,
                   'occurrences': count, 'sermons': len(documents[key]),
                  'function_word': norm(key) in STOP}
                  for key, count in counts.most_common()]
    existing = {p.stem for directory in ('m', 'staging')
                for p in (ROOT / 'sshi_motion' / directory).glob('*.json')}
    candidates = []
    selected_labels = set()
    for ident, _ in candidate_counts.most_common():
        if ident in existing or ident not in BY_ID or not BY_ID[ident].get('video'):
            continue
        word = BY_ID[ident]
        label = norm(word['ar']).strip()
        label_key = label[2:] if label.startswith('ال') and len(label) > 4 else label
        if label_key in selected_labels:
            continue
        # Alias hits such as "كما" -> "كيلو متر" do not justify extraction.
        matched = {}
        for text, uses in examples[ident].items():
            key = norm(text)
            variants = {key}
            if key[:1] in {'و', 'ف'} and len(key) > 3:
                variants.add(key[1:])
            variants.update(value[2:] for value in list(variants)
                            if value.startswith('ال') and len(value) > 4)
            if label in variants or label_key in variants:
                matched[text] = uses
        if not matched:
            continue
        selected_labels.add(label_key)
        candidates.append({'id': int(ident), 'ar': word['ar'],
                           'candidate_occurrences': sum(matched.values()),
                           'matched_words': matched, 'source': 'https://sshi.sa',
                           'matching_status': 'candidate_requires_context_review'})
    candidates.sort(key=lambda row: (-row['candidate_occurrences'], row['id']))
    report = {'sermons': len(files), 'quran_words': 'excluded',
              'counting': 'Diacritics removed; hamza spelling preserved. Clitic forms counted separately. No lemma merging.',
              'vocabulary': vocabulary, 'missing_motion_candidates': candidates}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'sermon_frequency.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'frequency_candidates.json').write_text(json.dumps(candidates[:20], ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    report = analyze()
    print(json.dumps({'sermons': report['sermons'],
                      'content_words': [row for row in report['vocabulary'] if not row['function_word']][:15],
                      'new_candidates': report['missing_motion_candidates'][:20]}, ensure_ascii=True))
