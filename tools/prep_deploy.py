"""يجهّز مجلد النشر العام: الصفحات + الأفاتار + الترجمات + ملفات الحركة فقط.
لا فيديوهات، لا مفتاح Gemini، لا أدوات."""
import shutil, pathlib, json, sys, argparse
sys.stdout.reconfigure(encoding='utf-8')
S = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path.home() / 'Downloads' / 'khutbah-sign-deploy')
args = parser.parse_args()
D = args.output.resolve()
files = ['index.html',
         'khutbah.html', 'khutbah.js', 'demo.js', 'demo.css', 'interface.css', 'fonts.css', 'unified-view.js', 'workspace.js', 'handfix.js', 'signfix.js', 'signer.js', 'man_dress.js',
         'lib/three.min.js', 'lib/GLTFLoader.js', 'lib/three-vrm.min.js', 'avatar/man.glb', 'sshi_motion/index.json']
files += [p.relative_to(S).as_posix() for p in (S / 'fonts').glob('*.woff2')]
files += [p.relative_to(S).as_posix() for p in (S / 'translations').glob('*_gemini.json')]
files += [p.relative_to(S).as_posix() for p in (S / 'translations').glob('*_gemini.txt')]
files += [p.relative_to(S).as_posix() for p in (S / 'sshi_motion' / 'm').glob('*.json')]
files += ['api/transcribe.py', 'api/plan.py', 'api/catalog.py', 'api/review_assistant.py', 'review-assistant.js', 'tools/review_assistant.py', 'tools/demo_server.py', 'tools/motion_bank.py', 'tools/motion_catalog.py', 'tools/approved.json', 'tools/translation_holds.json',
          'coverage/sshi_words_v2.json', 'vercel.json', '.vercelignore']
files += ['coverage/research/terminology_candidates.json']
if (S / 'coverage/research/morphology_candidates.json').exists():
    files += ['coverage/research/morphology_candidates.json']
total = 0
for f in files:
    src, dst = S / f, D / f
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst); total += src.stat().st_size
bad = [p for p in D.rglob('*') if p.is_file() and (p.suffix in ('.mp4', '.txt') and 'translations' not in p.parts or 'gemini_key' in p.name)]
if bad:
    raise SystemExit('Deployment contains forbidden files; do not publish.')
unexpected = [p for p in D.rglob('*') if p.is_file() and p.relative_to(D).as_posix() not in files and '.vercel' not in p.relative_to(D).parts]
if unexpected:
    raise SystemExit('Deployment contains unexpected old files; use a new empty output directory.')
print(f'{len(files)} files, {total / 1e6:.1f} MB; no forbidden or unexpected files')
