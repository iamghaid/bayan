"""Preserve reported original mappings as audit data; stop playing them."""
import json
from demo_server import ROOT, norm

holds = json.loads((ROOT / 'tools/translation_holds.json').read_text(encoding='utf-8'))
changed = 0
for path in (ROOT / 'translations').glob('*_gemini.json'):
    data = json.loads(path.read_text(encoding='utf-8'))
    dirty = False
    for item in data['plan']:
        key = norm(item.get('text', ''))
        if key not in holds or item['action'] == 'quran':
            continue
        if item.get('reason') == 'reported-translation-issue':
            continue
        item['previous_mapping'] = {k: item[k] for k in ['action', 'id', 'sign', 'how', 'conf'] if k in item}
        item.update(action='pending', conf='review', reason='reported-translation-issue', review_note=holds[key])
        for k in ['id', 'sign', 'letters', 'preview_only']:
            item.pop(k, None)
        dirty = True
        changed += 1
    if dirty:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Held {changed} reported mappings; original mappings retained for audit.')
