"""
يبحث داخل مجلد القاموس (بعد تنزيله من Zenodo) عن ملفات SiGML تطابق مصطلحات lexicon.json،
ويطبع اقتراحات للربط. لا يعدّل أي شيء تلقائيًا: القرار النهائي للفريق.

الاستخدام:
    python tools/find_terms.py /path/to/dictionary_folder
    python tools/find_terms.py /path/to/dictionary_folder --copy   # ينسخ الملفات المقترحة إلى sigml/

يطابق على: اسم الملف، وسمة gloss داخل الملف (<hns_sign gloss="...">).
"""
import json, re, sys, shutil, pathlib

TASHKEEL = re.compile(r'[\u064B-\u065F\u0670\u0640]')

def norm(s):
    s = TASHKEEL.sub('', s)
    s = re.sub('[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه')
    return re.sub(r'[^\u0621-\u064A ]', ' ', s).strip()

def keys(s):
    n = norm(s)
    out = {n}
    if n.startswith('ال') and len(n) > 4:
        out.add(n[2:])
    return out

def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    root = pathlib.Path(sys.argv[1])
    copy = '--copy' in sys.argv
    here = pathlib.Path(__file__).resolve().parent.parent
    lex = json.loads((here / 'lexicon.json').read_text(encoding='utf8'))

    # فهرس: كل مفتاح عربي -> ملفات
    index = {}
    files = list(root.rglob('*.sigml')) + list(root.rglob('*.xml'))
    for f in files:
        names = [f.stem]
        try:
            txt = f.read_text(encoding='utf8', errors='ignore')
            names += re.findall(r'gloss="([^"]+)"', txt)
        except Exception:
            pass
        for nm in names:
            for k in keys(nm):
                if k:
                    index.setdefault(k, set()).add(f)
    print(f'فُحص {len(files)} ملف.\n')

    for term in lex['terms']:
        found = set()
        for v in term['variants'] + term.get('phrases', []):
            for k in keys(v):
                found |= index.get(k, set())
        if found:
            print(f"✓ {term['gloss']}  ({term['id']}):")
            for f in sorted(found)[:5]:
                print('    ', f)
            if copy:
                src = sorted(found)[0]
                dst = here / 'sigml' / f"{term['id']}.sigml"
                shutil.copy(src, dst)
                print(f'     نُسخ إلى sigml/{dst.name} — عدّل lexicon.json: "sigml": "{dst.name}"')
        else:
            print(f"✗ {term['gloss']}  ({term['id']}): لا يوجد — سيبقى نصًا")
    print('\nتذكير: sign_reviewed تبقى false حتى يؤكد مترجم أو شخص أصم صحة الحركة.')

if __name__ == '__main__':
    main()
