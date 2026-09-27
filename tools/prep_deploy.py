"""يجهّز مجلد النشر العام: الصفحات + الأفاتار + الترجمات + ملفات الحركة فقط.
لا فيديوهات، لا مفتاح Gemini، لا أدوات."""
import shutil, pathlib, json, sys
sys.stdout.reconfigure(encoding='utf-8')
S = pathlib.Path(__file__).resolve().parent.parent
D = pathlib.Path.home() / 'Downloads' / 'khutbah-sign-deploy'
files = ['index.html', 'app.js', 'style.css', 'lexicon.json', 'README.md',
         'khutbah.html', 'khutbah.js', 'handfix.js', 'signer.js', 'man_dress.js',
         'lib/three.min.js', 'lib/GLTFLoader.js', 'lib/three-vrm.min.js', 'avatar/man.glb', 'sshi_motion/index.json']
files += [p.relative_to(S).as_posix() for p in (S / 'sigml').glob('*.sigml')]
files += [p.relative_to(S).as_posix() for p in (S / 'translations').glob('*_gemini.json')]
files += [p.relative_to(S).as_posix() for p in (S / 'translations').glob('*_gemini.txt')]
files += [p.relative_to(S).as_posix() for p in (S / 'sshi_motion' / 'm').glob('*.json')]
total = 0
for f in files:
    src, dst = S / f, D / f
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst); total += src.stat().st_size
bad = [p for p in D.rglob('*') if p.is_file() and (p.suffix in ('.mp4', '.txt') and 'translations' not in p.parts or 'gemini_key' in p.name)]
print(f'{len(files)} ملف، {total / 1e6:.1f} ميغا', '| ملفات ممنوعة:', bad)
