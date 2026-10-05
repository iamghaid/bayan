"""Measure lexical motion coverage without counting references as translations."""
import collections
import json
import re
from pathlib import Path
from demo_server import ROOT, BY_ID, MOTIONS, WORDS, make_plan, norm

OUT = ROOT / 'coverage/research'


def weight(text):
    return len(re.findall(r'[ء-ي\u064b-\u065f\u0670ـ]+|[A-Za-z]+|\d+', text))


def audit():
    staged = {p.stem for p in (ROOT / 'sshi_motion/staging').glob('*.json')}
    reports, missing = [], collections.Counter()
    for file in sorted((ROOT / 'translations').glob('*_gemini.json')):
        saved = json.loads(file.read_text(encoding='utf-8'))
        # Reconstruct every sentence including words the old plan dropped.
        grouped = collections.defaultdict(list)
        for item in saved['plan']:
            value = item.get('text', '')
            grouped[item['s']].append('﴿' + value + '﴾' if item['action'] == 'quran' else value)
        counts = collections.Counter()
        for sentence in grouped.values():
            text = ' '.join(sentence)
            result = make_plan(text, True)
            for item in result['plan']:
                size = weight(item['text'])
                if item['action'] == 'quran':
                    counts['quran_words_excluded'] += size
                    continue
                counts['spoken_words'] += size
                if item['action'] == 'sign':
                    counts['active_preview_words'] += size
                    if not item.get('preview_only'):
                        counts['locally_mapped_words'] += size
                elif item.get('reason') != 'reported-translation-issue' and item.get('how') not in {'suffix-suggestion', 'morphology-ambiguous'} and len(item['sources']) == 1:
                    ident = str(item['sources'][0]['id'])
                    if ident in staged:
                        counts['staged_candidate_words'] += size
                    else:
                        missing[ident] += size
                        counts['missing_motion_candidate_words'] += size
                elif len(item['sources']) > 1:
                    counts['ambiguous_words'] += size
                else:
                    counts['unresolved_words'] += size
        denominator = counts['spoken_words'] or 1
        reports.append({'khutbah_id': file.stem.split('_')[0], **counts,
                        'active_preview_percent': round(100 * counts['active_preview_words'] / denominator, 2),
                        'active_plus_staged_candidate_percent': round(100 * (counts['active_preview_words'] + counts['staged_candidate_words']) / denominator, 2),
                        'locally_mapped_percent': round(100 * counts['locally_mapped_words'] / denominator, 2)})
    candidates = []
    for ident, occurrences in missing.most_common():
        if ident not in BY_ID or ident in MOTIONS or ident in staged:
            continue
        word = BY_ID[ident]
        candidates.append({'id': int(ident), 'ar': word['ar'], 'candidate_word_occurrences': occurrences,
                           'source': 'https://sshi.sa', 'review_status': 'not_reviewed'})
    # Finish with broad vocabulary, avoiding long proper names and already staged files.
    selected = {str(item['id']) for item in candidates}
    category_priority = ('التربية', 'اجتماع', 'دين', 'الزمن', 'تعليم', 'الصحة', 'الافعال')
    remaining = sorted(WORDS, key=lambda w: (-sum(token in norm(w.get('cat') or '') for token in category_priority), int(w['id'])))
    for word in remaining:
        ident = str(word['id'])
        if ident in MOTIONS or ident in staged or ident in selected or not word.get('video'):
            continue
        if len(word['ar'].split()) > 3 or any(t in norm(word['ar']).split() for t in ('بن', 'ابن', 'بنت')):
            continue
        candidates.append({'id': int(ident), 'ar': word['ar'], 'candidate_word_occurrences': 0,
                           'source': 'https://sshi.sa', 'review_status': 'not_reviewed'})
        selected.add(ident)
        if len(candidates) >= 500:
            break
    summary = {'evaluation': '5 saved khutbahs reconstructed from their original plan text, including dropped words',
               'quran_policy': 'Quran words excluded and counted separately, kept as text',
               'warning': 'Lexical coverage only; preview and staged candidates are not verified sign translations. Not an unseen-khutbah evaluation.',
               'active_motion_files': len(MOTIONS), 'staged_motion_files': len(staged), 'khutbahs': reports}
    total_words = sum(r['spoken_words'] for r in reports)
    active_words = sum(r['active_preview_words'] for r in reports)
    staged_words = sum(r.get('staged_candidate_words', 0) for r in reports)
    summary['weighted_total'] = {'spoken_words': total_words,
                                 'active_preview_percent': round(100 * active_words / max(total_words, 1), 2),
                                 'active_plus_staged_candidate_percent': round(100 * (active_words + staged_words) / max(total_words, 1), 2),
                                 'locally_mapped_percent': round(100 * sum(r.get('locally_mapped_words', 0) for r in reports) / max(total_words, 1), 2)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'khutbah_coverage.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / 'khutbah_motion_batch.json').write_text(json.dumps(candidates[:500], ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    audit()
