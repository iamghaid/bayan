// هل اليد المكشوفة "مقلوبة" (يمنى بدل يسرى في العمق)؟ الأصابع لا تنثني للخلف أكثر من ~10°،
// فإن انثنت كلها للخلف بوضوح فالعمق (z) مقلوب في كشف MediaPipe.
// node tools/hf_chiral.js [عدد الإشارات] [after]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HF = require(path.join(ROOT, 'handfix.js'));
const need = JSON.parse(fs.readFileSync(path.join(ROOT, 'sshi_motion', 'needed.json'), 'utf8'));
const N = +process.argv[2] || 80, MODE = process.argv[3] || 'raw', AFTER = MODE !== 'raw';
function decode(raw) {
  const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
  return { fps: raw.fps, asp: raw.asp, frames: raw.fr.map(f => ({ w: pts(f[0], 9), p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
    l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null })) };
}
const hist = {}, runs = [], perSign = [];
let total = 0, neg25 = 0, neg40 = 0, pos25 = 0, mcpNeg = 0, badFingers = 0, fingers = 0;
for (const item of need.slice(0, N)) {
  const p = path.join(ROOT, 'sshi_motion', 'm', item.id + '.json');
  if (!fs.existsSync(p)) continue;
  const d = decode(JSON.parse(fs.readFileSync(p, 'utf8')));
  let seq;
  if (AFTER) { HF.process(d, MODE === 'after0' ? { chiral: false, fingerDepth: false } : MODE === 'after1' ? { fingerDepth: false } : {}); seq = d.frames.map(f => f.hands); }
  else seq = HF.assign(d.frames).A;
  let negFrames = 0;
  for (const s of ['Left', 'Right']) {
    let run = 0;
    seq.forEach((a, i) => {
      const h = a[s];
      if (!h) { if (run) runs.push(run); run = 0; return; }
      const c = HF.curl(h, d.asp, s);
      total++; const b = Math.max(-180, Math.min(180, Math.round(c / 20) * 20)); hist[b] = (hist[b] || 0) + 1;
      if (c < -25) { neg25++; negFrames++; run++; } else { if (run) runs.push(run); run = 0; }
      if (c < -40) neg40++;
      if (c > 25) pos25++;
      if (HF.curl(h, d.asp, s, true) < -50) mcpNeg++;
      for (const f of [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) { const [m, pd] = HF.fingerFlex(h, d.asp, s, f); fingers++; if (pd < -40 || m < -60) badFingers++; }
    });
    if (run) runs.push(run);
  }
  if (negFrames) perSign.push([item.ar, negFrames, d.frames.length]);
}
const rh = {}; runs.forEach(r => { const k = r >= 6 ? '6+' : r; rh[k] = (rh[k] || 0) + 1; });
perSign.sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify({ mode: MODE, total, 'curl<-25': neg25, 'curl<-40': neg40, 'curl>25': pos25, 'mcp<-50': mcpNeg, 'backward fingers': badFingers + '/' + fingers,
  hist: Object.keys(hist).map(Number).sort((a, b) => a - b).map(k => k + ':' + hist[k]).join(' '), runs: rh, worst: perSign.slice(0, 15) }, null, 1));
