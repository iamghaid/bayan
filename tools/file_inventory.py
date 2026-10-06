"""Write a one-line Arabic explanation for every tracked repository file."""
import ast
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXACT = {
    'theme.js': 'يبدّل الثيم ويحفظ الاختيار ويزامنه بين الواجهة وصفحاتها.',
    'theme.css': 'ألوان وتنسيقات الواجهات في الوضعين الداكن والفاتح.',
    'index.html': 'الواجهة الموحدة للتنقل بين الخطبة ومراجعة الحركات.',
    'signer.js': 'يحوّل بيانات الحركة إلى مفاصل الأفتار ويضبط التلامس وحدود الحركة.',
    'handfix.js': 'ينظّف تتبع اليدين والأصابع ويخفف الاهتزاز والأخطاء.',
    'signfix.js': 'تصحيحات مخصصة لحركات بعينها بحسب معرّف الإشارة.',
    'man_dress.js': 'يضبط مظهر الأفتار السعودي والثوب والشماغ والعقال.',
    'khutbah.html': 'صفحة النص والصوت وتشغيل الخطبة مع الأفتار.',
    'khutbah.js': 'يشغّل خطة الخطبة ويزامن الكلمات مع الحركات.',
    'demo.js': 'يدير إدخال النص وتسجيل الصوت والتفريغ وإعداد الإشارات.',
    'motion-review.html': 'صفحة معاينة الحركات وتسجيل قرارات المراجعة.',
    'motion-review.js': 'تحميل الحركات وأدوات التشغيل والملاحظات والاعتماد والرفض.',
    'workspace.js': 'إدارة تبويبات الواجهة والتنقل بلوحة المفاتيح.',
    'unified-view.js': 'إيقاف التشغيل عند تبديل المساحة في الواجهة الموحدة.',
    'review-assistant.js': 'واجهة مساعد المراجعة وطلبات الاقتراحات إلى الخادم.',
    'deployment.json': 'هوية مشروع فيرسل المعتمد للنشر.',
    'README.md': 'شرح المشروع بالعربية والإنجليزية والتشغيل والتحقق.',
}

def describe(name):
    if name in EXACT: return EXACT[name]
    p=Path(name); stem=p.stem
    if name.startswith('sshi_motion/m/'): return f'بيانات الإطارات والمفاصل للإشارة رقم {stem} في مكتبة التشغيل.'
    if name.startswith('lib/'): return 'مكتبة خارجية لعرض المشهد أو تحميل نموذج الأفتار؛ يحتفظ الملف بكود المورد.'
    if name.startswith('avatar/'): return 'نموذج أو مورد بصري للأفتار المستخدم في العرض.'
    if name.startswith('translations/'):
        return 'نص خطبة محفوظة.' if p.suffix=='.txt' and '_gemini' not in stem else 'خطة ترجمة محفوظة أو تقرير مقروء لإشارات الخطبة.'
    if name.startswith('coverage/expansion/batch_'):
        if stem.endswith('candidates'): return 'مرشحات دفعة التوسعة مع المعرّفات والأسماء والمصدر.'
        if stem.endswith('published'): return 'قائمة الحركات المختارة والمنشورة من هذه الدفعة.'
        return 'نتائج الفحص الفني والبصري وحالات التأجيل لكل حركة في الدفعة.'
    if 'staging_qa' in stem: return 'تدقيق ملفات المراجعة وجودة التتبع وبنية الإطارات ومصدر البيانات.'
    if stem=='staging_summary': return 'أعداد مكتبة التشغيل والمراجعة ومجموع المعرّفات المختلفة.'
    if name.startswith('coverage/'):
        if 'motion_results' in stem: return 'نتائج تنزيل واستخراج مرشحات الحركة والتحقق من بيانات المصدر.'
        if 'terminology_alpha' in stem: return 'نسخة بحثية محفوظة لصفحة فهرس المصطلحات.'
        return f'بيانات أو تقرير بحثي عن {stem.replace("_", " ")} لدعم القاموس وتحليل التغطية.'
    if name.startswith('.github/'): return 'إعداد فحص آلي أو قالب تعاون للمستودع على GitHub.'
    if p.name.startswith('test_') or 'test' in stem: return f'اختبارات التحقق الخاصة بـ {stem.replace("_", " ")}.'
    if name.startswith('tools/') and p.suffix=='.py':
        try:
            doc=ast.get_docstring(ast.parse((ROOT/name).read_text(encoding='utf-8-sig')))
            if doc: return 'أداة تطوير: '+doc.splitlines()[0].replace('|','/').strip()
        except (SyntaxError, UnicodeError): pass
        return f'أداة تطوير لتحليل أو إعداد {stem.replace("_", " ")}.'
    if name.startswith('tools/'): return f'مورد أو أداة تطوير خاصة بـ {stem.replace("_", " ")}.'
    if name.startswith('docs/'): return f'توثيق {stem.replace("_", " ")} للمطورين والمراجعين.'
    if p.suffix=='.css': return 'تنسيق عناصر الواجهة والمسافات والتجاوب مع أحجام الشاشة.'
    if name.startswith('api/'): return 'مدخل خادم فيرسل لطلبات التطبيق.'
    if p.suffix=='.json': return f'إعدادات أو بيانات {stem.replace("_", " ")}.'
    if p.name.startswith('.'): return 'إعدادات المشروع أو قواعد استبعاد الملفات المحلية من الرفع.'
    return f'ملف {stem.replace("_", " ")} ضمن أدوات وتوثيق المشروع.'

def main():
    paths=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
    paths.update(['theme.js','theme.css','tools/file_inventory.py','docs/FILE_INVENTORY_AR.md'])
    lines=['# شرح جميع ملفات المستودع','',
           'سطر واحد لكل ملف متتبع في Git؛ ملفات البيانات المتكررة تُشرح كلٌّ بمعرّفها. الملفات المحلية المستبعدة ليست ضمن القائمة.','',
           '| الملف | وظيفته |','| --- | --- |']
    for name in sorted(paths): lines.append(f'| [{name}](../{name}) | {describe(name)} |')
    (ROOT/'docs/FILE_INVENTORY_AR.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(f'Documented {len(paths)} repository files.')

if __name__=='__main__': main()
