"""Offline Qalsadi analysis; store all possible lemmas, never approve meanings."""
import collections
import importlib.metadata
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / '.localdeps'))
from qalsadi.lemmatizer import Lemmatizer
from demo_server import DIRECT_INDEX, lookup, norm
import demo_server


def build():
    # Rebuild from source forms, rather than skipping entries in the previous output.
    demo_server.MORPH_INDEX = {}
    words = collections.Counter()
    for file in (ROOT / 'translations').glob('*_gemini.json'):
        for item in json.loads(file.read_text(encoding='utf-8'))['plan']:
            if item['action'] != 'quran':
                words.update(re.findall(r'[ء-ي\u064b-\u065f\u0670ـ]+', item.get('text', '')))
    analyzer = Lemmatizer(cache_path=False)
    rows = {}
    for word, occurrences in words.most_common():
        if lookup(word)[0] or norm(word) in {'لا', 'لم', 'لن', 'ليس', 'ولا', 'فلا', 'ما'}:
            continue
        lemmas = sorted(set(analyzer.lemmatize(word, all=True)))
        candidates = sorted({ident for lemma in lemmas for ident in DIRECT_INDEX.get(norm(lemma), [])}, key=int)
        if candidates:
            rows[word] = {'lemmas': lemmas, 'candidate_ids': candidates,
                          'analyses': len(lemmas), 'occurrences': occurrences,
                          'source': 'https://github.com/linuxscout/qalsadi', 'review': 'pending'}
    destination = ROOT / 'coverage/research/morphology_candidates.json'
    destination.write_text(json.dumps({'tool': 'qalsadi', 'version': importlib.metadata.version('qalsadi'),
                                       'words': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'unknown_forms_with_candidates': len(rows),
                      'single_analysis_forms': sum(v['analyses'] == 1 for v in rows.values()),
                      'word_occurrences': sum(v['occurrences'] for v in rows.values())}))


if __name__ == '__main__':
    build()
