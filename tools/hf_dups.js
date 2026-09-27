// الإطارات التي تكون فيها اليدان في نفس الموضع: هل هي تلامس حقيقي (كُشفت يدان منفصلتان) أم يد واحدة مكررة؟
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const HF = require(path.join(ROOT, 'handfix.js'));
const need = JSON.parse(fs.readFileSync(path.join(ROOT, 'sshi_motion', 'needed.json'), 'utf8'));
function decode(raw) {
  const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
  return { fps: raw.fps, asp: raw.asp, frames: raw.fr.map(f => ({ p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
    l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null })) };
}
const res = {};
for (const item of need.slice(0, 80)) {
  const p = path.join(ROOT, 'sshi_motion', 'm', item.id + '.json');
  if (!fs.existsSync(p)) continue;
  const d = decode(JSON.parse(fs.readFileSync(p, 'utf8')));
  const raw = d.frames.map(f => ({ l: f.l, r: f.r, p: f.p }));
  HF.process(d, { median: 5, contact: true });
  d.frames.forEach((f, i) => {
    const L = f.hands.Left, R = f.hands.Right;
    if (!L || !R || Math.hypot(L[0][0] - R[0][0], L[0][1] - R[0][1]) >= 0.025) return;
    const r = raw[i], two = !!(r.l && r.r), sep = two ? Math.hypot(r.l[0][0] - r.r[0][0], r.l[0][1] - r.r[0][1]) : null;
    // المسافة بين رسغي الجسم (من الوضعية): إن كانا متقاربين فاليدان متلامستان فعلًا
    const bodyW = Math.hypot(r.p[0][0] - r.p[1][0], r.p[0][1] - r.p[1][1]);
    (res[item.ar] = res[item.ar] || []).push({ i, rawHands: (r.l ? 1 : 0) + (r.r ? 1 : 0), rawSep: sep && +sep.toFixed(3), bodyWrists: +bodyW.toFixed(3) });
  });
}
console.log(JSON.stringify(res, null, 0));
