// Avatar fidelity against the motion extracted from the source videos.
// Plays every motion (the library in sshi_motion/m and the staged ones under review) on the real avatar (headless Chromium) and compares,
// frame by frame, hand direction, palm direction, finger bending and arm direction with
// the MediaPipe landmarks. It measures retargeting, not MediaPipe accuracy or sign correctness.
//
//   python -m http.server 8030 --bind 127.0.0.1      (in the project folder, separate window)
//   node tools/fidelity_report.js [count|ids,...]   (needs: npm i playwright)
// Writes coverage/fidelity/summary.json and coverage/fidelity/motions.csv.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'coverage', 'fidelity');
const URL = process.env.BAYAN_FIDELITY_URL || 'http://127.0.0.1:8030/tools/fidelity.html';
// A hand-frame "matches" when all of these hold (degrees).
const LIMITS = { dir: 30, palm: 45, curl: 45 };

const ACTIVE = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'sshi_motion', 'index.json'), 'utf8')));
const STAGED = fs.readdirSync(path.join(ROOT, 'sshi_motion', 'staging')).filter(f => /^\d+\.json$/.test(f)).map(f => Number(f.slice(0, -5)))
  .filter(id => !ACTIVE.has(id)).sort((a, b) => a - b);
const library = id => ACTIVE.has(id) ? 'active' : 'staging';
function pick() {
  const all = [...ACTIVE, ...STAGED];
  const arg = process.argv[2];
  if (arg && arg.includes(',')) return arg.split(',').map(Number);
  return arg ? all.slice(0, Number(arg)) : all;
}
// Motions with signfix.js entries deliberately depart from MediaPipe where it was wrong.
const FIXED = new Set([...fs.readFileSync(path.join(ROOT, 'signfix.js'), 'utf8').matchAll(/^\s{4}(\d+):\s*\[/gm)].map(m => Number(m[1])));
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = v => v == null ? null : Math.round(v * 10) / 10;

function score(result) {
  const m = { dir: [], palm: [], curl: [], upper: [], fore: [], bendAgree: 0, fingers: 0, handFrames: 0, matched: 0 };
  for (const sample of result.samples) for (const side of ['Left', 'Right']) {
    const s = sample[side]; if (!s) continue;
    const h = s.hand; m.handFrames++;
    if (h.dir != null) m.dir.push(h.dir);
    if (h.palm != null) m.palm.push(h.palm);
    if (s.arm.upper != null) m.upper.push(s.arm.upper);
    if (s.arm.fore != null) m.fore.push(s.arm.fore);
    let fingersOk = true;
    for (const f of Object.values(h.fingers)) {
      if (f.data == null || f.avatar == null) continue;
      const diff = Math.abs(f.data - f.avatar); m.curl.push(diff); m.fingers++;
      if ((f.data >= 45) === (f.avatar >= 45)) m.bendAgree++;
      if (diff > LIMITS.curl) fingersOk = false;
    }
    if (h.dir != null && h.dir <= LIMITS.dir && h.palm != null && h.palm <= LIMITS.palm && fingersOk) m.matched++;
  }
  return m;
}

(async () => {
  const ids = pick();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('page error:', error.message));
  await page.goto(URL);
  await page.evaluate(() => window.ready);
  const rows = [], all = { dir: [], palm: [], curl: [], upper: [], fore: [], bendAgree: 0, fingers: 0, handFrames: 0, matched: 0 };
  for (const [n, id] of ids.entries()) {
    let result;
    try { result = await page.evaluate(([id, base]) => window.measure(id, base), [id, `../sshi_motion/${library(id) === 'active' ? 'm' : 'staging'}/`]); }
    catch (error) { console.error(`motion ${id}: ${error.message}`); continue; }
    const m = score(result);
    if (library(id) === 'active') {   // the headline numbers describe the playing library
      for (const key of ['dir', 'palm', 'curl', 'upper', 'fore']) all[key].push(...m[key]);
      for (const key of ['bendAgree', 'fingers', 'handFrames', 'matched']) all[key] += m[key];
    }
    rows.push({ id, library: library(id), signfix: FIXED.has(id) ? 1 : 0, frames: result.frames, hand_frames: m.handFrames, dir: round(mean(m.dir)), palm: round(mean(m.palm)),
      curl: round(mean(m.curl)), upper: round(mean(m.upper)), fore: round(mean(m.fore)),
      bend_agree: m.fingers ? round(100 * m.bendAgree / m.fingers) : null, match: m.handFrames ? round(100 * m.matched / m.handFrames) : null });
    if ((n + 1) % 50 === 0) console.log(`${n + 1}/${ids.length}`);
  }
  await browser.close();
  const active = rows.filter(r => r.library === 'active'), staged = rows.filter(r => r.library === 'staging');
  const perMotion = active.filter(r => r.match != null).map(r => r.match);
  const stagedMatch = staged.filter(r => r.match != null).map(r => r.match);
  const summary = {
    generated: new Date().toISOString(), motions: active.length, hand_frames: all.handFrames,
    what: 'Avatar vs MediaPipe landmarks extracted from the source videos (after handfix.js cleanup). Not sign correctness.',
    limits_deg: LIMITS,
    match_rate_pct: round(100 * all.matched / all.handFrames),
    motion_match_median_pct: round(median(perMotion)),
    motions_at_least_80_pct: perMotion.filter(v => v >= 80).length,
    finger_bend_agreement_pct: round(100 * all.bendAgree / all.fingers),
    median_deg: { hand_direction: round(median(all.dir)), palm_direction: round(median(all.palm)), finger_curl_diff: round(median(all.curl)), upper_arm: round(median(all.upper)), forearm: round(median(all.fore)) },
    mean_deg: { hand_direction: round(mean(all.dir)), palm_direction: round(mean(all.palm)), finger_curl_diff: round(mean(all.curl)), upper_arm: round(mean(all.upper)), forearm: round(mean(all.fore)) },
    staging: { motions: staged.length, motion_match_mean_pct: round(mean(stagedMatch)), motion_match_median_pct: round(median(stagedMatch)), motions_at_least_80_pct: stagedMatch.filter(v => v >= 80).length },
    motion_match_mean_pct: round(mean(perMotion)),
    signfix_motions: active.filter(r => r.signfix).map(r => ({ id: r.id, match: r.match })),
    worst: [...active].filter(r => r.match != null && !r.signfix).sort((a, b) => a.match - b.match).slice(0, 25).map(r => ({ id: r.id, match: r.match })),
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  const header = Object.keys(rows[0] || { id: 0 });
  fs.writeFileSync(path.join(OUT, 'motions.csv'), [header.join(','), ...rows.map(r => header.map(k => r[k] ?? '').join(','))].join('\n'));
  console.log(JSON.stringify(summary, null, 1));
})();
