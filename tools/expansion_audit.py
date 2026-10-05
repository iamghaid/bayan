"""Reproducible offline inventory and ranked motion expansion batches.

Run from any directory: python tools/expansion_audit.py
Reads source metadata and existing plans; does not download videos or alter motions.
"""
import collections
import csv
import importlib.util
import json
from pathlib import Path
from urllib.parse import quote

from demo_server import INDEX, WORDS, norm

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'coverage/expansion'
PRIORITY_CATEGORIES = ('دين', 'اسلام', 'اجتماع', 'اسر', 'مشاعر', 'اخلاق', 'حياه', 'تعليم', 'صحه')


def audit():
    OUT.mkdir(parents=True, exist_ok=True)
    motions = {p.stem for p in (ROOT / 'sshi_motion/m').glob('*.json')}
    use = collections.Counter()
    pending_words = collections.Counter()
    example = {}
    files = sorted((ROOT / 'translations').glob('*_gemini.json'))
    for file in files:
        data = json.loads(file.read_text(encoding='utf-8'))
        for item in data['plan']:
            if item.get('action') == 'sign' and item.get('id') is not None:
                use[str(item['id'])] += 1
            if item.get('action') == 'spell':
                pending_words[norm(item.get('text', ''))] += 1
                for ident in item.get('letters') or []:
                    if ident is not None:
                        use[str(ident)] += 1
            key = norm(item.get('text', ''))
            if key and key not in example:
                example[key] = data['sentences'][item['s']][:260]

    missing = []
    aliases_by_id = collections.defaultdict(list)
    for key, ids in INDEX.items():
        for ident in ids:
            aliases_by_id[ident].append(key)
    for word in WORDS:
        ident = str(word['id'])
        if ident in motions:
            continue
        aliases = aliases_by_id[ident]
        related = sum(pending_words[key] for key in aliases)
        video = word.get('video') or ''
        category = word.get('cat') or ''
        category_priority = any(token in norm(category) for token in PRIORITY_CATEGORIES)
        # This score is a scheduling heuristic, not linguistic confidence.
        score = 1000 * use[ident] + 50 * related + 20 * category_priority + 5 * bool(video)
        missing.append({'id': int(ident), 'ar': word['ar'], 'category': category,
                        'synonyms': word.get('syn') or '', 'uses_in_saved_plans': use[ident],
                        'matching_spelled_occurrences': related, 'priority_score': score,
                        'source': 'https://sshi.sa', 'source_video_filename': video,
                        'source_video_url': 'https://sshi.sa/api/file/' + quote(video, safe='') if video else '',
                        'source_status': 'metadata_only_not_network_verified' if video else 'no_video_metadata',
                        'local_video': (ROOT / f'sshi_motion/src/{ident}.mp4').is_file(),
                        'motion_status': 'missing', 'review_status': 'not_reviewed',
                        'rights_status': 'public_use_permission_not_verified',
                        'example': next((example[key] for key in aliases if key in example), '')})
    missing.sort(key=lambda item: (-item['priority_score'], item['id']))
    # Check that each listed source is reachable and usable by the pipeline.
    selected = [item for item in missing if item['source_video_filename']][:500]
    names = list(missing[0]) if missing else []
    for name, rows in [('missing_all', missing), ('priority_500', selected)]:
        (OUT / f'{name}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        with (OUT / f'{name}.csv').open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=names)
            writer.writeheader()
            writer.writerows(rows)
    for start in range(0, len(selected), 100):
        (OUT / f'batch_{start // 100 + 1:02}.json').write_text(json.dumps(selected[start:start + 100], ensure_ascii=False, indent=2), encoding='utf-8')
    categories = collections.Counter(item['category'] for item in selected)
    summary = {'dictionary_entries': len(WORDS), 'unique_dictionary_ids': len({str(w['id']) for w in WORDS}),
               'existing_motion_files': len(motions), 'dictionary_entries_with_motion': sum(str(w['id']) in motions for w in WORDS),
               'missing_motion_entries': len(missing), 'missing_with_video_metadata': sum(bool(item['source_video_filename']) for item in missing),
               'selected': len(selected), 'selected_local_videos': sum(item['local_video'] for item in selected),
               'saved_khutbah_count': len(files), 'selected_matching_spelled_occurrences': sum(item['matching_spelled_occurrences'] for item in selected),
               'selected_categories': dict(categories),
               'runtime_dependencies': {name: importlib.util.find_spec(name) is not None for name in ['cv2', 'mediapipe', 'qalsadi']}}
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    report = f'''# تدقيق توسعة بيان

هذا التقرير مبني على النسخة المحلية من القاموس وخطط الخطب الخمس، وليس على اختبار مصدر مباشر أو مراجعة لغوية.

- مداخل القاموس: {len(WORDS):,}.
- الحركات الموجودة: {len(motions):,}.
- مداخل تحتاج حركة: {len(missing):,}.
- منها مداخل لها اسم فيديو في بيانات المصدر: {summary['missing_with_video_metadata']:,}.
- الدفعة المرشحة: {len(selected)} مدخلًا في خمس قوائم، كل قائمة حتى 100.
- فيديوهات محلية متوفرة ضمن المرشحين: {summary['selected_local_videos']}.

## ترتيب الأولوية

الأولوية = 1000 × استخدام المعرّف في الخطط الحالية + 50 × مرات ظهور صيغة مطابقة ضمن الكلمات المهجأة + 20 للفئات ذات الصلة + 5 لوجود بيانات فيديو.
هذا ترتيب هندسي أولي. العد المرتبط بالتهجئة قد يتكرر بين المعاني المختلفة؛ لا يثبت أن المعنى هو نفسه. لا يحتوي هذا التقرير بيانات تكرار من عموم اللغة العربية. المرشحون 500 مداخل، وليسوا بالضرورة 500 مفهوم مستقل.

## تنفيذ كل دفعة

1. مراجعة المعنى والسياق وإزالة التكرار بين المفاهيم.
2. التحقق من رابط المصدر لكل دفعة.
3. تنزيل الفيديوهات محليًا فقط، واستخراج الحركة دون تعديل الحركات الموجودة.
4. فحص تتبع اليدين والأصابع والتلامس ومقارنة الأداء بالمرجع.
5. مراجعة لغة الإشارة وأمثلة الجمل؛ استخراج حركة لا يعني اعتمادها.
6. إضافة الحركات التي تجتاز الفحص إلى فهرس المشغّل وقياس تغطية خطب اختبار جديدة.

## ملفات التسليم

- `missing_all.csv/json`: جميع المداخل الناقصة ومصادرها.
- `priority_500.csv/json`: أول 500 مرشح مع الأسباب وحالة المصدر والمراجعة.
- `batch_01.json` إلى `batch_05.json`: قوائم العمل المقترحة.
- `summary.json`: الأعداد وحالة اعتماديات الاستخراج في بيئة التدقيق.

لم يتم تنزيل فيديوهات أو استخراج حركات أو اعتماد ترجمات في هذه الخطوة. روابط الفيديو مبنية من بيانات المكتبة، ولم تُختبر عبر الشبكة.
'''
    (OUT / 'REPORT.md').write_text(report, encoding='utf-8')
    return summary


if __name__ == '__main__':
    print(json.dumps(audit(), ensure_ascii=True))
