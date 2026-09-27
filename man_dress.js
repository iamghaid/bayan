// لمسات على أفاتار MakeHuman: المواد والجزء السفلي من الثوب (الثوب والشعر مبنيان داخل النموذج نفسه)
// المقاسات من tools/avatar: الرأس عرضه ±0.088، أعلاه 1.667، مركزه (0, 1.575, 0.0645) — نحسبها نسبةً لعظمة الرأس
function dressMan(root, bone) {
  const head = bone('Head'); if (!head) return;
  root.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  // مقاسة بعد الربط بالهيكل: عظمة الرأس 1.646، العينان 1.69، قمة الرأس 1.80 — المركز فوق العظمة بـ 7.5 سم
  const c = hp.clone().add(new THREE.Vector3(0, 0.078, 0.004));
  const R = 0.106, SZ = 1.12;
  // المواد: الجسم والعينان غير شفافة (وإلا يُرسم الجسم فوق العينين)، والحواجب بقص شفافية
  root.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.name) return;
    const m = o.material, n = m.name;
    if (/body|low-poly|eye(?!brow)|teeth/i.test(n)) { m.transparent = false; m.depthWrite = true; m.alphaTest = 0; }
    if (/eyebrow|eyelash|short0|hair/i.test(n)) { m.transparent = false; m.alphaTest = 0.5; }
    if (/body/i.test(n)) { m.color.setRGB(0.86, 0.7, 0.58); m.roughness = 0.7; }   // بشرة حنطية طبيعية (مع ألوان sRGB)        // بشرة حنطية
    if (/Thobe/.test(n)) { m.roughness = 0.85; m.color.setRGB(0.9, 0.9, 0.88); }
    m.needsUpdate = true;
  });
  // ياقة الثوب وفتحة الصدر بأزرار (مثبتة على الصدر فتتحرك معه)
  const chest = bone('Chest'), neckB = bone('Neck'), thobe = root.getObjectByName('Thobe');
  if (chest && neckB && thobe) {
    const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.85, side: THREE.DoubleSide });
    const np = neckB.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Raycaster();
    const hitZ = y => { ray.set(new THREE.Vector3(np.x, y, 1), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObject(thobe, true)[0]; return h ? h.point.z : null; };
    // الياقة: أسطوانة قصيرة حول قاعدة الرقبة
    const cy = np.y - 0.02, z0 = hitZ(cy - 0.02);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.074, 0.032, 40, 1, true), white);
    collar.position.set(np.x, cy, np.z + 0.012); root.add(collar); chest.attach(collar);
    // فتحة الصدر: شريط رفيع مع ثلاثة أزرار صغيرة
    const pts = []; for (let k = 0; k <= 6; k++) { const y = cy - 0.035 - k * 0.03, z = hitZ(y); if (z != null) pts.push(new THREE.Vector3(np.x, y, z + 0.002)); }
    if (pts.length > 2) {
      const strip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.004, 6), new THREE.MeshStandardMaterial({ color: 0xdedcd6, roughness: 0.8 }));
      root.add(strip); chest.attach(strip);
      const btn = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.5 });
      [1, 3, 5].forEach(i => { if (!pts[i]) return; const b = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), btn); b.position.copy(pts[i]).add(new THREE.Vector3(0, 0, 0.004)); root.add(b); chest.attach(b); });
    }
  }
  addShemagh(root, bone);
  // الجزء السفلي من الثوب: واسع من الورك حتى الكعب (بدل أن يلتصق بالساقين)
  const hips = bone('Hips'), foot = bone('LeftFoot');
  if (hips && foot) {
    const hp2 = hips.getWorldPosition(new THREE.Vector3()), fp = foot.getWorldPosition(new THREE.Vector3());
    const top = hp2.y + 0.02, bottom = fp.y - 0.02;
    const prof = [[0.17, top], [0.185, hp2.y - 0.12], [0.2, (top + bottom) / 2], [0.225, bottom]].map(([r, y]) => new THREE.Vector2(r, y - hp2.y));
    const skirt = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), (() => { const tm = root.getObjectByName('Thobe'); const m = tm ? tm.material.clone() : new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.85 }); m.side = THREE.DoubleSide; return m; })());
    skirt.position.copy(hp2); skirt.scale.set(1, 1, 0.8); root.add(skirt); hips.attach(skirt);
  }
}

