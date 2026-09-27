// أين تتركز الومضات المتبقية؟ حسب المفصل، وحسب الإشارة، وهل هي في إطارات مكشوفة أم مملوءة
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HF = require(path.join(ROOT, 'handfix.js'));
const need = JSON.parse(fs.readFileSync(path.join(ROOT, 'sshi_motion', 'needed.json'), 'utf8'));
const opt = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};
const NAMES = ['إبهام١', 'إبهام٢', 'إبهام٣', 'سبابة١', 'سبابة٢', 'سبابة٣', 'وسطى١', 'وسطى٢', 'وسطى٣', 'بنصر١', 'بنصر٢', 'بنصر٣', 'خنصر١', 'خنصر٢', 'خنصر٣'];
const JOINTS = [];
for (const f of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) JOINTS.push([0, f[0], f[1]], [f[0], f[1], f[2]], [f[1], f[2], f[3]]);
function decode(raw) {
  const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
  return { fps: raw.fps, asp: raw.asp, frames: raw.fr.map(f => ({ p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
    l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null })) };
}
function angles(h, asp) {
  const P = h.map(q => [q[0] * asp, -q[1], -q[2] * asp]);
  return JOINTS.map(([a, b, c]) => {
    const u = [0, 1, 2].map(k => P[b][k] - P[a][k]), v = [0, 1, 2].map(k => P[c][k] - P[b][k]);
    const cu = Math.hypot(...u) * Math.hypot(...v) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / cu))) * 180 / Math.PI;
  });
}
const byJoint = new Array(15).fill(0), bySign = {}; let inDet = 0, inFill = 0, total = 0;
for (const item of need.slice(0, 80)) {
  const p = path.join(ROOT, 'sshi_motion', 'm', item.id + '.json');
  if (!fs.existsSync(p)) continue;
  const raw = JSON.parse(fs.readFileSync(p, 'utf8')), d = decode(raw);
  const det = d.frames.map(f => HF.assign([f]).A[0]);
  HF.process(d, opt);
  for (const s of ['Left', 'Right']) {
    const A = d.frames.map(f => f.hands[s] ? angles(f.hands[s], d.asp) : null);
    for (let i = 1; i < A.length - 1; i++) {
      if (!A[i - 1] || !A[i] || !A[i + 1]) continue;
      for (let j = 0; j < 15; j++) {
        const d1 = A[i][j] - A[i - 1][j], d2 = A[i + 1][j] - A[i][j];
        if (Math.abs(d1) > 35 && Math.abs(d2) > 35 && Math.sign(d1) !== Math.sign(d2)) {
          byJoint[j]++; total++; bySign[item.ar] = (bySign[item.ar] || 0) + 1;
          if (det[i][s]) inDet++; else inFill++;
        }
      }
    }
  }
}
console.log('total', total, '| in detected frames', inDet, '| in filled frames', inFill);
console.log('by joint', JSON.stringify(Object.fromEntries(NAMES.map((n, j) => [n, byJoint[j]]))));
console.log('top signs', JSON.stringify(Object.entries(bySign).sort((a, b) => b[1] - a[1]).slice(0, 12)));
