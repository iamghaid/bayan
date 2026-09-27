// تثبيت حركة الأصابع حتى تكون متسقة من إطار لإطار:
// 1) إسناد كل يد لذراعها باستمرارية الحركة (لا تبديل بين اليدين، ولا يد مكررة)
// 2) حذف الإطارات الشاذة (قفزة مفاجئة في شكل اليد لإطار واحد ثم رجوع)
// 3) ملء الفجوات بالاستيفاء بين الشكل السابق واللاحق (بدل أن ترتخي اليد فجأة ثم تعود)
// 4) تنعيم شكل اليد واتجاهها بمرشّح One-Euro ذهابًا وإيابًا (بلا تأخير):
//    ثابت حين تثبت اليد على شكل، وسريع الاستجابة حين تتغير
// يعمل في المتصفح (window.HandFix) وفي Node (للاختبار)
(function (G) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const unit4 = a => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return a.map(v => v / l); };

  // إطار راحة اليد: y على طول الكف، x عرضه، z عمودي عليه
  function basis(P) {
    const w = P[0];
    const y = unit(add(add(sub(P[5], w), sub(P[9], w)), add(sub(P[13], w), sub(P[17], w))));
    let x = sub(P[5], P[17]); x = unit(sub(x, mul(y, dot(x, y))));
    return { w, L: Math.max(1e-3, len(sub(P[9], w))), x, y, z: cross(x, y) };
  }
  // مصفوفة دوران (أعمدتها x,y,z) ↔ رباعي [x,y,z,w]
  function m2q(x, y, z) {
    const m00 = x[0], m10 = x[1], m20 = x[2], m01 = y[0], m11 = y[1], m21 = y[2], m02 = z[0], m12 = z[1], m22 = z[2];
    const tr = m00 + m11 + m22;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s]; }
    if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2; return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  function q2m(q) {
    const [x, y, z, w] = q;
    return { x: [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
             y: [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
             z: [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)] };
  }
  function slerp(a, b, t) {
    let d = dot4(a, b), bb = b;
    if (d < 0) { d = -d; bb = b.map(v => -v); }
    if (d > 0.9995) return unit4(a.map((v, k) => v + (bb[k] - v) * t));
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, k) => v * wa + bb[k] * wb);
  }

  // مرشّح One-Euro لمتجه كامل (كل النقاط بنفس درجة التنعيم فيبقى شكل اليد متماسكًا)، ذهابًا وإيابًا لإلغاء التأخير
  function oneEuro(series, fps, minCut, beta, dCut) {
    const n = series.length; if (n < 3) return series.map(v => v.slice());
    const te = 1 / fps, alpha = c => 1 / (1 + 1 / (2 * Math.PI * c * te));
    const pass = arr => {
      const out = [arr[0].slice()]; let dx = 0;
      for (let i = 1; i < arr.length; i++) {
        const prev = out[i - 1], x = arr[i];
        let sp = 0; for (let k = 0; k < x.length; k++) sp += (x[k] - prev[k]) ** 2;
        sp = Math.sqrt(sp / x.length) * fps;
        dx += alpha(dCut) * (sp - dx);
        const a = alpha(minCut + beta * dx);
        out.push(x.map((v, k) => prev[k] + a * (v - prev[k])));
      }
      return out;
    };
    const f = pass(series), b = pass(series.slice().reverse()).reverse();
    return f.map((v, i) => v.map((x, k) => (x + b[i][k]) / 2));
  }

  // إسناد اليدين للذراعين: الأقرب لرسغ الجسم + استمرارية مع الإطار السابق، وحذف اليد المكررة
  function assign(F) {
    const prev = { Left: null, Right: null };
    const d2 = (h, p) => Math.hypot(h[0][0] - p[0], h[0][1] - p[1]);
    let dups = 0;
    const A = F.map(f => {
      let hs = [f.l, f.r].filter(Boolean);
      // كشفان في نفس النقطة تقريبًا = نفس اليد مكررة (يدان حقيقيتان لا تنطبق رسغاهما هكذا حتى عند التلامس):
      // نبقي واحدًا، واليد المخفية خلفها تُملأ من إطاراتها قبل وبعد
      if (hs.length === 2 && d2(hs[0], hs[1][0]) < 0.025) { hs = [hs[0]]; dups++; }
      // الحَكَم الأول: قرب اليد من رسغ ذراعها في الجسم؛ الاستمرارية مع الإطار السابق تحسم فقط عند التقارب
      const bw = (h, s) => d2(h, f.p[s === 'Left' ? 0 : 1]);
      const pv = (h, s) => prev[s] ? d2(h, prev[s][0]) : 1;
      const o = {};
      if (hs.length === 2) {
        const a = bw(hs[0], 'Left') + bw(hs[1], 'Right'), b = bw(hs[0], 'Right') + bw(hs[1], 'Left');
        let straight = a <= b;
        if (Math.abs(a - b) < 0.05) straight = pv(hs[0], 'Left') + pv(hs[1], 'Right') <= pv(hs[0], 'Right') + pv(hs[1], 'Left');
        if (straight) { o.Left = hs[0]; o.Right = hs[1]; } else { o.Left = hs[1]; o.Right = hs[0]; }
      } else if (hs.length === 1) {
        const h = hs[0], cl = bw(h, 'Left'), cr = bw(h, 'Right');
        let side = cl <= cr ? 'Left' : 'Right';
        if (Math.abs(cl - cr) < 0.05) side = pv(h, 'Left') <= pv(h, 'Right') ? 'Left' : 'Right';
        o[side] = h;
      }
      for (const s in o) prev[s] = o[s];
      return o;
    });
    return { A, dups };
  }

  // انثناء الأصابع الأربعة (متوسط مجموع المفصلين الأوسط والطرفي لكل إصبع، بالدرجات):
  // موجب = نحو راحة اليد. في اليمنى الراحة باتجاه z المحلي، وفي اليسرى عكسه (صورة مرآة)
  // mcp=true: انثناء قاعدة الأصابع (بين عظم الكف والسلامية الأولى) بدل المفصلين الأوسط والطرفي
  function curl(h, asp, side, mcp) {
    const P = h.map(q => [q[0] * asp, -q[1], -q[2] * asp]), B = basis(P);
    const loc = k => { const v = sub(P[k], B.w); return [dot(v, B.x), dot(v, B.y), dot(v, B.z)]; };
    const ang = (u, v) => Math.atan2(cross(u, v)[0], dot(u, v));   // دوران حول محور عرض الكف: من y نحو z موجب
    let s = 0;
    for (const f of [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      const Q = f.map(loc);
      if (mcp) s += ang(Q[0], sub(Q[1], Q[0]));
      else for (let j = 0; j < 2; j++) s += ang(sub(Q[j + 1], Q[j]), sub(Q[j + 2], Q[j + 1]));
    }
    return (side === 'Left' ? -1 : 1) * s / 4 * 180 / Math.PI;
  }

  // انثناء إصبع واحد بإشارة (موجب نحو الراحة): [القاعدة، الأوسط+الطرفي] بالدرجات
  function fingerFlex(h, asp, side, f) {
    const P = h.map(q => [q[0] * asp, -q[1], -q[2] * asp]), B = basis(P);
    const loc = k => { const v = sub(P[k], B.w); return [dot(v, B.x), dot(v, B.y), dot(v, B.z)]; };
    const ang = (u, v) => Math.atan2(cross(u, v)[0], dot(u, v)) * 180 / Math.PI;
    const Q = f.map(loc), sg = side === 'Left' ? -1 : 1;
    return [sg * ang(Q[0], sub(Q[1], Q[0])), sg * (ang(sub(Q[1], Q[0]), sub(Q[2], Q[1])) + ang(sub(Q[2], Q[1]), sub(Q[3], Q[2])))];
  }
  // إصبع واحد مقلوب العمق (ينثني للخلف والكف سليم): نعكس عمق نقاطه حول قاعدته إن صار ينثني نحو الراحة.
  // العكس لا يغيّر موضعه في الصورة، فقط يختار التفسير الممكن تشريحيًا
  function fixFingerDepth(h, asp, side) {
    let n = 0;
    for (const f of [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) {
      const [m0, p0] = fingerFlex(h, asp, side, f);
      if (!(p0 < -40 || m0 < -60)) continue;
      const z0 = h[f[0]][2];
      const h2 = h.map((q, k) => (k === f[1] || k === f[2] || k === f[3]) ? [q[0], q[1], 2 * z0 - q[2]] : q);
      const [m1, p1] = fingerFlex(h2, asp, side, f);
      if (m1 + p1 > m0 + p0 + 30 && p1 > -20 && m1 > -45) { h = h2; n++; }
    }
    return [h, n];
  }

  const FINGER_PTS = [[2, 3, 4], [6, 7, 8], [10, 11, 12], [14, 15, 16], [18, 19, 20]];
  // القيم المختارة بعد القياس على 80 إشارة: وسيط 5 إطارات + تنعيم أقوى عند تلامس اليدين
  // chiral: تصحيح العمق المقلوب (الأصابع "تنثني للخلف" وهذا مستحيل تشريحيًا ← نعكس z حول الرسغ)
  const DEFAULTS = { minCut: 1.2, beta: 0.6, qCut: 1.5, fingerOut: 0.28, median: 5, contact: true, contactDist: 0.1, chiral: true, chiralT: 30, chiralMcp: 50, fingerDepth: true };
  function process(d, o) {
    const opt = Object.assign({}, DEFAULTS, o || {});
    const asp = d.asp || 16 / 9, fps = d.fps || 12.5, F = d.frames, n = F.length;
    const toP = h => h.map(q => [q[0] * asp, -q[1], -q[2] * asp]);
    const fromP = P => P.map(q => [q[0] / asp, -q[1], -q[2] / asp]);
    const { A, dups } = assign(F);
    const stats = { dups, outliers: 0, filled: 0, fingerFix: 0, chiral: 0, fingerDepth: 0 };
    // الصورة المسطحة لا تحدد العمق: لليد نفسها تفسيران متطابقان في الصورة (أحدهما معكوس العمق).
    // إن اختار MediaPipe التفسير الذي تنثني فيه الأصابع للخلف فالصحيح هو الآخر: نعكس العمق حول الرسغ
    A.forEach(a => { for (const s of ['Left', 'Right']) {
      const h = a[s]; if (!h) continue;
      // الأوسط والطرفي لا ينثنيان للخلف إلا قليلًا (~10°)، والقاعدة حتى ~40° فقط
      if (opt.chiral && (curl(h, asp, s) < -opt.chiralT || curl(h, asp, s, true) < -opt.chiralMcp)) {
        a[s] = h.map(q => [q[0], q[1], 2 * h[0][2] - q[2]]); stats.chiral++;
      }
      // ثم كل إصبع وحده
      if (opt.fingerDepth) { const [h2, k] = fixFingerDepth(a[s], asp, s); a[s] = h2; stats.fingerDepth += k; }
    } });
    d.seen = { Left: A.some(a => a.Left), Right: A.some(a => a.Right) };
    const out = F.map(() => ({}));
    const dist = (S1, S2) => { let t = 0; for (let k = 0; k < 21; k++) { const e = sub(S1[k], S2[k]); t += dot(e, e); } return Math.sqrt(t / 21); };
    for (const s of ['Left', 'Right']) {
      // شكل اليد في إطار الكف (مستقل عن موضعها واتجاهها وحجمها)
      const loc = A.map(a => {
        if (!a[s]) return null;
        const P = toP(a[s]), B = basis(P);
        return { w: B.w, L: B.L, q: m2q(B.x, B.y, B.z),
                 S: P.map(p => { const v = sub(p, B.w); return [dot(v, B.x) / B.L, dot(v, B.y) / B.L, dot(v, B.z) / B.L]; }) };
      });
      // الإطارات الشاذة: شكل يختلف كثيرًا عن جاريه وهما متشابهان
      for (let i = 1; i < n - 1; i++) {
        const a = loc[i - 1], b = loc[i], c = loc[i + 1];
        if (!a || !b || !c) continue;
        const mid = a.S.map((p, k) => mul(add(p, c.S[k]), 0.5));
        if (dist(b.S, mid) > 0.35 && dist(a.S, c.S) < 0.25) { loc[i] = null; stats.outliers++; }
      }
      // إصبع شاذ في إطار واحد (MediaPipe يخطئ في إصبع واحد بينما الباقي سليم): نعيده لمتوسط جاريه
      for (let i = 1; i < n - 1; i++) {
        const a = loc[i - 1], b = loc[i], c = loc[i + 1];
        if (!a || !b || !c) continue;
        for (const FG of FINGER_PTS) {
          let e = 0, e2 = 0;
          for (const k of FG) {
            const m = mul(add(a.S[k], c.S[k]), 0.5), x = sub(b.S[k], m), y = sub(a.S[k], c.S[k]);
            e += dot(x, x); e2 += dot(y, y);
          }
          e = Math.sqrt(e / FG.length); e2 = Math.sqrt(e2 / FG.length);
          if (e > opt.fingerOut && e2 < opt.fingerOut * 0.7) {
            for (const k of FG) b.S[k] = mul(add(a.S[k], c.S[k]), 0.5);
            stats.fingerFix++;
          }
        }
      }
      const known = []; loc.forEach((x, i) => { if (x) known.push(i); });
      if (!known.length) continue;
      // ملء الفجوات
      for (let i = 0, j = 0; i < n; i++) {
        if (loc[i]) continue;
        while (j < known.length && known[j] < i) j++;
        const pi = j > 0 ? known[j - 1] : undefined, ni = j < known.length ? known[j] : undefined;
        let v;
        if (pi === undefined) v = loc[ni]; else if (ni === undefined) v = loc[pi];
        else {
          const t = (i - pi) / (ni - pi), a = loc[pi], b = loc[ni];
          v = { w: add(a.w, mul(sub(b.w, a.w), t)), L: a.L + (b.L - a.L) * t, q: slerp(a.q, b.q, t),
                S: a.S.map((p, k) => add(p, mul(sub(b.S[k], p), t))) };
        }
        loc[i] = Object.assign({}, v, { filled: true }); stats.filled++;
      }
      for (let i = 1; i < n; i++) if (dot4(loc[i].q, loc[i - 1].q) < 0) loc[i].q = loc[i].q.map(v => -v);
      // مرشح وسيط قصير: يزيل أخطاء الكشف التي تدوم إطارًا أو إطارين دون أن يطمس تغيّر شكل اليد الحقيقي
      let Sraw = loc.map(x => [].concat(...x.S));
      if (opt.median > 1) {
        const h = Math.floor(opt.median / 2), src = Sraw;
        Sraw = src.map((v, i) => v.map((_, k) => {
          const w = []; for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) w.push(src[j][k]);
          w.sort((a, b) => a - b); return w[w.length >> 1];
        }));
      }
      // التنعيم: الشكل، الاتجاه، الموضع
      let Sf = oneEuro(Sraw, fps, opt.minCut, opt.beta, 1.0);
      // حين تتلامس اليدان أو تتداخلان يضعف كشف الأصابع: تنعيم أقوى في تلك الإطارات فقط
      if (opt.contact) {
        const other = s === 'Left' ? 'Right' : 'Left';
        const near = A.map((a, i) => {
          const me = a[s], ot = a[other];
          return !!(me && ot && Math.hypot(me[0][0] - ot[0][0], me[0][1] - ot[0][1]) < opt.contactDist);
        });
        if (near.some(Boolean)) {
          const strong = oneEuro(Sraw, fps, opt.minCut * 0.45, opt.beta * 0.5, 1.0);
          // نوسّع منطقة التلامس إطارًا من كل جهة وننتقل تدريجيًا
          const wgt = near.map((_, i) => Math.max(near[i] ? 1 : 0, near[i - 1] || near[i + 1] ? 0.5 : 0));
          Sf = Sf.map((v, i) => wgt[i] ? v.map((x, k) => x + (strong[i][k] - x) * wgt[i]) : v);
        }
      }
      const qf = oneEuro(loc.map(x => x.q), fps, opt.qCut, 0.5, 1.0);
      const wf = oneEuro(loc.map(x => x.w.concat([x.L])), fps, 2.0, 0.5, 1.0);
      for (let i = 0; i < n; i++) {
        const M = q2m(unit4(qf[i])), w = wf[i].slice(0, 3), L = wf[i][3];
        const P = [];
        for (let k = 0; k < 21; k++) {
          const sx = Sf[i][k * 3], sy = Sf[i][k * 3 + 1], sz = Sf[i][k * 3 + 2];
          P.push(add(w, mul(add(add(mul(M.x, sx), mul(M.y, sy)), mul(M.z, sz)), L)));
        }
        out[i][s] = fromP(P);
      }
    }
    F.forEach((f, i) => { f.hands = out[i]; });
    d.handStats = stats;
    return d;
  }

  const api = { process, assign, basis, oneEuro, curl, fingerFlex, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else G.HandFix = api;
})(typeof window !== 'undefined' ? window : globalThis);