// ---------- الشماغ والعقال ----------
// يُبنى من شكل رأس الأفاتار نفسه: قبعة تلتصق بالجمجمة (فوق الشعر بقليل) تبدأ من الجبهة،
// ثم ينسدل القماش من الصدغين والخلف رأسيًا حتى الكتفين دون أن يخترق الأذنين أو الخدين أو الرقبة.
// مربوط بعظام الرأس والرقبة والصدر معًا، فيتبع الرأس من الأعلى ويستقر على الكتفين من الأسفل.
function shemaghTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b3202a';
  for (const o of [0, 64]) { g.fillRect(o + 26, 0, 12, 128); g.fillRect(0, o + 26, 128, 12); }            // خطوط الشبكة
  g.fillStyle = '#f4f2ee';
  for (const x of [32, 96]) for (const y of [32, 96]) { g.fillRect(x - 3, y - 3, 6, 6); }                  // تقاطعات فاتحة
  g.fillStyle = '#b3202a';
  for (const x of [0, 64, 128]) for (const y of [0, 64, 128]) { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 7, y); g.lineTo(x, y + 7); g.lineTo(x - 7, y); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function addShemagh(root, bone) {
  const head = bone('Head'), neck = bone('Neck'), chest = bone('Chest');
  const body = root.getObjectByName('Human_export'), hair = root.getObjectByName('Humanshort02_export'), thobe = root.getObjectByName('Thobe');
  if (!head || !neck || !chest || !body || !body.isSkinnedMesh) return;
  root.updateMatrixWorld(true);
  // نسخة ثابتة (غير مربوطة بالهيكل) من الجزء العلوي فقط: القياس عليها أسرع بكثير
  function staticCopy(mesh, y0) {
    const g = mesh.geometry, P = g.attributes.position, I = g.index, M = mesh.matrixWorld, v = new THREE.Vector3();
    const W = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M); W[i * 3] = v.x; W[i * 3 + 1] = v.y; W[i * 3 + 2] = v.z; }
    const out = [], n = I ? I.count : P.count;
    for (let k = 0; k < n; k += 3) {
      const t = [0, 1, 2].map(j => I ? I.getX(k + j) : k + j);
      if (t.every(q => W[q * 3 + 1] < y0)) continue;
      t.forEach(q => out.push(W[q * 3], W[q * 3 + 1], W[q * 3 + 2]));
    }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    const m = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(true); return m;
  }
  const headM = [staticCopy(body, 1.6)].concat(hair ? [staticCopy(hair, 1.6)] : []);
  const drapeM = [staticCopy(body, 1.3)].concat(thobe ? [staticCopy(thobe, 1.3)] : []);
  const C = head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0));
  const ray = new THREE.Raycaster();
  const dirOf = (el, az) => new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const surf = d => { ray.far = Infinity; ray.set(C.clone().addScaledVector(d, 0.35), d.clone().negate()); const h = ray.intersectObjects(headM)[0]; return h ? 0.35 - h.distance : 0.095; };
  const extent = (az, y) => { const d = new THREE.Vector3(Math.sin(az), 0, Math.cos(az)); ray.far = 0.5;
    ray.set(new THREE.Vector3(C.x, y, C.z).addScaledVector(d, 0.5), d.clone().negate()); const h = ray.intersectObjects(drapeM)[0]; return h ? 0.5 - h.distance : 0; };
  const smooth = (x, a0) => { const t = Math.max(0, Math.min(1, (x - a0[0]) / (a0[1] - a0[0]))); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t, D = Math.PI / 180;

  const NA = 72, NC = 16, NH = 14, OFF = 0.008;
  // القماش ليس لاصقًا بالجمجمة: يرتفع فوق قمة الرأس قليلًا كما يُلبس الشماغ المكوي
  const puff = el => OFF + 0.02 * Math.pow(Math.max(0, Math.sin(el)), 3);
  const AZ = [...Array(NA)].map((_, i) => -Math.PI + (i + 0.5) * 2 * Math.PI / NA);
  // s: صفر عند الوجه (القماش يقف عند الجبهة)، واحد من الصدغين للخلف (ينسدل حتى الكتفين)
  const S = AZ.map(az => smooth(Math.abs(az) / D, [30, 62]));
  // حافة الجبهة: مع ذروة خفيفة في المنتصف كما يُلبس الشماغ
  const ELC = AZ.map((az, i) => { const a = Math.abs(az) / D; return lerp((10 + 5 * Math.min(1, a / 25)) * D, -4 * D, S[i]); });
  // نصف قطر القبعة: قياس فوق الشعر ثم تنعيم (يزيل خشونة خصل الشعر)
  let R = AZ.map((az, i) => [...Array(NC + 1)].map((_, j) => surf(dirOf(lerp(Math.PI / 2, ELC[i], j / NC), az))));
  for (let p = 0; p < 4; p++) R = R.map((col, i) => col.map((r, j) => {
    const L = R[(i + NA - 1) % NA][j], Rr = R[(i + 1) % NA][j], U = col[Math.max(0, j - 1)], Dn = col[Math.min(NC, j + 1)];
    return (2 * r + L + Rr + U + Dn) / 6;
  }));
  const cols = AZ.map((az, i) => {
    const pts = [];
    for (let j = 0; j <= NC; j++) { const el = lerp(Math.PI / 2, ELC[i], j / NC); pts.push(C.clone().addScaledVector(dirOf(el, az), R[i][j] + puff(el))); }
    const top = pts[NC], d = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    const r0 = Math.hypot(top.x - C.x, top.z - C.z);
    const yHem = 1.47 - 0.05 * Math.max(0, -Math.cos(az));            // على الكتفين، وأطول قليلًا من الخلف
    const len = S[i] * Math.max(0, top.y - yHem);
    let rh = r0;
    for (let j = 1; j <= NH; j++) {
      const f = j / NH, y = top.y - len * f;
      rh = Math.max(rh, r0 + (extent(az, y) + 0.014 - r0) * S[i]);      // لا يدخل في الأذن أو الخد أو الرقبة أو الكتف
      const r = rh + 0.012 * f * f * S[i];                                 // اتساع خفيف في الأسفل كالقماش المنسدل
      pts.push(new THREE.Vector3(C.x, y, C.z).addScaledVector(d, r));
    }
    // ثنية الحافة: صف أخير للداخل قليلًا فيبدو للقماش سُمك عند الأطراف
    const last = pts[pts.length - 1].clone();
    pts.push(last.addScaledVector(d, -0.006).add(new THREE.Vector3(0, 0.004, 0)));
    return pts;
  });
  // تنعيم الجزء المنسدل أفقيًا (بين الأعمدة) ثم الأوزان والإحداثيات
  const NR = cols[0].length;
  for (let p = 0; p < 2; p++) {
    const cp = cols.map(c => c.map(v => v.clone()));
    for (let i = 0; i < NA; i++) for (let j = NC + 1; j < NR; j++) {
      const a = cp[(i + NA - 1) % NA][j], b = cp[(i + 1) % NA][j];
      if (S[i] > 0.99 && S[(i + 1) % NA] > 0.99 && S[(i + NA - 1) % NA] > 0.99) cols[i][j].copy(cp[i][j]).multiplyScalar(2).add(a).add(b).multiplyScalar(0.25);
    }
  }
  const bones = body.skeleton.bones, bi = b => bones.indexOf(b);
  const iH = bi(head), iN = bi(neck), iC = bi(chest);
  if (iH < 0 || iN < 0 || iC < 0) return;
  const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
  const pos = [], uv = [], sIdx = [], sW = [], idx = [];
  cols.push(cols[0].map(v => v.clone()));                                 // عمود مكرر لإغلاق الدائرة دون درز في النقش
  cols.forEach((col, i) => {
    let acc = 0;
    col.forEach((p, j) => {
      if (j) acc += p.distanceTo(col[j - 1]);
      const q = p.clone().applyMatrix4(inv); pos.push(q.x, q.y, q.z);
      uv.push(i / NA * 22, acc / 0.035);
      const wh = Math.max(0, Math.min(1, (p.y - 1.53) / 0.09)), wn = (1 - wh) * Math.max(0, Math.min(1, (p.y - 1.46) / 0.07));
      sIdx.push(iH, iN, iC, 0); sW.push(wh, wn, 1 - wh - wn, 0);
    });
  });
  for (let i = 0; i < NA; i++) { const i2 = i + 1;
    for (let j = 0; j < NR - 1; j++) { const a = i * NR + j, b = i2 * NR + j, c = i2 * NR + j + 1, d = i * NR + j + 1; idx.push(a, b, d, b, c, d); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: shemaghTexture(), roughness: 0.92, side: THREE.DoubleSide });
  const sh = new THREE.SkinnedMesh(g, mat); sh.name = 'Shemagh'; sh.frustumCulled = false;
  body.parent.add(sh); sh.position.copy(body.position); sh.quaternion.copy(body.quaternion); sh.scale.copy(body.scale);
  sh.updateMatrixWorld(true); sh.bind(body.skeleton, body.bindMatrix);
  if (hair) hair.visible = false;                                          // الشعر كله تحت الشماغ

  // العقال: حلقتان سوداوان على قمة الرأس، مائلتان قليلًا (أعلى من الأمام)
  const agalMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.55 });
  for (const [e0, rr] of [[31, 0.0056], [38, 0.0056]]) {
    const ring = [];
    for (let k = 0; k < 48; k++) { const az = k / 48 * 2 * Math.PI, el = (e0 + 6 * Math.cos(az)) * D, d = dirOf(el, az);
      ring.push({ az, el, r: surf(d) }); }
    const rs = ring.map((p, k) => (ring[(k + 47) % 48].r + 2 * p.r + ring[(k + 1) % 48].r) / 4);
    const curve = new THREE.CatmullRomCurve3(ring.map((p, k) => C.clone().addScaledVector(dirOf(p.el, p.az), rs[k] + puff(p.el) + rr + 0.001)), true);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, rr, 10, true), agalMat);
    root.add(m); head.attach(m);
  }
}
