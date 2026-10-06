// يبني قائمة تشغيل من خطة الترجمة (translations/<id>_gemini.json) ويشغّلها على الأفاتار بشكل متواصل
(async () => {
  const KH = ['103010', '124660', '126507', '167534', '183793'];
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let plan = [], sents = [], AVAIL = new Set(), QURAN_TXT = {};
  function holdReportedItems(items) {
    return items.map(item => {
      const key = item.text.replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا');
      if (item.action === 'quran' || !['الانبياء', 'انبياء'].includes(key)) return item;
      const copy = {...item, action:'pending', conf:'review', reason:'reported-translation-issue',
        review_note:'تم إيقاف الربط الآلي بالمفرد لحين مراجعة معنى الجمع وأدائه في الجملة.'};
      delete copy.id; delete copy.letters; delete copy.preview_only;
      return copy;
    });
  }

  try { AVAIL = new Set((await (await fetch('sshi_motion/index.json')).json()).map(String)); } catch (e) {}

  const pick = $('pick');
  for (const k of KH) pick.insertAdjacentHTML('beforeend', `<option value="${k}">خطبة ${k}</option>`);
  const q = new URLSearchParams(location.search).get('k'); if (q && KH.includes(q)) pick.value = q;

  async function loadKh(k) {
    Signer.stop(); $('now').innerHTML = '<div class="s">جاهز — اضغط تشغيل أو أي كلمة</div>';
    const d = await (await fetch(`translations/${k}_gemini.json`)).json();
    plan = holdReportedItems(d.plan); sents = d.sentences;
    // عنوان الخيار: أول كلمات الخطبة بعد الحمد
    const opt = [...pick.options].find(o => o.value === k);
    render();
  }

  function has(id) { return id != null && (!AVAIL.size || AVAIL.has(String(id))); }
  // Signs the review team accepted live in sshi_motion/staging/ until they are synced into the library.
  const signOk = p => p.motion_dir === 'staging' ? p.id != null : has(p.id);
  const motionItem = (p, tag) => p.motion_dir === 'staging' ? { motion: p.id, tag, base: 'sshi_motion/staging/' } : { motion: p.id, tag };

  window.BayanLoadPlan = data => {
    Signer.stop(); last = null;
    plan = holdReportedItems(data.plan); sents = data.sentences;
    $('now').textContent = 'معاينة تجريبية — راجع المطابقات الحمراء والمقاطع النصية';
    render();
  };

  function render() {
    const html = []; let s = -1, signed = 0, spelled = 0, missing = 0;
    plan.forEach((p, i) => {
      if (p.s !== s) { if (s >= 0) html.push('</p>'); html.push('<p>'); s = p.s; }
      let cls = 't ' + p.action;
      if (p.conf === 'review' || p.conf === 'low') cls += ' rev';
      if (p.action === 'sign') { signed++; if (!signOk(p)) { cls += ' miss'; missing++; } }
      if (p.action === 'spell') spelled++;
      const title = p.action === 'pending' ? p.review_note || 'تحتاج مراجعة — نص فقط' : p.action === 'sign' ? 'إشارة: ' + p.sign : p.action === 'spell' ? (p.under_review ? `تهجئة مؤقتة: الإشارة الجديدة «${p.under_review.sign}» قيد المراجعة — ` : 'تهجئة: ') + (p.base || '').split('').join('-') : p.action === 'quran' ? 'آية — تُعرض نصًا' : 'لا تُترجم بإشارة مستقلة';
      html.push(`<span class="${cls}" data-i="${i}" title="${esc(title)}">${esc(p.action === 'quran' ? '﴿' + p.text + '﴾' : p.text)}</span> `);
    });
    html.push('</p>');
    $('text').innerHTML = html.join('');
    $('stats').textContent = `${signed} إشارة · ${spelled} كلمة تُهجّأ · ${plan.filter(p => p.action === 'drop').length} أداة لا تُترجم · ${plan.filter(p => p.action === 'pending').length} مقطع يحتاج مراجعة` + (missing ? ` · ${missing} إشارة بلا حركة بعد` : '');
  }

  // قائمة التشغيل من العنصر i حتى النهاية
  function build(from) {
    const items = []; let s = plan[from] ? plan[from].s : 0;
    for (let i = from; i < plan.length; i++) {
      const p = plan[i];
      if (p.s !== s) { items.push({ pause: 0.35, tag: null }); s = p.s; }
      if (p.action === 'sign' && signOk(p)) items.push(motionItem(p, i));
      else if (p.action === 'quran') { items.push({ pause: Math.min(6, 1 + p.text.length / 25), tag: i }); }
      else if (p.action === 'pending') { items.push({ pause: 1.5, tag: i }); }
      else if (p.action === 'spell' || (p.action === 'sign' && !signOk(p))) {
        const L = (p.letters || []).filter(has);
        if (L.length) L.forEach((x, k) => items.push({ motion: x, rate: 1.5, tag: i, letter: k }));
      }
    }
    return items;
  }

  let last = null;
  function onItem(tag, err) {
    if (last != null) { const e = document.querySelector(`.t[data-i="${last}"]`); e && e.classList.remove('on'); }
    last = tag;
    if (tag == null) return;
    const p = plan[tag], e = document.querySelector(`.t[data-i="${tag}"]`);
    if (e) { e.classList.add('on'); e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    $('now').innerHTML = p.action === 'pending'
      ? `<div class="w">${esc(p.text)}</div><div class="s">${esc(p.review_note || 'تحتاج مراجعة — نص فقط')}</div>`
      : p.action === 'quran'
      ? `<div class="q">﴿${esc(p.text)}﴾</div><div class="s">آية — تُعرض نصًا (قرار الإشارة للمختص الشرعي)</div>`
      : `<div class="w">${esc(p.text)}</div><div class="s">${p.action === 'sign' && signOk(p) ? 'إشارة: ' + esc(p.sign) + (p.team_approved ? ' — اعتمدها الفريق' : '') : 'تهجئة: ' + esc((p.base || '').split('').join(' - '))}${p.preview_only ? ' — معاينة غير مراجعة' : ''}${err ? ' — لا توجد حركة' : ''}</div>`;
  }

  function start(from) { Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت'; Signer.playList(build(from), onItem); }

  $('play').onclick = () => { if (Signer.paused) { Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت'; } else start(0); };
  $('restart').onclick = () => start(0);
  $('pause').onclick = () => { Signer.paused = !Signer.paused; $('pause').textContent = Signer.paused ? 'متابعة' : 'إيقاف مؤقت'; };
  $('speed').oninput = e => { Signer.speed = +e.target.value; $('sv').textContent = e.target.value + '×'; };
  $('text').onclick = e => { const t = e.target.closest('.t'); if (t) start(+t.dataset.i); };
  pick.onchange = () => { history.replaceState(null, '', '?k=' + pick.value); loadKh(pick.value); };

  await loadKh(pick.value);
  try { await Signer.init($('cv'), 'avatar/man.glb?v=7'); $('now').innerHTML = '<div class="s">جاهز — اضغط تشغيل أو أي كلمة</div>'; }
  catch (e) { $('now').innerHTML = '<div class="s">تعذّر تحميل الأفاتار</div>'; console.error(e); }
})();
