// أفاتار ثلاثي الأبعاد (VRM) يؤدي إشارات مكتبة لغة الإشارة السعودية (SSHI)
// الحركة مستخرجة مسبقًا بـ MediaPipe (tools/sshi_extract.py) ومحفوظة في motion_sshi/<id>.json
// التشغيل متواصل: الإشارات في الجملة الواحدة تنتقل من واحدة للتالية مباشرة بدون رجوع لوضع الراحة
const Signer = (() => {
  let renderer, scene, camera, vrm = null, clock = new THREE.Clock();
  const cache = {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const FING = { Index: [5, 6, 7, 8], Middle: [9, 10, 11, 12], Ring: [13, 14, 15, 16], Little: [17, 18, 19, 20], Thumb: [1, 2, 3, 4] };
  const SEG = ['Proximal', 'Intermediate', 'Distal'];
  const FINGERS = Object.keys(FING).flatMap(f => SEG.map(s => f + s));
  const REST = { RightUpperArm: [0, 0, -1.2], LeftUpperArm: [0, 0, 1.2], RightLowerArm: [0, 0, -0.1], LeftLowerArm: [0, 0, 0.1] };
  const REST_W = {};
  // ترتيب نقاط الجسم في الملف: 0 أنف، 7 و8 أذنان، 11..16
  const WI = { 0: 0, 7: 1, 8: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 7, 16: 8 };

  // هيكل MakeHuman (game_engine) ← أسماء العظام المستخدمة هنا
  const GE = { Neck: 'neck_01', Head: 'head', Hips: 'pelvis', LeftFoot: 'foot_l', Chest: 'spine_03' };
  for (const [s, x] of [['Left', 'l'], ['Right', 'r']]) {
    Object.assign(GE, { [s + 'UpperArm']: 'upperarm_' + x, [s + 'LowerArm']: 'lowerarm_' + x, [s + 'Hand']: 'hand_' + x });
    for (const [f, g] of [['Index', 'index'], ['Middle', 'middle'], ['Ring', 'ring'], ['Little', 'pinky'], ['Thumb', 'thumb']])
      ['Proximal', 'Intermediate', 'Distal'].forEach((sg, k) => GE[s + f + sg] = `${g}_0${k + 1}_${x}`);
  }
  let boneMap = null;   // للنماذج العادية (GLB): اسم ← عظمة
  const bone = n => vrm && (boneMap ? boneMap[GE[n]] : vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[n]));
  const wpos = b => b.getWorldPosition(new THREE.Vector3());
  const parentWorld = n => bone(n).parent.getWorldQuaternion(new THREE.Quaternion());

  function init(canvas, modelUrl) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(33, 1, 0.1, 20);
    camera.position.set(0, 1.5, 2.25); camera.lookAt(0, 1.45, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;               // ألوان صحيحة للنسيج (بدونها تبدو البشرة برتقالية داكنة)
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9c968c, 0.45));   // إضاءة محيطة طبيعية
    const key = new THREE.DirectionalLight(0xfff4e8, 1.5); key.position.set(0.6, 1.4, 2.0); scene.add(key);     // رئيسية دافئة من الأمام
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.3); fill.position.set(-1.2, 0.8, 1.2); scene.add(fill);  // تعبئة من الجانب
    const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(0, 1.6, -2); scene.add(rim);        // حافة خلفية تفصل الجسم عن الخلفية
    const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    new ResizeObserver(resize).observe(canvas); resize();
    requestAnimationFrame(loop);
    modelUrl = modelUrl || 'avatar/man.glb';
    if (!/\.vrm$/i.test(modelUrl)) return new Promise((ok, fail) => new THREE.GLTFLoader().load(modelUrl, gltf => {
      boneMap = {}; gltf.scene.traverse(o => { if (o.isBone) boneMap[o.name] = o; o.frustumCulled = false; });
      vrm = { scene: gltf.scene, update() {}, blendShapeProxy: null };
      scene.add(gltf.scene);
      ['hand_l', 'hand_r'].forEach(n => boneMap[n] && boneMap[n].scale.setScalar(0.9));   // اليد أصغر قليلًا
      calibrate();
      if (typeof dressMan === 'function') dressMan(gltf.scene, bone);
      toRest(1); ok(vrm);
    }, undefined, fail));
    return new Promise((ok, fail) => new THREE.GLTFLoader().load(modelUrl, gltf => {
      THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
      THREE.VRM.from(gltf).then(v => {
        vrm = v; v.scene.rotation.y = Math.PI; scene.add(v.scene); calibrate();
        if (typeof dressSaudi === 'function') dressSaudi(v, bone);
        toRest(1); ok(v);
      });
    }, undefined, fail));
  }

  function calibrate() {
    if (!boneMap) Object.values(THREE.VRMSchema.HumanoidBoneName).forEach(n => { const b = vrm.humanoid.getBoneNode(n); if (b) b.quaternion.identity(); });
    else { BIND = {}; for (const k in GE) { const b = bone(k); if (b) BIND[k] = b.quaternion.clone(); } }
    vrm.scene.updateMatrixWorld(true);
    const rec = (name, childName) => {
      const b = bone(name); if (!b) return;
      const c = childName ? bone(childName) : b.children[0]; if (!c) return;
      REST_W[name] = { q: b.getWorldQuaternion(new THREE.Quaternion()), dir: wpos(c).sub(wpos(b)).normalize(),
                       pq: b.parent.getWorldQuaternion(new THREE.Quaternion()) };
    };
    for (const s of ['Left', 'Right']) {
      rec(s + 'UpperArm', s + 'LowerArm'); rec(s + 'LowerArm', s + 'Hand');
      const h = bone(s + 'Hand');
      if (h) {
        const mid = bone(s + 'MiddleProximal'), ix = bone(s + 'IndexProximal'), lt = bone(s + 'LittleProximal');
        REST_W[s + 'Hand'] = { q: h.getWorldQuaternion(new THREE.Quaternion()), dir: wpos(mid).sub(wpos(h)).normalize(), across: wpos(lt).sub(wpos(ix)).normalize() };
      }
      for (const f in FING) SEG.forEach((sg, k) => rec(s + f + sg, k < 2 ? s + f + SEG[k + 1] : null));
    }
  }

  let BIND = null;   // الدوران الأصلي لكل عظمة في النموذج العادي (يقابل «الصفر» في VRM)
  function rot(name, e, amt) {
    const b = bone(name); if (!b) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    if (BIND && BIND[name]) {
      if (/UpperArm|LowerArm/.test(name) && REST[name] === e) return restArm(name, amt);
      q.premultiply(BIND[name]);
    }
    b.quaternion.slerp(q, amt);
  }
  function restArm(name, amt) {
    const s = name.startsWith('Left') ? 1 : -1;
    const dir = /Upper/.test(name) ? V(0.18 * s, -1, 0.02) : V(0.08 * s, -1, 0.12);
    const parentW = /Upper/.test(name) ? parentWorld(name) : bone(name).parent.getWorldQuaternion(new THREE.Quaternion());
    set(name, aim(name, dir, parentW), amt);
  }
  function toRest(amt) {
    ['Neck', 'Head', 'RightHand', 'LeftHand', ...FINGERS.map(f => 'Right' + f), ...FINGERS.map(f => 'Left' + f)].forEach(n => rot(n, [0, 0, 0], amt));
    Object.entries(REST).forEach(([n, e]) => rot(n, e, amt));
    mouth(0, amt);
  }
  function mouth(v, amt) {
    if (!vrm || !vrm.blendShapeProxy) return;
    const B = vrm.blendShapeProxy, A = THREE.VRMSchema.BlendShapePresetName.A;
    B.setValue(A, B.getValue(A) + (v - B.getValue(A)) * amt);
  }

  function aim(name, dirT, parentW) {
    const r = REST_W[name]; if (!r || !dirT || dirT.lengthSq() < 1e-8) return null;
    const world = new THREE.Quaternion().setFromUnitVectors(r.dir, dirT.clone().normalize()).multiply(r.q);
    return { world, local: parentW.clone().invert().multiply(world) };
  }
  function basis(p, a) {
    p = p.clone().normalize(); a = a.clone().sub(p.clone().multiplyScalar(a.dot(p))).normalize();
    return new THREE.Matrix4().makeBasis(p, a, new THREE.Vector3().crossVectors(p, a));
  }
  function aimHand(name, p, a, parentW) {
    const r = REST_W[name]; if (!r) return null;
    const m = basis(p, a).multiply(basis(r.dir, r.across).transpose());
    const world = new THREE.Quaternion().setFromRotationMatrix(m).multiply(r.q);
    return { world, local: parentW.clone().invert().multiply(world) };
  }
  const set = (name, res, amt) => { if (res) bone(name).quaternion.slerp(res.local, amt); };

  // فك الصيغة المضغوطة: [w(27), p(4), l(63)|0, r(63)|0, mouth] أعداد ×1000
  function decode(d) {
    const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
    d.frames = d.fr.map(f => ({ w: pts(f[0], 9), p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
      l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null, m: f[4] / 1000 }));
    delete d.fr;
    // اليدان: إسناد بالاستمرارية، حذف الشاذ، ملء الفجوات، وتنعيم شكل اليد (handfix.js) — حركة أصابع متسقة
    HandFix.process(d);
    return d;
  }

  // ---------- قيود وضوح اليدين ----------
  // اليد أمام الجسم دائمًا (لا خلفه)، ولا تلتصق بالوجه، ويبقى المرفق أمام الكتف أو بمحاذاته
  function keepInFront(S, E, R, nose) {
    E = E.clone(); R = R.clone();
    if (E.z < S.z - 0.03) E.z = S.z - 0.03;
    const minFwd = R.y > S.y - 0.35 ? 0.14 : 0.06;          // عند رفع اليد للإشارة: 14 سم أمام الكتف على الأقل
    if (R.z < S.z + minFwd) R.z = S.z + minFwd;
    const toFace = R.clone().sub(nose), dist = toFace.length();
    if (dist < 0.13) R.z += 0.13 - dist;                     // مسافة أمان عن الوجه
    return [E, R];
  }
  // الإصبع ينثني نحو راحة اليد فقط، دون التواء جانبي، وبحدود مفصل الإنسان
  // palmSide: عمودي على الكف باتجاه الراحة (نحوه تنثني الأصابع). st: حالة الإصبع بين مفاصله
  const FLEX = { 0: 1.6, 1: 1.9, 2: 1.4 };                    // أقصى انثناء (راديان): قاعدة الإصبع، الأوسط، الطرفي
  const HYPER = { 0: 0.35, 1: 0.06, 2: 0.1 };                 // أقصى انثناء للخلف (فرط البسط) المسموح
  function fingerDir(dir, parentW, name, k, fg, palmSide, st, nxt) {
    const r = REST_W[name]; if (!r || dir.lengthSq() < 1e-10) return dir;
    // اتجاه الإصبع المستقيم الآن = اتجاهه في وضع الراحة مُدارًا بقدر ما دار أبوه
    const base = r.dir.clone().applyQuaternion(parentW.clone().multiply(r.pq.clone().invert())).normalize();
    let d = dir.clone().normalize();
    if (fg === 'Thumb') {                                      // الإبهام حر الحركة ضمن حد معقول
      const ang = base.angleTo(d);
      if (ang > 1.2) { const ax = new THREE.Vector3().crossVectors(base, d).normalize(); d = base.clone().applyAxisAngle(ax, 1.2); }
      return d;
    }
    // محور الانثناء ثابت للإصبع كله: يُحسب عند القاعدة من عمودي الكف، ويُستعمل نفسه للمفصلين التاليين.
    // (لو حسبناه من عمودي الكف عند كل مفصل لانقلب اتجاهه حين تنثني القاعدة 90° فيستقيم الإصبع بدل أن ينطوي)
    let ps, axis;
    if (k === 0 || !st.axis) {
      ps = palmSide.clone().addScaledVector(base, -palmSide.dot(base));   // عمودي على الإصبع باتجاه الراحة
      if (ps.lengthSq() < 1e-8) return d;
      ps.normalize();
      axis = new THREE.Vector3().crossVectors(base, ps).normalize();       // الدوران حوله بزاوية موجبة = انثناء نحو الراحة
      st.axis = axis;
    } else {
      ps = new THREE.Vector3().crossVectors(st.axis, base);
      if (ps.lengthSq() < 1e-8) return d;
      ps.normalize();
      axis = new THREE.Vector3().crossVectors(base, ps).normalize();
    }
    if (k === 0) {                                             // قاعدة الإصبع: انثناء + تباعد جانبي محدود (±20°)
      let f = Math.atan2(d.dot(ps), d.dot(base));
      // المفصل الأوسط لا ينثني فوق ~110°: ما زاد عن ذلك في القياس هو في الحقيقة انثناء القاعدة
      // (خطأ معروف في تقدير العمق للأصابع المطوية) فننقله إليها ويبقى اتجاه طرف الإصبع كما في الفيديو
      if (nxt && nxt.lengthSq() > 1e-10) {
        const n = nxt.clone().normalize(), ps1 = new THREE.Vector3().crossVectors(axis, d).normalize();
        const pipM = Math.atan2(n.dot(ps1), n.dot(d));
        if (pipM > FLEX[1]) f += pipM - FLEX[1];
      }
      f = Math.max(-HYPER[0], Math.min(FLEX[0], f));
      const spread = Math.max(-0.35, Math.min(0.35, Math.asin(Math.max(-1, Math.min(1, d.dot(axis))))));
      return base.clone().applyAxisAngle(axis, f).addScaledVector(axis, Math.tan(spread)).normalize();
    }
    // المفصلان الأوسط والطرفي: انثناء في مستوى واحد فقط (بلا التواء جانبي)
    let flex = Math.atan2(d.dot(ps), d.dot(base));
    if (k === 1) {
      flex = Math.max(-HYPER[1], Math.min(FLEX[1], flex));
      st.pip = flex;
    } else {
      // المفصل الطرفي يتبع الأوسط في اليد الحقيقية (≈ ثلثا انثنائه): نمزج المقيس بالمتوقع فيختفي الاهتزاز
      const coupled = 0.7 * Math.max(0, st.pip || 0);
      flex = 0.4 * flex + 0.6 * coupled;
      flex = Math.max(-HYPER[2], Math.min(FLEX[2], flex));
    }
    return base.clone().applyAxisAngle(axis, flex);
  }

  function applyFrame(f, asp, amt, d) {
    const W = i => { const q = f.w[WI[i]]; return V(q[0], -q[1], -q[2]); };
    const armW = {};
    for (const [s, sh, el, wr, pk] of [['Left', 11, 13, 15, 0], ['Right', 12, 14, 16, 1]]) {
      // ذراع لم تظهر يدها في المقطع، أو رسغها خارج الصورة: MediaPipe يخمّن موضعها فنبقيها في وضع الراحة
      if ((d && !d.seen[s]) || f.p[pk][1] > 0.97) {
        rot(s + 'UpperArm', REST[s + 'UpperArm'], amt * 0.5); rot(s + 'LowerArm', REST[s + 'LowerArm'], amt * 0.5);
        rot(s + 'Hand', [0, 0, 0], amt * 0.5); FINGERS.forEach(n => rot(s + n, [0, 0, 0], amt * 0.5));
        continue;
      }
      const [E, R] = keepInFront(W(sh), W(el), W(wr), W(0));
      const ua = aim(s + 'UpperArm', E.clone().sub(W(sh)), parentWorld(s + 'UpperArm')); if (!ua) continue;
      const la = aim(s + 'LowerArm', R.clone().sub(E), ua.world);
      set(s + 'UpperArm', ua, amt); set(s + 'LowerArm', la, amt);
      armW[s] = la ? la.world : ua.world;
    }
    for (const s in f.hands) {
      if (!armW[s]) continue;
      const h = f.hands[s], H = i => V(h[i][0] * asp, -h[i][1], -h[i][2] * asp);
      const hr = aimHand(s + 'Hand', H(9).sub(H(0)), H(17).sub(H(5)), armW[s] || parentWorld(s + 'Hand'));
      if (!hr) continue;
      set(s + 'Hand', hr, amt);
      // عمودي على الكف باتجاه الراحة: الضرب الاتجاهي يعطي الراحة لليد اليمنى وظهر الكف لليسرى (صورة مرآة)
      const palmN = new THREE.Vector3().crossVectors(H(9).sub(H(0)), H(17).sub(H(5))).normalize();
      if (s === 'Left') palmN.negate();
      for (const fg in FING) {
        const ix = FING[fg], st = {}; let pW = hr.world, prev = null;
        SEG.forEach((sg, k) => {
          const n = s + fg + sg;
          // المفصل الطرفي بلا عظمة بعده في النموذج: ينثني مع الأوسط بنسبة ثلاثة أرباع (كما في اليد الحقيقية)
          const nxt = k === 0 ? H(ix[2]).sub(H(ix[1])) : null;
          const res = REST_W[n] ? aim(n, fingerDir(H(ix[k + 1]).sub(H(ix[k])), pW, n, k, fg, palmN, st, nxt), pW)
            : (prev && { local: (BIND && BIND[n]) ? BIND[n].clone().slerp(prev, 0.75) : prev, world: pW });
          if (!res) return; set(n, res, amt); pW = res.world; prev = res.local;
        });
      }
    }
    // يد بلا بيانات أو ذراع في وضع الراحة: نرخي الأصابع بهدوء
    for (const s of ['Left', 'Right']) if (!f.hands[s] || !armW[s]) FINGERS.forEach(n => rot(s + n, [0, 0, 0], amt * 0.3));
    // الرأس: التفات وإيماء خفيفان فقط من الأنف ومنتصف الأذنين (الميلان الجانبي غير موثوق فنتجاهله)
    const ears = W(7).add(W(8)).multiplyScalar(0.5), fwd = W(0).sub(ears);
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    const yaw = cl(Math.atan2(fwd.x, Math.abs(fwd.z) + 1e-6), 0.5), pitch = cl(Math.atan2(-fwd.y, Math.abs(fwd.z) + 1e-6) - 0.25, 0.35);
    rot('Neck', [pitch * 0.5, yaw * 0.5, 0], amt * 0.5);
    mouth(Math.min(1, Math.max(0, (f.m - 0.02) * 8)), 0.4);
  }

  // ---------- قائمة التشغيل المتواصل ----------
  let queue = [], cur = null, onItem = null, speed = 1, paused = false, pauseAt = 0;
  const BLEND = 0.18;   // ثوانٍ للانتقال من إشارة للتالية
  async function load(id, base) {
    const url = (base || 'sshi_motion/m/') + id + '.json';
    if (!cache[url]) cache[url] = fetch(url).then(r => { if (!r.ok) throw new Error('no motion ' + id); return r.json(); }).then(decode)
      .catch(e => { delete cache[url]; throw e; });   // لا نحفظ الفشل: قد تُستخرج الحركة لاحقًا
    return cache[url];
  }
  // items: [{motion: id, rate?, tag?}] ← يُستدعى onItem(tag) عند بدء كل عنصر
  function playList(items, cb, base) {
    stop(); onItem = cb;
    items.slice(0, 12).forEach(it => { if (it.motion != null) load(it.motion, base).catch(() => {}); });   // تحميل مسبق لأول العناصر
    queue = items.slice(); next(base);
  }
  async function next(base) {
    const it = queue.shift();
    if (!it) { cur = null; onItem && onItem(null); return; }
    if (it.pause) { cur = { pause: it.pause, t: 0, it }; onItem && onItem(it.tag); return; }
    let d; try { d = await load(it.motion, base); } catch (e) { onItem && onItem(it.tag, 'missing'); return next(base); }
    queue.slice(0, 6).forEach(n => { if (n.motion != null) load(n.motion, base).catch(() => {}); });
    cur = { d, t: 0, rate: (it.rate || 1), it, base };
    onItem && onItem(it.tag);
  }
  function stop() { queue = []; cur = null; }
  // إطار وسيط بين إطارين (مواضع النقاط تُمزج خطيًا)
  function mixFrames(a, b, t) {
    const L = (p, q) => p.map((v, k) => [v[0] + (q[k][0] - v[0]) * t, v[1] + (q[k][1] - v[1]) * t, v[2] + (q[k][2] - v[2]) * t]);
    const hands = {};
    for (const s of ['Left', 'Right']) {
      const A = a.hands[s], B = b.hands[s];
      if (A && B) hands[s] = L(A, B); else if (A || B) hands[s] = A || B;
    }
    return { w: L(a.w, b.w), p: [[a.p[0][0] + (b.p[0][0] - a.p[0][0]) * t, a.p[0][1] + (b.p[0][1] - a.p[0][1]) * t],
                                 [a.p[1][0] + (b.p[1][0] - a.p[1][0]) * t, a.p[1][1] + (b.p[1][1] - a.p[1][1]) * t]],
             hands, m: a.m + (b.m - a.m) * t };
  }
  // تنفّس خفيف مستمر حتى لا يبدو الأفاتار متجمدًا
  let breathT = 0;
  function breathe(dt) {
    breathT += dt;
    const c = bone('Chest'); if (!c || !BIND || !BIND.Chest) return;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(breathT * 1.6) * 0.012, 0, 0));
    c.quaternion.copy(BIND.Chest).multiply(q);
  }
  function loop() {
    requestAnimationFrame(loop);
    frame(Math.min(0.1, clock.getDelta()));
  }
  function frame(dt) {
    if (!vrm) return;
    if (cur && !paused) {
      cur.t += dt * speed * (cur.rate || 1);
      if (cur.pause) { toRest(0.06); if (cur.t >= cur.pause) next(cur.base); }
      else {
        const fr = cur.d.frames, x = cur.t * cur.d.fps, i = Math.floor(x);
        // نسبة الاقتراب من الهدف مستقلة عن سرعة الشاشة (60 أو 120 أو 144 إطارًا/ث) فتبقى الحركة بنفس النعومة على كل الأجهزة
        const rate = a => 1 - Math.pow(1 - a, Math.max(0.25, dt * 60));
        if (i < fr.length) applyFrame(i + 1 < fr.length ? mixFrames(fr[i], fr[i + 1], x - i) : fr[i], cur.d.asp, rate(cur.t < BLEND ? 0.3 : 0.55), cur.d);
        else next(cur.base);
      }
    } else if (!cur) toRest(0.06);
    breathe(dt);
    vrm.update(dt);
    renderer.render(scene, camera);
  }
  return {
    init, playList, stop, load,
    set speed(v) { speed = v; }, get speed() { return speed; },
    set paused(v) { paused = !!v; }, get paused() { return paused; },
    get ready() { return !!vrm; }, _bone: bone, _dbg: () => cur && { t: cur.t, id: cur.it && cur.it.motion, n: cur.d && cur.d.frames.length },
    // للاختبار: تقديم الحركة يدويًا إطارًا إطارًا (حين يوقف المتصفح مؤقّت الرسم في نافذة غير ظاهرة)
    _tick: (n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) frame(dt); }
  };
})();
