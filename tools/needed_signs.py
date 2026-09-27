"""يجمع كل إشارات SSHI التي تحتاجها الخطب المترجمة (إشارات + حروف التهجئة + إشارة «آية»)
المخرج: sshi_motion/needed.json = [{id, ar, video, uses}] مرتبة بالأكثر استخدامًا"""
import json, sys, pathlib, collections
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import translate as T

OUT = T.HERE / 'sshi_motion'; OUT.mkdir(exist_ok=True)
use = collections.Counter()
for f in sorted(T.OUT.glob('*_gemini.json')):
    for p in json.loads(f.read_text(encoding='utf8'))['plan']:
        if p['action'] in ('sign', 'quran') and p.get('id'): use[p['id']] += 1
        elif p['action'] == 'spell': use.update(x for x in p.get('letters', []) if x)
need = [{'id': i, 'ar': T.BYID[i]['ar'], 'video': T.BYID[i].get('video'), 'uses': n} for i, n in use.most_common()]
(OUT / 'needed.json').write_text(json.dumps(need, ensure_ascii=False, indent=0), encoding='utf8')
print('إشارات مختلفة:', len(need), '| بلا فيديو:', sum(1 for x in need if not x['video']), '| مجموع الاستخدام:', sum(use.values()))
print('الأكثر:', [(x['ar'], x['uses']) for x in need[:15]])
