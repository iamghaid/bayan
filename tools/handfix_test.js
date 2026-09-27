// اختبار اتساق الأصابع: الطريقة القديمة مقابل handfix.js على الإشارات الأكثر استخدامًا
// node tools/handfix_test.js [عدد الإشارات]
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HF = require(path.join(ROOT, 'handfix.js'));
const need = JSON.parse(fs.readFileSync(path.join(ROOT, 'sshi_motion', 'needed.json'), 'utf8'));
const N = +process.argv[2] || 80;

function decode(raw) {
  const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
  return { fps: raw.fps, asp: raw.asp, frames: raw.fr.map(f => ({ w: pts(f[0], 9), p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
    l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null })) };
}
// الطريقة القديمة كما كانت في signer.js
function oldHands(d) {
  const H = d.frames.map(f => { const o = {}; for (const hl of [f.l, f.r]) { if (!hl) continue;
    const dd = k => Math.hypot(hl[0][0] - f.p[k][0], hl[0][1] - f.p[k][1]); o[dd(0) < dd(1) ? 'Left' : 'Right'] = hl; } return o; });
  const gap = Math.round(d.fps / 2);
  return d.frames.map((f, i) => { const h = Object.assign({}, H[i]);
    for (const s of ['Left', 'Right']) { if (h[s]) continue;
      for (let k = 1; k <= gap; k++) { const src = (H[i - k] && H[i - k][s]) || (H[i + k] && H[i + k][s]); if (src) { h[s] = src; break; } } }
    return h; });
}
const JOINTS = [];   // [أ، ب، ج] زاوية المفصل ب
for (const f of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
  JOINTS.push([0, f[0], f[1]], [f[0], f[1], f[2]], [f[1], f[2], f[3]]);
}
function angles(h, asp) {
  const P = h.map(q => [q[0] * asp, -q[1], -q[2] * asp]);
  return JOINTS.map(([a, b, c]) => {
    const u = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], v = [P[c][0] - P[b][0], P[c][1] - P[b][1], P[c][2] - P[b][2]];
    const cu = Math.hypot(...u) * Math.hypot(...v) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / cu))) * 180 / Math.PI;
  });
}
function metrics(seq, asp) {   // seq: [{Left, Right}] لكل إطار
  const m = { jitter: 0, jn: 0, spikes: 0, gaps: 0, jumps: 0, dups: 0 };
  for (const s of ['Left', 'Right']) {
    const A = seq.map(h => h[s] ? angles(h[s], asp) : null);
    for (let i = 1; i < A.length - 1; i++) {
      if (!A[i - 1] || !A[i] || !A[i + 1]) continue;
      for (let j = 0; j < A[i].length; j++) {
        const d1 = A[i][j] - A[i - 1][j], d2 = A[i + 1][j] - A[i][j];
        m.jitter += Math.abs(d2 - d1); m.jn++;
        if (Math.abs(d1) > 35 && Math.abs(d2) > 35 && Math.sign(d1) !== Math.sign(d2)) m.spikes++;   // وميض: قفزة ثم رجوع
      }
    }
    // فجوات وسط المقطع: اليد تختفي (ترتخي) ثم تعود
    const pres = seq.map(h => !!h[s]); let seen = false, inGap = false;
    for (const p of pres) { if (p) { if (inGap && seen) m.gaps++; seen = true; inGap = false; } else if (seen) inGap = true; }
    for (let i = 1; i < seq.length; i++) if (seq[i][s] && seq[i - 1][s] && Math.hypot(seq[i][s][0][0] - seq[i - 1][s][0][0], seq[i][s][0][1] - seq[i - 1][s][0][1]) > 0.12) m.jumps++;
  }
  for (const h of seq) if (h.Left && h.Right && Math.hypot(h.Left[0][0] - h.Right[0][0], h.Left[0][1] - h.Right[0][1]) < 0.025) m.dups++;
  return m;
}
// الأمانة: متوسط الفرق بين زوايا المفاصل بعد التنعيم وزواياها في الفيديو (في الإطارات التي كُشفت فيها اليد فعلًا)
function fidelity(raw, fixed, asp) {
  let s = 0, c = 0;
  raw.forEach((h, i) => { for (const side of ['Left', 'Right']) {
    if (!h[side] || !fixed[i][side]) continue;
    const a = angles(h[side], asp), b = angles(fixed[i][side], asp);
    for (let j = 0; j < a.length; j++) { s += Math.abs(a[j] - b[j]); c++; } } });
  return [s, c];
}
const va = process.argv[3];
const variants = va ? JSON.parse(va.endsWith('.json') ? fs.readFileSync(va, 'utf8') : va) : [{}];
const data = [];
for (const item of need.slice(0, N)) {
  const p = path.join(ROOT, 'sshi_motion', 'm', item.id + '.json');
  if (fs.existsSync(p)) data.push(JSON.parse(fs.readFileSync(p, 'utf8')));
}
const zero = () => ({ jitter: 0, jn: 0, spikes: 0, gaps: 0, jumps: 0, dups: 0, dev: 0, dn: 0 });
const r = t => ({ 'اهتزاز (درجة/إطار)': +(t.jitter / Math.max(1, t.jn)).toFixed(2), 'ومضات': t.spikes,
  'فجوات': t.gaps, 'قفزات موضع': t.jumps, 'يد مكررة': t.dups, 'بُعد عن الفيديو (درجة)': t.dn ? +(t.dev / t.dn).toFixed(2) : 0 });
const old = zero(); let frames = 0;
for (const raw of data) { const d = decode(raw); const m = metrics(oldHands(d), d.asp); for (const k in m) old[k] += m[k]; frames += d.frames.length; }
const out = { files: data.length, frames, before: r(old) };
for (const v of variants) {
  const t = zero();
  for (const raw of data) {
    const d = decode(raw), rawH = oldHands(decode(raw)).map((h, i) => { const f = d.frames[i]; return h; });
    // الإطارات المكشوفة فعلًا فقط (بلا ملء) للمقارنة بالأصل
    const det = decode(raw).frames.map(f => { const o = {}; const A = HF.assign([f]).A[0]; return A; });
    HF.process(d, v);
    const m = metrics(d.frames.map(f => f.hands), d.asp); for (const k in m) t[k] += m[k];
    const [s, c] = fidelity(det, d.frames.map(f => f.hands), d.asp); t.dev += s; t.dn += c;
  }
  out[JSON.stringify(v)] = r(t);
}
console.log(JSON.stringify(out, null, 1));
