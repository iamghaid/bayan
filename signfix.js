// إصلاحات موضعية لإشارات محددة (بعد مقارنتها بالفيديو المرجعي إطارًا إطارًا — tools/case_ref.py).
// كل إصلاح مربوط برقم الإشارة ونطاق إطارات الحركة [from, to]، ويدخل ويخرج تدريجيًا (ramp إطاران) فلا قفزات.
// لا شيء هنا يغيّر إشارة غير مذكورة.
//
// shape:   قفل شكل اليد على نموذج من HANDSHAPES (للإطارات التي أخطأ فيها MediaPipe في الأصابع)
// orient:  اتجاه الكف (palm) والأصابع (fingers) بإحداثيات الجسم: x يسار الأفاتار، y أعلى، z أمامه
// face:    تلامس/اقتراب من نقطة في الوجه أو الصدر: point نقطة من اليد، anchor نقطة الجسم، gap المسافة (0.004 = لمس)،
//          offset إزاحة بالمتر عن النقطة (x يسار الأفاتار، y أعلى، z أمام)
//          surface:true = يُضبط البعد عن السطح فقط وتبقى حركة اليد عليه كما في الفيديو
// hands:   علاقة اليدين: mover تتحرك لتلامس base عند basePoint، أو separate:true لمنع الاختراق فقط
// only:    الإشارة بيد واحدة (كشف اليد الأخرى خطأ من MediaPipe)
(function (G) {
  const HANDSHAPES = {
    // [قاعدة، أوسط، طرفي] بالدرجات لكل إصبع، ووضع الإبهام
    S:     { f: { Index: [85, 100, 60], Middle: [88, 100, 60], Ring: [90, 100, 60], Little: [90, 100, 60] }, thumb: 'across' },
    A:     { f: { Index: [85, 100, 60], Middle: [88, 100, 60], Ring: [90, 100, 60], Little: [90, 100, 60] }, thumb: 'side' },
    B:     { f: { Index: [3, 4, 3], Middle: [3, 4, 3], Ring: [3, 4, 3], Little: [3, 4, 3] }, thumb: 'out' },
    F:     { f: { Index: [48, 72, 42], Middle: [8, 10, 6], Ring: [10, 10, 6], Little: [12, 12, 8] }, thumb: 'pinch' },
    bent2: { f: { Index: [45, 35, 15], Middle: [45, 35, 15], Ring: [88, 100, 60], Little: [90, 100, 60] }, thumb: 'side' },
    hook2: { f: { Index: [15, 80, 45], Middle: [15, 80, 45], Ring: [88, 100, 60], Little: [90, 100, 60] }, thumb: 'out' },
    clasp: { f: { Index: [40, 40, 20], Middle: [40, 40, 20], Ring: [40, 40, 20], Little: [40, 40, 20] }, thumb: 'side' },
  };
  const FIX = {
    12225: [ // عبد
      { hand: 'Right', from: 8, to: 31, shape: 'S' },
      { hand: 'Right', from: 36, to: 62, shape: 'B' },
      { hand: 'Left', from: 30, to: 66, shape: 'S' },
      { hand: 'Right', from: 36, to: 60, hands: { base: 'Left', point: 'palm', basePoint: 'fist_front', gap: 0.004 } },
    ],
    184: [ // أشهد أن لا إله إلا الله: السبابتان عند جانبي العينين
      { hand: 'Right', from: 13, to: 20, face: { point: 'indexTip', anchor: 'eyeR', gap: 0.02 } },
      { hand: 'Left', from: 13, to: 20, face: { point: 'indexTip', anchor: 'eyeL', gap: 0.02 } },
    ],
    841: [ // دين: اليمنى فوق قبضة اليسرى
      { hand: 'Left', from: 2, to: 24, shape: 'S' },
      { hand: 'Right', from: 4, to: 22, shape: 'hook2' },
      { hand: 'Right', from: 5, to: 20, hands: { base: 'Left', point: 'heel', basePoint: 'back', gap: 0.004 } },
    ],
    3844: [ // إيذاء: قبضة يسرى، واليمنى بإصبعين منحنيين تنزل فوقها
      { hand: 'Left', from: 3, to: 29, shape: 'S' },
      { hand: 'Right', from: 4, to: 27, shape: 'bent2' },
      // الضربتان: طرفا الإصبعين يلمسان أعلى القبضة (إطارات 7–10 و17–19 في المرجع)، وبينهما منع التداخل فقط
      { hand: 'Right', from: 7, to: 10, ramp: 3, hands: { base: 'Left', point: 'fingertips', basePoint: 'top', gap: 0.003 } },
      { hand: 'Right', from: 17, to: 19, ramp: 3, hands: { base: 'Left', point: 'fingertips', basePoint: 'top', gap: 0.003 } },
      { hand: 'Right', from: 4, to: 27, hands: { base: 'Left', separate: true } },
    ],
    6212: [ // يظهر: الكف للأعلى تحت الذقن
      { hand: 'Right', from: 11, to: 18, orient: { palm: [0.1, 1, 0.25], fingers: [0.85, 0.15, 0.5] } },
      { hand: 'Right', from: 11, to: 18, face: { point: 'palm', anchor: 'underChin', gap: 0.03 } },
    ],
    9465: [ // همة: الكفان متقابلان والأصابع متشابكة
      { hand: 'Right', from: 2, to: 22, shape: 'clasp', orient: { palm: [1, 0, 0.15], fingers: [0, 0.85, 0.5] } },
      { hand: 'Left', from: 2, to: 22, shape: 'clasp', orient: { palm: [-1, 0, 0.15], fingers: [0, 0.85, 0.5] } },
      { hand: 'Right', from: 2, to: 22, hands: { base: 'Left', point: 'palm', basePoint: 'palm', gap: 0.012, slide: 0.009 } },
    ],
    419: [{ only: 'Right' }], // النبي
    4857: [ // السلام عليكم: كف مسطحة عند الجبين (تحية)، ثم قبضة تنزل أمام الصدر
      { only: 'Right' },
      { hand: 'Right', from: 4, to: 13, shape: 'B' },
      { hand: 'Right', from: 14, to: 32, shape: 'S' },
      // عند الرأس: القبضة قائمة وباطن الأصابع المطوية نحو المشاهد
      { hand: 'Right', from: 14, to: 18, orient: { palm: [0, 0.1, 1], fingers: [0, 1, 0.1] } },
      // أمام الصدر: نفس القبضة، والأصابع المطوية تواجه المشاهد والإبهام فوقها
      { hand: 'Right', from: 20, to: 31, orient: { palm: [0.1, -0.3, 1], fingers: [0.1, 0.9, 0.35] } },
    ],
    11149: [ // رحمة: يمنى فقط، شكل F على الصدر
      { only: 'Right' },
      { hand: 'Right', from: 4, to: 19, shape: 'F' },
      { hand: 'Right', from: 6, to: 17, face: { point: 'palm', anchor: 'chestL', gap: 0.012, surface: true } },
    ],
    9038: [ // فهم: قبضة على الصدغ
      { hand: 'Right', from: 5, to: 18, shape: 'S' },
      { hand: 'Right', from: 8, to: 16, face: { point: 'knuckles', anchor: 'templeR', gap: 0.004 } },
    ],
    855: [ // سهل: الكف على الفم ثم تنزل
      // الأصابع تصل لطرف الأنف والكف على الفم والذقن (كما في المرجع)، ثم تنزل
      { hand: 'Right', from: 7, to: 11, face: { point: 'palm', anchor: 'chin', gap: 0.012, offset: [0, -0.04, 0] } },
      { hand: 'Right', from: 12, to: 15, face: { point: 'palm', anchor: 'chin', gap: 0.012, offset: [0, -0.075, 0.01] } },
    ],
  };
  // مدة الدخول والخروج بالإطارات: تغيير الموضع (تلامس) يحتاج وقتًا أطول من تغيير شكل الأصابع كي لا تقفز اليد
  const rampOf = e => e.ramp || ((e.face || e.hands) ? 5 : 2);
  function weight(x, a, b, R) {
    if (x < a - R || x > b + R) return 0;
    const u = x < a ? (x - (a - R)) / R : x > b ? ((b + R) - x) / R : 1;
    return u * u * u * (u * (u * 6 - 15) + 10);                                // smootherstep: بداية ونهاية ناعمتان
  }
  // ما يسري الآن من إصلاحات لكل يد (مع أوزانها)
  function at(d, x) {
    const list = d && FIX[d.id]; if (!list) return null;
    const out = { Left: [], Right: [] };
    for (const e of list) { if (!e.hand) continue; const w = weight(x, e.from, e.to, rampOf(e)); if (w > 0) out[e.hand].push(Object.assign({ w }, e)); }
    return out;
  }
  // قبل تصحيح اليدين: إن كانت الإشارة بيد واحدة نجعل كل الكشوفات تُسند لها
  function before(d) {
    const list = FIX[d.id]; if (!list) return;
    const only = (list.find(e => e.only) || {}).only; if (!only) return;
    const k = only === 'Right' ? 0 : 1;
    d.frames.forEach(f => { f.p[k] = [9, 9]; });   // رسغ اليد الأخرى "خارج الصورة" ← ذراعها في وضع الراحة
  }
  function after(d) {
    const list = FIX[d.id]; if (!list) return;
    const only = (list.find(e => e.only) || {}).only; if (!only) return;
    const other = only === 'Right' ? 'Left' : 'Right';
    d.frames.forEach(f => { delete f.hands[other]; });
    d.seen[other] = false;
  }
  G.SignFix = { at, before, after, HANDSHAPES, FIX };
})(typeof window !== 'undefined' ? window : globalThis);
