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
  let reviewSafety = false;
  let safetyCorrections = 0;
  let poseDiagnostics = null;
  let rotationDt = 1 / 60;
  const bone = n => vrm && (boneMap ? boneMap[GE[n]] : vrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[n]));
  const wpos = b => b.getWorldPosition(new THREE.Vector3());
  const parentWorld = n => bone(n).parent.getWorldQuaternion(new THREE.Quaternion());

  function init(canvas, modelUrl) {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(33, 1, 0.1, 20);
    camera.position.set(0, 1.45, 2.7); camera.lookAt(0, 1.3, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;               // ألوان صحيحة للنسيج (بدونها تبدو البشرة برتقالية داكنة)
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    scene.add(new THREE.HemisphereLight(0xf4f7ff, 0x8c9489, 0.62));
    const key = new THREE.DirectionalLight(0xfff5eb, 1.15); key.position.set(1.2, 2.3, 2.0); scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.48); fill.position.set(-1.2, 1.6, 1.8); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(0, 1.6, -2); scene.add(rim);        // حافة خلفية تفصل الجسم عن الخلفية
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      // Reserve 1.6 m horizontally; narrow screens must not crop the signing space.
      camera.position.z = Math.max(2.7, 1.6 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      camera.lookAt(0, 1.3, 0); camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas); resize();
    requestAnimationFrame(loop);
    modelUrl = modelUrl || 'avatar/man.glb';
    if (!/\.vrm$/i.test(modelUrl)) return new Promise((ok, fail) => new THREE.GLTFLoader().load(modelUrl, gltf => {
      boneMap = {}; gltf.scene.traverse(o => { if (o.isBone) boneMap[o.name] = o; o.frustumCulled = false; });
      vrm = { scene: gltf.scene, update() {}, blendShapeProxy: null };
      scene.add(gltf.scene);
      ['hand_l', 'hand_r'].forEach(n => boneMap[n] && boneMap[n].scale.setScalar(0.9));   // اليد أصغر قليلًا
      calibrate();
      buildForearmTwists(gltf.scene);
      if (typeof dressMan === 'function') dressMan(gltf.scene, bone);
      buildAnchors(gltf.scene);
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
      const shoulder = wpos(bone(s + 'UpperArm')), elbow = wpos(bone(s + 'LowerArm'));
      const wrist = wpos(bone(s + 'Hand'));
      const axis = new THREE.Vector3().crossVectors(REST_W[s + 'UpperArm'].dir, V(0, 0, 1)).normalize();
      ARM_RIG[s] = { upper: shoulder.distanceTo(elbow), lower: elbow.distanceTo(wrist), axis };
      delete ELBOW_POLE[s];
      delete ARM_FRAME[s];
      const h = bone(s + 'Hand');
      if (h) {
        const mid = bone(s + 'MiddleProximal'), ix = bone(s + 'IndexProximal'), lt = bone(s + 'LittleProximal');
        REST_W[s + 'Hand'] = { q: h.getWorldQuaternion(new THREE.Quaternion()), dir: wpos(mid).sub(wpos(h)).normalize(), across: wpos(lt).sub(wpos(ix)).normalize() };
      }
      for (const f in FING) SEG.forEach((sg, k) => rec(s + f + sg, k < 2 ? s + f + SEG[k + 1] : null));
    }
  }

  const FOREARM_TWISTS = {};
  // Split a lower-arm influence between neighbouring roll segments. The
  // shader supports four influences; merge duplicates before selecting them.
  function twistWeights(indices, weights, lowerIndex, segments, progress) {
    const influences = new Map();
    const add = (index, weight) => { if (weight > 1e-8) influences.set(index,(influences.get(index)||0)+weight); };
    const t = Math.max(0,Math.min(1,progress)), scaled = t*segments.length;
    const from = Math.min(segments.length-1,Math.floor(scaled)), fraction = scaled-from;
    const chain = [lowerIndex,...segments];
    for (let i=0;i<4;i++) {
      if (indices[i]===lowerIndex) { add(chain[from],weights[i]*(1-fraction));add(chain[from+1],weights[i]*fraction); }
      else add(indices[i],weights[i]);
    }
    const chosen = [...influences].sort((a,b)=>b[1]-a[1]).slice(0,4);
    const total = chosen.reduce((sum,item)=>sum+item[1],0);
    while(chosen.length<4) chosen.push([0,0]);
    return {indices:chosen.map(item=>item[0]),weights:chosen.map(item=>total?item[1]/total:0)};
  }
  function buildForearmTwists(root) {
    for(const side of ['Left','Right']) delete FOREARM_TWISTS[side];
    const meshes=[];root.traverse(object=>{if(object.isSkinnedMesh && object.geometry.attributes.skinIndex)meshes.push(object);});
    for(const side of ['Left','Right']) {
      const lower=bone(side+'LowerArm'), hand=bone(side+'Hand');
      if(!lower||!hand||hand.parent!==lower||!meshes.some(mesh=>mesh.skeleton.bones.includes(lower)))continue;
      const segments=[];
      for(let i=0;i<3;i++) {const segment=new THREE.Bone();segment.name='bayan_forearm_'+side.toLowerCase()+'_'+i;lower.add(segment);segments.push(segment);}
      // All roll pivots lie on the same shaft. Their bind transforms match the
      // lower arm, so inserting them does not move the neutral mesh or wrist.
      lower.remove(hand);segments[2].add(hand);FOREARM_TWISTS[side]=segments;
    }
    root.updateMatrixWorld(true);
    const skeletons=new Map();
    for(const mesh of meshes) {
      const original=mesh.skeleton;
      let entry=skeletons.get(original);
      if(!entry) {
        const bones=original.bones.slice(), inverses=original.boneInverses.map(matrix=>matrix.clone()), sides=[];
        for(const side of ['Left','Right']) {
          const segments=FOREARM_TWISTS[side], lowerIndex=original.bones.indexOf(bone(side+'LowerArm'));
          if(!segments||lowerIndex<0)continue;
          const indices=[];
          for(const segment of segments) {indices.push(bones.length);bones.push(segment);inverses.push(original.boneInverses[lowerIndex].clone());}
          const rest=REST_W[side+'LowerArm'];
          sides.push({lowerIndex,indices,inverse:original.boneInverses[lowerIndex],
            axis:rest.dir.clone().applyQuaternion(rest.q.clone().invert()).normalize(),length:ARM_RIG[side].lower});
        }
        entry={skeleton:new THREE.Skeleton(bones,inverses),sides};skeletons.set(original,entry);
      }
      if(!entry.sides.length)continue;
      const geometry=mesh.geometry.clone(), position=geometry.attributes.position;
      const skinIndex=geometry.attributes.skinIndex, skinWeight=geometry.attributes.skinWeight;
      const indices=new Uint16Array(position.count*4), weights=new Float32Array(position.count*4);
      const vertex=new THREE.Vector3();
      for(let i=0;i<position.count;i++) {
        let blend={indices:[skinIndex.getX(i),skinIndex.getY(i),skinIndex.getZ(i),skinIndex.getW(i)],
          weights:[skinWeight.getX(i),skinWeight.getY(i),skinWeight.getZ(i),skinWeight.getW(i)]};
        for(const side of entry.sides) {
          if(!blend.indices.some((index,k)=>index===side.lowerIndex && blend.weights[k]>0))continue;
          vertex.fromBufferAttribute(position,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(side.inverse);
          let t=Math.max(0,Math.min(1,(vertex.dot(side.axis)/side.length-0.06)/0.88));
          t=t*t*(3-2*t);
          blend=twistWeights(blend.indices,blend.weights,side.lowerIndex,side.indices,t);
        }
        indices.set(blend.indices,i*4);weights.set(blend.weights,i*4);
      }
      geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
      geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
      mesh.geometry=geometry;mesh.bind(entry.skeleton,mesh.bindMatrix.clone());
    }
  }
  const ARM_RIG = {};
  const ELBOW_POLE = {};
  const ARM_FRAME = {};
  const ARM_LIMITS = Object.freeze({ flexMin: 2, flexMax: 145, poleCone: 55,
    poleSpeed: 240, shoulderElevation: 165, pronation: 85, wristFlex: 65, wristDeviation: 25 });
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
    // A collapsed palm basis has no reliable rotation. Keep the last pose.
    if (p.lengthSq() < 1e-10 || a.lengthSq() < 1e-10 || new THREE.Vector3().crossVectors(p, a).lengthSq() < 1e-12) return null;
    const m = basis(p, a).multiply(basis(r.dir, r.across).transpose());
    const world = new THREE.Quaternion().setFromRotationMatrix(m).multiply(r.q);
    return { world, local: parentW.clone().invert().multiply(world) };
  }
  function set(name, res, amt) {
    const b = bone(name); if (!b || !res) return;
    // Parents are smoothed too: convert against their ACTUAL pose, not the
    // unsmoothed target used to calculate res.local. Otherwise wrist rotation
    // inherits the arm's lag and fingers inherit the wrist's lag a second time.
    const local = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(res.world);
    b.quaternion.slerp(local, amt).normalize();
    b.updateMatrixWorld(true);
  }
  function setHand(name, target, previousWorld, amt) {
    const b = bone(name); if (!b || !target) return;
    // Interpolate the wrist in world space so moving the elbow cannot add
    // an extra rotation. Bound a tracking flip instead of snapping 180°.
    const angle = previousWorld.angleTo(target.world);
    const step = THREE.MathUtils.degToRad(540) * rotationDt;
    const fraction = Math.min(amt, angle > 1e-8 ? step / angle : 1);
    const world = previousWorld.clone().slerp(target.world, fraction);
    b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
    b.updateMatrixWorld(true);
  }
  function signedTwist(q, direction) {
    const projection = V(q.x,q.y,q.z).dot(direction);
    let angle = 2*Math.atan2(projection,q.w);
    while (angle > Math.PI) angle -= 2*Math.PI;
    while (angle < -Math.PI) angle += 2*Math.PI;
    return angle;
  }
  function constrainWrist(side) {
    const hand = bone(side + 'Hand'), lower = bone(side + 'LowerArm');
    const rest = REST_W[side + 'LowerArm'];
    if (!hand || !lower || !rest || !BIND || !BIND[side + 'Hand']) return;
    // Pronation belongs to the forearm, not to an axial twist in the wrist.
    // Rolling around the forearm's own longitudinal axis preserves wrist
    // position and the intended world-space palm orientation.
    const axis = rest.dir.clone().applyQuaternion(rest.q.clone().invert()).normalize();
    const desired = hand.getWorldQuaternion(new THREE.Quaternion());
    const delta = hand.quaternion.clone().multiply(BIND[side + 'Hand'].clone().invert()).normalize();
    const clamp = (value, limit) => Math.max(-limit,Math.min(limit,value));
    const radians = THREE.MathUtils.degToRad;
    const requestedRoll = signedTwist(delta,axis);
    const lowerBind = BIND[side+'LowerArm'] || new THREE.Quaternion();
    const segments = FOREARM_TWISTS[side];
    const relative = segments ? segments[2].quaternion.clone() : lowerBind.clone().invert().multiply(lower.quaternion);
    const currentRoll = signedTwist(relative,axis);
    let nextRoll = clamp(currentRoll+requestedRoll,radians(ARM_LIMITS.pronation));
    const frame = ARM_FRAME[side];
    if (frame && Number.isFinite(frame.roll)) {
      const step = radians(360)*rotationDt;
      nextRoll = Math.max(frame.roll-step,Math.min(frame.roll+step,nextRoll));
      nextRoll = clamp(nextRoll,radians(ARM_LIMITS.pronation));
    }
    if(segments) segments.forEach((segment,i)=>segment.quaternion.setFromAxisAngle(axis,nextRoll*(i+1)/segments.length));
    else lower.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axis,nextRoll-currentRoll)).normalize();
    lower.updateMatrixWorld(true);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
    // Remove residual axial wrist twist when the forearm reaches its envelope.
    const local = hand.quaternion.clone().multiply(BIND[side+'Hand'].clone().invert()).normalize();
    const leftover = new THREE.Quaternion().setFromAxisAngle(axis,signedTwist(local,axis));
    const swing = local.multiply(leftover.invert()).normalize();
    if (swing.w < 0) { swing.x *= -1; swing.y *= -1; swing.z *= -1; swing.w *= -1; }
    const angle = 2*Math.acos(Math.max(-1,Math.min(1,swing.w)));
    const sinHalf = Math.sqrt(Math.max(0,1-swing.w*swing.w));
    const rotation = sinHalf > 1e-8 ? V(swing.x,swing.y,swing.z).multiplyScalar(angle/sinHalf) : V(0,0,0);
    const palmRest = REST_W[side+'Hand'];
    let flexAxis = palmRest && palmRest.across ? palmRest.across.clone().applyQuaternion(rest.q.clone().invert()) : V(1,0,0);
    flexAxis.addScaledVector(axis,-flexAxis.dot(axis));
    if (flexAxis.lengthSq() < 1e-8) flexAxis = V(0,1,0).cross(axis);
    flexAxis.normalize();
    const deviationAxis = new THREE.Vector3().crossVectors(axis,flexAxis).normalize();
    let flex = rotation.dot(flexAxis), deviation = rotation.dot(deviationAxis);
    // Coupled envelope: simultaneous maximum flexion and deviation must not
    // form the corner of a rectangular clamp and create an extreme bent palm.
    const demand = Math.hypot(flex/radians(ARM_LIMITS.wristFlex),deviation/radians(ARM_LIMITS.wristDeviation));
    if(demand>1) {flex/=demand;deviation/=demand;}
    const bounded = flexAxis.multiplyScalar(flex).addScaledVector(deviationAxis,deviation);
    const magnitude = bounded.length();
    const bend = magnitude > 1e-8 ? new THREE.Quaternion().setFromAxisAngle(bounded.divideScalar(magnitude),magnitude) : new THREE.Quaternion();
    hand.quaternion.copy(bend.multiply(BIND[side+'Hand'])).normalize();
    hand.updateMatrixWorld(true);
  }

  // فك الصيغة المضغوطة: [w(27), p(4), l(63)|0, r(63)|0, mouth] أعداد ×1000
  function decode(d) {
    const pts = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push([a[i * 3] / 1000, a[i * 3 + 1] / 1000, a[i * 3 + 2] / 1000]); return o; };
    d.frames = d.fr.map(f => ({ w: pts(f[0], 9), p: [[f[1][0] / 1000, f[1][1] / 1000], [f[1][2] / 1000, f[1][3] / 1000]],
      l: f[2] ? pts(f[2], 21) : null, r: f[3] ? pts(f[3], 21) : null, m: f[4] / 1000 }));
    delete d.fr;
    if (window.SignFix) SignFix.before(d);
    // اليدان: إسناد بالاستمرارية، حذف الشاذ، ملء الفجوات، وتنعيم شكل اليد (handfix.js) — حركة أصابع متسقة
    HandFix.process(d);
    if (window.SignFix) SignFix.after(d);
    return d;
  }

  // ---------- قيود وضوح اليدين ----------
  // اليد أمام الجسم دائمًا (لا خلفه)، ولا تلتصق بالوجه، ويبقى المرفق أمام الكتف أو بمحاذاته
  function keepInFront(S, E, R, nose, faceOK) {
    E = E.clone(); R = R.clone();
    if (E.z < S.z - 0.03) E.z = S.z - 0.03;
    const minFwd = R.y > S.y - 0.35 ? 0.14 : 0.06;          // عند رفع اليد للإشارة: 14 سم أمام الكتف على الأقل
    if (R.z < S.z + minFwd) R.z = S.z + minFwd;
    const toFace = R.clone().sub(nose), dist = toFace.length();
    if (dist < 0.13 && !faceOK) R.z += 0.13 - dist;          // مسافة أمان عن الوجه (إلا في إشارة تلمس الوجه: signfix.js)
    return [E, R];
  }
  // الإصبع ينثني نحو راحة اليد فقط، دون التواء جانبي، وبحدود مفصل الإنسان
  // palmSide: عمودي على الكف باتجاه الراحة (نحوه تنثني الأصابع). st: حالة الإصبع بين مفاصله
  const FLEX = { 0: 1.6, 1: 1.9, 2: 1.4 };                    // أقصى انثناء (راديان): قاعدة الإصبع، الأوسط، الطرفي
  const HYPER = { 0: 0.35, 1: 0.06, 2: 0.1 };                 // أقصى انثناء للخلف (فرط البسط) المسموح
  function fingerDir(dir, parentW, name, k, fg, palmSide, st, nxt, ov) {
    const r = REST_W[name]; if (!r || dir.lengthSq() < 1e-10) return dir;
    // اتجاه الإصبع المستقيم الآن = اتجاهه في وضع الراحة مُدارًا بقدر ما دار أبوه
    const base = r.dir.clone().applyQuaternion(parentW.clone().multiply(r.pq.clone().invert())).normalize();
    let d = dir.clone().normalize();
    if (fg === 'Thumb') {                                      // الإبهام حر الحركة ضمن حد معقول
      if (ov && ov.dirs && ov.dirs[k]) d.lerp(ov.dirs[k].clone().normalize(), ov.w).normalize();   // شكل يد مقفول (signfix.js)
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
      let spread = Math.max(-0.35, Math.min(0.35, Math.asin(Math.max(-1, Math.min(1, d.dot(axis))))));
      if (ov && ov.f) { f += (ov.f[0] - f) * ov.w; spread *= 1 - ov.w; }
      f = Math.max(-HYPER[0], Math.min(FLEX[0], f));
      return base.clone().applyAxisAngle(axis, f).addScaledVector(axis, Math.tan(spread)).normalize();
    }
    // المفصلان الأوسط والطرفي: انثناء في مستوى واحد فقط (بلا التواء جانبي)
    let flex = Math.atan2(d.dot(ps), d.dot(base));
    if (k === 1) {
      if (ov && ov.f) flex += (ov.f[1] - flex) * ov.w;
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
    const previousHands = {};
    for (const s of ['Left', 'Right']) previousHands[s] = bone(s + 'Hand').getWorldQuaternion(new THREE.Quaternion());
    // إصلاحات موضعية لهذه الإشارة عند هذا الإطار (signfix.js) — لا شيء لغيرها
    const fx = (window.SignFix && d && d._x != null) ? SignFix.at(d, d._x) : null;
    const fxOf = (s, key) => fx ? fx[s].filter(e => e[key]) : [];
    for (const [s, sh, el, wr, pk] of [['Left', 11, 13, 15, 0], ['Right', 12, 14, 16, 1]]) {
      // ذراع لم تظهر يدها في المقطع، أو رسغها خارج الصورة: MediaPipe يخمّن موضعها فنبقيها في وضع الراحة
      if ((d && !d.seen[s]) || f.p[pk][1] > 0.97) {
        rot(s + 'UpperArm', REST[s + 'UpperArm'], amt * 0.5); rot(s + 'LowerArm', REST[s + 'LowerArm'], amt * 0.5);
        rot(s + 'Hand', [0, 0, 0], amt * 0.5); FINGERS.forEach(n => rot(s + n, [0, 0, 0], amt * 0.5));
        continue;
      }
      const [E, R] = keepInFront(W(sh), W(el), W(wr), W(0), fxOf(s, 'face').length > 0);
      const rig = ARM_RIG[s], upperDir = E.clone().sub(W(sh)), lowerDir = R.clone().sub(E);
      if (!rig || upperDir.lengthSq() < 1e-8 || lowerDir.lengthSq() < 1e-8) continue;
      const shoulder = wpos(bone(s + 'UpperArm'));
      const elbowTarget = shoulder.clone().addScaledVector(upperDir.normalize(), rig.upper);
      const wristTarget = elbowTarget.clone().addScaledVector(lowerDir.normalize(), rig.lower);
      solveArm(s, wristTarget, elbowTarget, amt, true);
      armW[s] = bone(s + 'LowerArm').getWorldQuaternion(new THREE.Quaternion());
    }
    for (const s in f.hands) {
      if (!armW[s]) continue;
      const h = f.hands[s], H0 = i => V(h[i][0] * asp, -h[i][1], -h[i][2] * asp);
      let dirV = H0(9).sub(H0(0)), accV = H0(17).sub(H0(5)), rotM = null;
      // اتجاه كف مقفول (signfix.js): ندير اتجاه اليد نحو الهدف، وندير نقاط الأصابع معه بنفس الدوران
      const or = fxOf(s, 'orient')[0];
      if (or) {
        const sg = s === 'Left' ? -1 : 1;
        const d0 = dirV.clone().normalize(), n0 = new THREE.Vector3().crossVectors(dirV, accV).normalize().multiplyScalar(sg);
        const d1 = d0.clone().lerp(V(...or.orient.fingers).normalize(), or.w).normalize();
        const n1 = n0.clone().lerp(V(...or.orient.palm).normalize(), or.w).normalize();
        const a1 = sg > 0 ? new THREE.Vector3().crossVectors(n1, d1) : new THREE.Vector3().crossVectors(d1, n1);
        rotM = basis(d1, a1).multiply(basis(dirV, accV).transpose());
        dirV = d1; accV = a1;
      }
      const H = rotM ? (i => H0(i).sub(H0(0)).applyMatrix4(rotM)) : H0;
      const hr = aimHand(s + 'Hand', dirV, accV, armW[s] || parentWorld(s + 'Hand'));
      if (!hr) continue;
      setHand(s + 'Hand', hr, previousHands[s], amt);
      const actualHandW = bone(s + 'Hand').getWorldQuaternion(new THREE.Quaternion());
      // عمودي على الكف باتجاه الراحة: الضرب الاتجاهي يعطي الراحة لليد اليمنى وظهر الكف لليسرى (صورة مرآة)
      const palmN = new THREE.Vector3().crossVectors(dirV, accV).normalize();
      if (s === 'Left') palmN.negate();
      // شكل يد مقفول (signfix.js): زوايا المفاصل من النموذج بدل تقدير MediaPipe في الإطارات التي أخطأ فيها
      const sh = fxOf(s, 'shape')[0], shape = sh && SignFix.HANDSHAPES[sh.shape];
      const ovOf = fg => {
        if (!shape) return null;
        if (fg !== 'Thumb') { const a = shape.f[fg]; return a && { f: a.map(x => x * Math.PI / 180), w: sh.w }; }
        if (!shape.thumb) return null;
        const dirs = thumbDirs(shape.thumb, dirV.clone().normalize(), accV.clone().normalize(), palmN);
        if (shape.thumb === 'pinch') {   // F/O: طرف الإبهام يلاقي طرف السبابة فعلًا (نوجّه سلامية الإبهام نحو موضعه)
          const ia = wpos(bone(s + 'IndexIntermediate')), ib = wpos(bone(s + 'IndexDistal'));
          const tip = ib.clone().addScaledVector(ib.clone().sub(ia).normalize(), 0.012);
          dirs[1] = tip.sub(wpos(bone(s + 'ThumbIntermediate')));
        }
        return { dirs, w: sh.w };
      };
      for (const fg in FING) {
        const ix = FING[fg], st = {}, ov = ovOf(fg); let pW = actualHandW.clone(), prev = null;
        SEG.forEach((sg, k) => {
          const n = s + fg + sg;
          // المفصل الطرفي بلا عظمة بعده في النموذج: ينثني مع الأوسط بنسبة ثلاثة أرباع (كما في اليد الحقيقية)
          const nxt = k === 0 ? H(ix[2]).sub(H(ix[1])) : null;
          const res = REST_W[n] ? aim(n, fingerDir(H(ix[k + 1]).sub(H(ix[k])), pW, n, k, fg, palmN, st, nxt, ov), pW)
            : (prev && { local: (BIND && BIND[n]) ? BIND[n].clone().slerp(prev, 0.75) : prev, world: pW });
          if (!res) return; set(n, res, amt);
          pW = bone(n).getWorldQuaternion(new THREE.Quaternion()); prev = bone(n).quaternion.clone();
        });
      }
    }
    // يد بلا بيانات أو ذراع في وضع الراحة: نرخي الأصابع بهدوء
    for (const s of ['Left', 'Right']) if (!f.hands[s] || !armW[s]) FINGERS.forEach(n => rot(s + n, [0, 0, 0], amt * 0.3));
    // The untracked/rest path also inherits arm rotation. Bound it before
    // contact solving, so intentional fingertip/face contacts use this pose.
    for (const s of ['Left', 'Right']) {
      const world = bone(s + 'Hand').getWorldQuaternion(new THREE.Quaternion());
      setHand(s + 'Hand', {world}, previousHands[s], 1);
      constrainWrist(s);
    }
    // الرأس: التفات وإيماء خفيفان فقط من الأنف ومنتصف الأذنين (الميلان الجانبي غير موثوق فنتجاهله)
    const ears = W(7).add(W(8)).multiplyScalar(0.5), fwd = W(0).sub(ears);
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    const yaw = cl(Math.atan2(fwd.x, Math.abs(fwd.z) + 1e-6), 0.5), pitch = cl(Math.atan2(-fwd.y, Math.abs(fwd.z) + 1e-6) - 0.25, 0.35);
    rot('Neck', [pitch * 0.5, yaw * 0.5, 0], amt * 0.5);
    mouth(Math.min(1, Math.max(0, (f.m - 0.02) * 8)), 0.4);
    if (fx) solveContacts(fx);
  }

  // ---------- تلامس اليد مع الوجه/الصدر أو مع اليد الأخرى (للإشارات المذكورة في signfix.js فقط) ----------
  // اتجاهات الإبهام لأشكال اليد المقفولة، بدلالة إطار اليد: dir اتجاه الأصابع، acr من السبابة للخنصر، n نحو الراحة
  function thumbDirs(mode, dir, acr, n) {
    acr = acr.clone().addScaledVector(dir, -acr.dot(dir)).normalize();
    const c = (a, b, g) => dir.clone().multiplyScalar(a).addScaledVector(acr, b).addScaledVector(n, g).normalize();
    if (mode === 'across') return [c(0.45, 0.35, 0.8), c(0.2, 1.0, 0.45)];     // فوق الأصابع المطوية (قبضة S)
    if (mode === 'side') return [c(0.9, -0.25, 0.3), c(1.0, -0.05, 0.1)];       // بجانب السبابة
    if (mode === 'out') return [c(0.35, -1.0, 0.1), c(0.45, -1.0, 0.0)];        // مبعد عن الكف
    if (mode === 'pinch') return [c(0.65, 0.2, 0.75), c(0.55, 0.35, 0.8)];      // يلاقي طرف السبابة (F/O)
    return null;
  }
  let ANCH = {}, HEAD = [];
  // نقاط الوجه والصدر: تُقاس مرة عند التحميل على سطح النموذج (ومع الشماغ فوقه) وتُحفظ نسبةً لعظمة الرأس/الصدر
  function buildAnchors(root) {
    root.updateMatrixWorld(true);
    const head = bone('Head'), chest = bone('Chest'); if (!head || !chest) return;
    const stat = (mesh, y0) => {
      const g = mesh.geometry, P = g.attributes.position, I = g.index, M = mesh.matrixWorld, v = new THREE.Vector3(), out = [];
      const W = []; for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); W.push(v.x, v.y, v.z); }
      const n = I ? I.count : P.count;
      for (let k = 0; k < n; k += 3) { const t = [0, 1, 2].map(j => I ? I.getX(k + j) : k + j);
        if (t.every(q => W[q * 3 + 1] < y0)) continue; t.forEach(q => out.push(W[q * 3], W[q * 3 + 1], W[q * 3 + 2])); }
      const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      const m = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(true); return m;
    };
    const meshes = []; root.traverse(o => { if (o.isMesh && /Human_export|Shemagh|Thobe/.test(o.name)) meshes.push(stat(o, 0.95)); });
    const ray = new THREE.Raycaster();
    const cast = (o, dirIn) => { ray.set(o, dirIn); const h = ray.intersectObjects(meshes)[0]; if (!h) return null;
      const nn = h.face.normal.clone().normalize(); if (nn.dot(dirIn) > 0) nn.negate(); return { p: h.point, n: nn }; };
    const C = wpos(head).add(V(0, 0.07, 0)), D = Math.PI / 180;
    const fromHead = (el, az) => { const d = V(Math.cos(el * D) * Math.sin(az * D), Math.sin(el * D), Math.cos(el * D) * Math.cos(az * D));
      return cast(C.clone().addScaledVector(d, 0.4), d.clone().negate()); };
    const put = (name, b, hit) => { if (!hit) return; b.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
      ANCH[name] = { b, p: b.worldToLocal(hit.p.clone()), n: hit.n.clone().transformDirection(inv) }; };
    // الأفاتار ينظر نحو +z، ويمينه نحو −x
    put('templeR', head, fromHead(14, -72)); put('templeL', head, fromHead(14, 72));
    put('eyeR', head, fromHead(-2, -40)); put('eyeL', head, fromHead(-2, 40));
    put('mouth', head, fromHead(-24, 0)); put('chin', head, fromHead(-38, 0));
    const ch = fromHead(-38, 0);
    if (ch) put('underChin', head, { p: ch.p.clone().add(V(0, -0.02, -0.03)), n: V(0, -1, 0.25).normalize() });
    // عيّنات من سطح الرأس (مع الشماغ) لمنع دخول اليد في الوجه عند التلامس
    HEAD = [];
    for (let el = -65; el <= 85; el += 7.5) for (let az = -180; az < 180; az += 12) {
      const h = fromHead(el, az); if (h) { head.updateMatrixWorld(true); HEAD.push({ p: head.worldToLocal(h.p.clone()), n: h.n.clone().transformDirection(new THREE.Matrix4().copy(head.matrixWorld).invert()) }); }
    }
    const cp = wpos(chest);
    put('chestL', chest, cast(V(0.075, cp.y + 0.14, 0.6), V(0, 0, -1)));
    put('chestR', chest, cast(V(-0.075, cp.y + 0.14, 0.6), V(0, 0, -1)));
  }
  function anchorW(name) {
    const a = ANCH[name]; if (!a) return null;
    return { p: a.b.localToWorld(a.p.clone()), n: a.n.clone().transformDirection(a.b.matrixWorld).normalize() };
  }
  const FN4 = ['Index', 'Middle', 'Ring', 'Little'];
  function handFrame(s) {
    const hp = wpos(bone(s + 'Hand')), mcp = FN4.map(f => wpos(bone(s + f + 'Proximal')));
    const mid = mcp.reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(0.25);
    const dir = mid.clone().sub(hp).normalize();
    const acr = mcp[3].clone().sub(mcp[0]); acr.addScaledVector(dir, -acr.dot(dir)).normalize();
    const n = new THREE.Vector3().crossVectors(dir, acr).normalize(); if (s === 'Left') n.negate();   // نحو الراحة
    return { hp, mcp, mid, dir, acr, n, pc: hp.clone().lerp(mid, 0.55) };
  }
  // نقطة على سطح اليد (مع سُمك الجلد) وعموديها للخارج
  function handPoint(s, kind) {
    const F = handFrame(s);
    if (kind === 'palm') return { p: F.pc.clone().addScaledVector(F.n, 0.014), n: F.n };
    if (kind === 'back') return { p: F.pc.clone().addScaledVector(F.n, -0.017), n: F.n.clone().negate() };
    if (kind === 'heel') return { p: F.hp.clone().addScaledVector(F.dir, 0.025).addScaledVector(F.n, 0.014), n: F.n };
    if (kind === 'knuckles' || kind === 'fist_front') {
      const pip = FN4.map(f => wpos(bone(s + f + 'Intermediate'))).reduce((a, b) => a.add(b), V(0, 0, 0)).multiplyScalar(0.25);
      const nn = pip.clone().sub(F.pc).normalize(); return { p: pip.addScaledVector(nn, 0.011), n: nn };
    }
    if (kind === 'fingertips') {   // طرفا السبابة والوسطى
      const t = ['Index', 'Middle'].map(f => { const a = wpos(bone(s + f + 'Intermediate')), b = wpos(bone(s + f + 'Distal')); return b.addScaledVector(b.clone().sub(a).normalize(), 0.018); });
      return { p: t[0].add(t[1]).multiplyScalar(0.5), n: F.dir };
    }
    if (kind === 'top') {          // أعلى نقطة في اليد (سطح القبضة من فوق)
      const top = handBalls(s).reduce((m, b) => (!m || b.p.y + b.r > m.p.y + m.r) ? b : m, null);
      return { p: top.p.clone().add(V(0, top.r, 0)), n: V(0, 1, 0) };
    }
    if (kind === 'indexTip') {
      const a = wpos(bone(s + 'IndexIntermediate')), b = wpos(bone(s + 'IndexDistal')), dd = b.clone().sub(a).normalize();
      return { p: b.addScaledVector(dd, 0.021), n: dd };
    }
    return { p: F.pc, n: F.n };
  }
  // نقاط اليد ككرات صغيرة لكشف تداخل اليدين
  function handBalls(s) {
    const F = handFrame(s), out = [{ p: F.pc, r: 0.02 }, { p: F.hp.clone().lerp(F.pc, 0.5), r: 0.02 }];
    for (const f of FN4.concat(['Thumb'])) for (const sg of SEG) { const b = bone(s + f + sg); if (b) out.push({ p: wpos(b), r: 0.0095 }); }
    return out;
  }
  function rotateWithin(from, to, maximum) {
    const angle = from.angleTo(to);
    if (angle <= maximum) return to.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(from, to);
    return from.clone().applyQuaternion(new THREE.Quaternion().slerp(q, maximum / angle)).normalize();
  }
  // Pure two-link geometry: fixed bone lengths, bounded flexion and a stable
  // bend hint. Limits are configurable avatar envelopes, not medical ranges.
  function armGeometry(shoulder, hint, target, l1, l2, side, previous, dt, frame = null) {
    const radians = THREE.MathUtils.degToRad;
    let direction = target.clone().sub(shoulder);
    const requested = direction.length();
    if (requested < 1e-8) direction = V(0, -1, 0); else direction.divideScalar(requested);
    const reach = flex => Math.sqrt(l1*l1 + l2*l2 + 2*l1*l2*Math.cos(radians(flex)));
    let distance = Math.max(reach(ARM_LIMITS.flexMax), Math.min(reach(ARM_LIMITS.flexMin), requested));
    if (frame) {
      const flex = Math.acos(Math.max(-1,Math.min(1,(distance*distance-l1*l1-l2*l2)/(2*l1*l2))));
      const step = radians(360)*dt;
      distance = Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(Math.max(frame.flex-step,Math.min(frame.flex+step,flex))));
      distance = Math.max(reach(ARM_LIMITS.flexMax),Math.min(reach(ARM_LIMITS.flexMin),distance));
    }
    const project = vector => vector.clone().addScaledVector(direction, -vector.dot(direction));
    let natural = project(V(side === 'Left' ? 1 : -1, -0.65, 0.15));
    if (natural.lengthSq() < 1e-8) natural = project(V(0, 0, 1));
    natural.normalize();
    let pole = project(hint.clone().sub(shoulder));
    // Near full extension the observed hint becomes noisy; retain continuity.
    const old = previous && project(previous);
    if (pole.length() < (l1+l2)*0.025) pole = old && old.lengthSq() > 1e-8 ? old : natural.clone();
    pole.normalize();
    pole = rotateWithin(natural, pole, radians(ARM_LIMITS.poleCone));
    if (old && old.lengthSq() > 1e-8) pole = rotateWithin(old.normalize(), pole, radians(ARM_LIMITS.poleSpeed)*dt);
    pole = rotateWithin(natural, pole, radians(ARM_LIMITS.poleCone));
    const a = (l1*l1-l2*l2+distance*distance)/(2*distance);
    const height = Math.sqrt(Math.max(0,l1*l1-a*a));
    let elbow = shoulder.clone().addScaledVector(direction,a).addScaledVector(pole,height);
    let wrist = shoulder.clone().addScaledVector(direction,distance);
    let upper = elbow.clone().sub(shoulder).normalize();
    let bounded = rotateWithin(V(0,-1,0), upper, radians(ARM_LIMITS.shoulderElevation));
    if (frame) bounded = rotateWithin(frame.upper,bounded,radians(360)*dt);
    if (bounded.distanceToSquared(upper) > 1e-10) {
      // Rotate the entire chain rather than dislocating the shoulder or
      // independently placing an elbow outside its fixed bone length.
      const correction = new THREE.Quaternion().setFromUnitVectors(upper,bounded);
      elbow = shoulder.clone().add(elbow.sub(shoulder).applyQuaternion(correction));
      wrist = shoulder.clone().add(wrist.sub(shoulder).applyQuaternion(correction));
      pole.applyQuaternion(correction);
    }
    if (frame && frame.normal) {
      const up = elbow.clone().sub(shoulder).normalize(), low = wrist.clone().sub(elbow).normalize();
      const flex = up.angleTo(low);
      const wanted = new THREE.Vector3().crossVectors(up,low).normalize();
      const transport = new THREE.Quaternion().setFromUnitVectors(frame.upper,up);
      const oldNormal = frame.normal.clone().applyQuaternion(transport).normalize();
      const normal = rotateWithin(oldNormal,wanted,radians(ARM_LIMITS.poleSpeed)*dt);
      const bend = new THREE.Vector3().crossVectors(normal,up).normalize();
      wrist = elbow.clone().addScaledVector(up,l2*Math.cos(flex)).addScaledVector(bend,l2*Math.sin(flex));
      const ray = wrist.clone().sub(shoulder).normalize();
      pole = elbow.clone().sub(shoulder);pole.addScaledVector(ray,-pole.dot(ray)).normalize();
    }
    return { elbow, wrist, pole };
  }
  function solveArm(side, target, hint, amount = 1, smoothPole = false) {
    const rig = ARM_RIG[side]; if (!rig) return;
    const upper = bone(side + 'UpperArm'), lower = bone(side + 'LowerArm'), hand = bone(side + 'Hand');
    const shoulder = wpos(upper), currentElbow = wpos(lower), currentWrist = wpos(hand);
    const goal = currentWrist.clone().lerp(target, amount);
    const elbowHint = currentElbow.clone().lerp(hint || currentElbow, amount);
    const solved = armGeometry(shoulder, elbowHint, goal, rig.upper, rig.lower, side,
      ARM_FRAME[side] ? ARM_FRAME[side].pole : (smoothPole ? ELBOW_POLE[side] : null), rotationDt, ARM_FRAME[side] || null);
    ELBOW_POLE[side] = solved.pole.clone();
    const upDir = solved.elbow.clone().sub(shoulder).normalize();
    const lowDir = solved.wrist.clone().sub(solved.elbow).normalize();
    const hinge = new THREE.Vector3().crossVectors(upDir,lowDir).normalize();
    const palm = hand.getWorldQuaternion(new THREE.Quaternion());
    for (const [name, dir] of [[side+'UpperArm',upDir],[side+'LowerArm',lowDir]]) {
      const rest = REST_W[name];
      const matrix = basis(dir,hinge).multiply(basis(rest.dir,rig.axis).transpose());
      const world = new THREE.Quaternion().setFromRotationMatrix(matrix).multiply(rest.q);
      set(name,{world},1);
    }
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(palm));
    hand.updateMatrixWorld(true);
    constrainWrist(side);
  }
  function jointDiagnostics() {
    const result = {}, degrees = THREE.MathUtils.radToDeg;
    for (const side of ['Left','Right']) {
      const rig = ARM_RIG[side]; if (!rig || !BIND) continue;
      const upper = bone(side+'UpperArm'), lower = bone(side+'LowerArm'), hand = bone(side+'Hand');
      const a = wpos(lower).sub(wpos(upper)), b = wpos(hand).sub(wpos(lower));
      const hinge = new THREE.Vector3().crossVectors(a,b).normalize();
      const fixed = rig.axis.clone().applyQuaternion(REST_W[side+'UpperArm'].q.clone().invert()).applyQuaternion(upper.getWorldQuaternion(new THREE.Quaternion()));
      const axis = REST_W[side+'LowerArm'].dir.clone().applyQuaternion(REST_W[side+'LowerArm'].q.clone().invert()).normalize();
      const wrist = hand.quaternion.clone().multiply(BIND[side+'Hand'].clone().invert());
      const segments=FOREARM_TWISTS[side];
      const forearm = segments ? segments[2].quaternion.clone() : BIND[side+'LowerArm'].clone().invert().multiply(lower.quaternion);
      result[side] = { elbow_flex_deg: degrees(a.angleTo(b)),
        elbow_hinge_error_deg: degrees(hinge.angleTo(fixed)),
        shoulder_elevation_deg: degrees(a.angleTo(V(0,-1,0))),
        forearm_roll_deg: degrees(signedTwist(forearm,axis)),
        wrist_twist_deg: degrees(signedTwist(wrist,axis)),
        wrist_bend_deg: degrees(2*Math.acos(Math.min(1,Math.abs(wrist.w)))),
        physical_wrist_angle_deg: degrees(b.angleTo(wpos(bone(side+'MiddleProximal')).sub(wpos(hand)))),
        bind_wrist_offset_deg: degrees(REST_W[side+'LowerArm'].dir.angleTo(REST_W[side+'Hand'].dir)),
        upper_length_error_mm: Math.abs(a.length()-rig.upper)*1000,
        lower_length_error_mm: Math.abs(b.length()-rig.lower)*1000 };
    }
    return result;
  }
  // All contact/collision corrections use the same hinge-constrained chain.
  function armIK(side, delta) {
    solveArm(side, wpos(bone(side+'Hand')).add(delta), wpos(bone(side+'LowerArm')));
  }
  function separate(s, base, w, tolerance = 5e-4) {
    for (let it = 0; it < 3; it++) {
      const A = handBalls(s), B = handBalls(base); let best = 0, dir = null;
      for (const a of A) for (const b of B) { const v = a.p.clone().sub(b.p), o = a.r + b.r - v.length(); if (o > best) { best = o; dir = v.normalize(); } }
      if (!dir || best < tolerance) return;
      // Coincident centres have no normal; choose the anatomical outward direction.
      if (dir.lengthSq() < 1e-10) dir = V(s === 'Right' ? -1 : 1, 0, 0);
      armIK(s, dir.multiplyScalar(best * w));
    }
  }
  // Final-pose checks are opt-in for staged review, with intentional contacts preserved.
  function guardReviewHands(fx) {
    vrm.scene.updateMatrixWorld(true);
    const explicitContact = fx && ['Left', 'Right'].some(s => fx[s].some(e => e.hands));
    if (!explicitContact) separate('Right', 'Left', 0.7, 0.012);
    for (const side of ['Left', 'Right']) {
      const shoulder = bone(side + 'UpperArm'), hand = bone(side + 'Hand');
      if (!shoulder || !hand) continue;
      const plane = wpos(shoulder).z + 0.035;
      const points = handBalls(side);
      const back = Math.min(wpos(hand).z, ...points.map(ball => ball.p.z - ball.r));
      if (back < plane) {
        armIK(side, V(0, 0, Math.min(0.06, plane - back)));
        safetyCorrections++;
      }
    }
    vrm.scene.updateMatrixWorld(true);
  }
  // Swept hand spheres against a solid torso envelope. Check the path as well
  // as the destination: two clear poses can otherwise interpolate through the chest.
  const bodyHistory = { Left: null, Right: null };
  let bodyOverlap = 0;
  function torsoClearance(previous, current, radius, body) {
    const rx = body.rx + radius, ry = body.ry + radius, rz = body.rz + radius;
    // An invalid starting sample has no clear sweep path. Resolve its current
    // position first instead of dividing the existing overlap by a tiny t.
    if (previous) {
      const x = (previous.x - body.x) / rx, y = (previous.y - body.y) / ry;
      const z = (previous.z - body.z) / rz;
      if (x*x + y*y + z*z < 1) previous = null;
    }
    let push = 0;
    for (let k = 1; k <= 32; k++) {
      const t = previous ? k / 32 : 1;
      const p = previous ? previous.clone().lerp(current, t) : current;
      const x = (p.x - body.x) / rx, y = (p.y - body.y) / ry;
      const section = 1 - x * x - y * y;
      if (section <= 0) continue;
      const front = body.z + rz * Math.sqrt(section);
      const back = body.z - rz * Math.sqrt(section);
      if (p.z > back && p.z < front) push = Math.max(push, (front - p.z + 0.002) / t);
    }
    return push;
  }
  function armCollisionBalls(side) {
    const points = handBalls(side);
    const elbow = wpos(bone(side + 'LowerArm')), wrist = wpos(bone(side + 'Hand'));
    // Include the forearm: a clear palm alone does not prevent the sleeve
    // or wrist from cutting through the chest on its way to that position.
    for (let i = 0; i < 6; i++) points.push({p: elbow.clone().lerp(wrist, i / 6), r: 0.025});
    return points;
  }
  function guardSolidBody() {
    const hips = bone('Hips'), left = bone('LeftUpperArm'), right = bone('RightUpperArm');
    if (!hips || !left || !right) return;
    vrm.scene.updateMatrixWorld(true);
    const h = wpos(hips), l = wpos(left), r = wpos(right);
    const top = (l.y + r.y) / 2 + 0.025, bottom = h.y - 0.08;
    const body = { x: (l.x + r.x) / 2, y: (top + bottom) / 2,
      z: (l.z + r.z) / 2, rx: l.distanceTo(r) * 0.48,
      ry: (top - bottom) / 2, rz: 0.145 };
    bodyOverlap = 0;
    for (const side of ['Left', 'Right']) {
      // An 8 mm planning shell starts avoidance before the visible surface.
      // IK preserves palm orientation and finger shape. Recheck the actual
      // reachable result, since a requested displacement may exceed arm reach.
      for (let pass = 0; pass < 16; pass++) {
        const upper = bone(side + 'UpperArm'), lower = bone(side + 'LowerArm');
        const elbow = wpos(lower), elbowPush = torsoClearance(null, elbow, 0.033, body);
        if (elbowPush > 0.0005) {
          const wrist = wpos(bone(side + 'Hand'));
          solveArm(side, wrist, elbow.clone().add(V(0, 0, elbowPush)));
        }
        const balls = armCollisionBalls(side);
        let push = 0;
        for (let i = 0; i < balls.length; i++) {
          const previous = bodyHistory[side] && bodyHistory[side][i];
          push = Math.max(push, torsoClearance(previous, balls[i].p, balls[i].r + 0.008, body));
        }
        if (push < 0.0005) break;
        armIK(side, V(0, 0, Math.min(push, 0.12)));
        safetyCorrections++;
      }
      const finalBalls = armCollisionBalls(side);
      for (const ball of finalBalls) bodyOverlap = Math.max(bodyOverlap, torsoClearance(null, ball.p, ball.r, body));
      bodyHistory[side] = finalBalls.map(ball => ball.p.clone());
    }
  }
  // Conservative proxies, not a mesh collision test or linguistic approval.
  function inspectPose(fx) {
    vrm.scene.updateMatrixWorld(true);
    const hands = ['Left', 'Right'].map(side => ({side, balls: handBalls(side)}));
    let overlap = 0;
    for (const a of hands[0].balls) for (const b of hands[1].balls)
      overlap = Math.max(overlap, a.r + b.r - a.p.distanceTo(b.p));
    const intentionalContact = !!(fx && ['Left', 'Right'].some(s => fx[s].some(e => e.hands)));
    const behind = [], outside = [];
    for (const {side, balls} of hands) {
      const plane = wpos(bone(side + 'UpperArm')).z + 0.035;
      if (balls.some(b => b.p.z - b.r < plane - 0.005)) behind.push(side);
      if (balls.some(b => { const p = b.p.clone().project(camera); return Math.abs(p.x) > 0.96 || Math.abs(p.y) > 0.96 || p.z < -1 || p.z > 1; })) outside.push(side);
    }
    return {motion: cur && cur.it && cur.it.motion, seconds: cur ? cur.t : 0,
      behind, outside, overlap_mm: Math.round(overlap * 1000), intentional_contact: intentionalContact,
      body_overlap_mm: Math.round(bodyOverlap * 1000),
      overlap_warning: !intentionalContact && overlap > 0.012};
  }
  // لا تدخل أي نقطة من اليد في سطح الرأس/الوجه (تُفحص فقط لليد التي لها تلامس مع الوجه)
  function faceSafety(s) {
    const head = bone('Head'); if (!head || !HEAD.length) return;
    for (let it = 0; it < 2; it++) {
      const pts = HEAD.map(q => ({ p: head.localToWorld(q.p.clone()), n: q.n.clone().transformDirection(head.matrixWorld) }));
      let best = 0, dir = null;
      for (const b of handBalls(s)) {
        let near = null, dm = 1e9; for (const q of pts) { const dd = q.p.distanceToSquared(b.p); if (dd < dm) { dm = dd; near = q; } }
        if (!near || dm > 0.0064) continue;
        const depth = b.r - b.p.clone().sub(near.p).dot(near.n);
        if (depth > best) { best = depth; dir = near.n.clone(); }
      }
      if (!dir || best < 5e-4) return;
      armIK(s, dir.multiplyScalar(best));
    }
  }
  function solveContacts(fx) {
    vrm.scene.updateMatrixWorld(true);
    for (const s of ['Left', 'Right']) {
      const faces = fx[s].filter(e => e.face);
      if (faces.length) {
        const acc = V(0, 0, 0); let ws = 0;
        for (const e of faces) {
          const A = anchorW(e.face.anchor), Hp = handPoint(s, e.face.point); if (!A) continue;
          let dl;
          if (e.face.surface) dl = A.n.clone().multiplyScalar(e.face.gap - Hp.p.clone().sub(A.p).dot(A.n));
          else { const T = A.p.clone().addScaledVector(A.n, e.face.gap); if (e.face.offset) T.add(V(...e.face.offset)); dl = T.sub(Hp.p); }
          acc.addScaledVector(dl, e.w); ws += e.w;
        }
        if (ws > 0) { armIK(s, acc.multiplyScalar(1 / Math.max(1, ws))); faceSafety(s); }
      }
      for (const e of fx[s].filter(e => e.hands)) {
        const base = e.hands.base;
        if (!e.hands.separate) {
          const B = handPoint(base, e.hands.basePoint), M = handPoint(s, e.hands.point);
          const T = B.p.clone().addScaledVector(B.n, e.hands.gap);
          if (e.hands.slide) T.addScaledVector(handFrame(base).acr, e.hands.slide);
          armIK(s, T.sub(M.p).multiplyScalar(e.w));
        }
        separate(s, base, e.w);
      }
    }
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
    if (paused) { renderer.render(scene, camera); return; }
    const renderedHands = {};
    for (const side of ['Left', 'Right']) {
      renderedHands[side] = bone(side + 'Hand').getWorldQuaternion(new THREE.Quaternion());
      const shoulder = wpos(bone(side+'UpperArm')), elbow = wpos(bone(side+'LowerArm')), wrist = wpos(bone(side+'Hand'));
      const upper = elbow.clone().sub(shoulder).normalize(), lower = wrist.clone().sub(elbow).normalize();
      const rest = REST_W[side+'LowerArm'];
      const axis = rest.dir.clone().applyQuaternion(rest.q.clone().invert()).normalize();
      const segments=FOREARM_TWISTS[side];
      const relative = segments ? segments[2].quaternion.clone() : BIND && BIND[side+'LowerArm'] ? BIND[side+'LowerArm'].clone().invert().multiply(bone(side+'LowerArm').quaternion) : new THREE.Quaternion();
      const rig = ARM_RIG[side];
      const normal = rig.axis.clone().applyQuaternion(REST_W[side+'UpperArm'].q.clone().invert()).applyQuaternion(bone(side+'UpperArm').getWorldQuaternion(new THREE.Quaternion()));
      ARM_FRAME[side] = { upper, normal, flex: upper.angleTo(lower), roll: signedTwist(relative,axis), pole: ELBOW_POLE[side] && ELBOW_POLE[side].clone() };
    }
    rotationDt = Math.max(1 / 240, Math.min(0.1, dt));
    if (cur && !paused) {
      cur.t += dt * speed * (cur.rate || 1);
      if (cur.pause) { toRest(0.06); if (cur.t >= cur.pause) next(cur.base); }
      else {
        const fr = cur.d.frames, x = cur.t * cur.d.fps, i = Math.floor(x);
        cur.d._x = x;
        // نسبة الاقتراب من الهدف مستقلة عن سرعة الشاشة (60 أو 120 أو 144 إطارًا/ث) فتبقى الحركة بنفس النعومة على كل الأجهزة
        const rate = a => 1 - Math.pow(1 - a, Math.max(0.25, dt * 60));
        if (i < fr.length) applyFrame(i + 1 < fr.length ? mixFrames(fr[i], fr[i + 1], x - i) : fr[i], cur.d.asp, rate(cur.t < BLEND ? 0.3 : 0.55), cur.d);
        else next(cur.base);
      }
    } else if (!cur) toRest(0.06);
    breathe(dt);
    vrm.update(dt);
    // Inspect/correct the pose actually rendered, after breathing and VRM updates.
    if (reviewSafety && cur && cur.d) {
      const fx = window.SignFix && cur.d._x != null ? SignFix.at(cur.d, cur.d._x) : null;
      if (!paused) guardReviewHands(fx);
      poseDiagnostics = inspectPose(fx);
    } else poseDiagnostics = null;
    for (const side of ['Left','Right']) solveArm(side,wpos(bone(side+'Hand')),wpos(bone(side+'LowerArm')));
    guardSolidBody();
    // A positional correction changes the forearm parent. Bound the final
    // world-space palm rotation too, then clear any fingers moved by that turn.
    for (const side of ['Left', 'Right']) {
      const world = bone(side + 'Hand').getWorldQuaternion(new THREE.Quaternion());
      setHand(side + 'Hand', {world}, renderedHands[side], 1);
    }
    for (const side of ['Left','Right']) constrainWrist(side);
    guardSolidBody();
    if (reviewSafety && cur && cur.d) {
      const fx = window.SignFix && cur.d._x != null ? SignFix.at(cur.d, cur.d._x) : null;
      poseDiagnostics = inspectPose(fx);
    }
    renderer.render(scene, camera);
  }
  return {
    init, playList, stop, load,
    set reviewSafety(v) { reviewSafety = !!v; safetyCorrections = 0; },
    get reviewSafety() { return reviewSafety; },
    get safetyCorrections() { return safetyCorrections; },
    get bodyOverlap() { return bodyOverlap; },
    get jointDiagnostics() { return jointDiagnostics(); },
    _jointProjection: () => Object.fromEntries(['Left','Right'].map(side => [side,
      ['UpperArm','LowerArm','Hand','MiddleProximal'].map(name => wpos(bone(side+name)).project(camera).toArray())])),
    get poseDiagnostics() { return poseDiagnostics; },
    set speed(v) { speed = v; }, get speed() { return speed; },
    set paused(v) { paused = !!v; }, get paused() { return paused; },
    get ready() { return !!vrm; }, _bone: bone, _anch: () => ANCH, _hp: handPoint, _aw: anchorW, _dbg: () => cur && { t: cur.t, id: cur.it && cur.it.motion, n: cur.d && cur.d.frames.length },
    // للاختبار: تقديم الحركة يدويًا إطارًا إطارًا (حين يوقف المتصفح مؤقّت الرسم في نافذة غير ظاهرة)
    _tick: (n = 1, dt = 1 / 60) => { for (let k = 0; k < n; k++) frame(dt); }
  };
})();
