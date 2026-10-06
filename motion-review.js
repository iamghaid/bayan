/* Motion review controller: four-pass checks and hash-bound decisions.
 * Three banks: trusted (accepted, plus the sermon motions by default), review (new motions not yet
 * compared with the source video, or returned for another comparison) and redesign (rejected; must be rebuilt). Decisions are kept in this
 * browser; on the owner's local server they also go to tools/motion_bank.py, which moves
 * accepted motions into the sermon translations and asks the AI assistant how to fix the rest.
 */
(async () => {
  const $ = id => document.getElementById(id);
  const noteKey = 'bayan-motion-review-notes-v1';
  const passes = [
    ['joints','١. حركة المفاصل والأصابع','اتجاه الرسغ، ثني المرفق، شكل الأصابع، والانتقال بين الإطارات.'],
    ['clarity','٢. الوضوح للمشاهد','ظهور الكفين والأصابع بحجم واضح ومن دون حجب الوجه.'],
    ['fidelity','٣. الدقة مقابل المصدر','شكل اليد واتجاهها ومسارها والتلامس والتوقيت؛ يحتاج مقارنة مرجعية ومراجعة المختص.'],
    ['depth','٤. العمق والتداخل','اليدان أمام الجسم؛ راجع تقاطع الجلد والأصابع. التلامس المقصود في المصدر يُحفظ.']
  ];
  const passPanel=document.createElement('section');
  passPanel.className='review-passes';
  const heading=document.createElement('h2');heading.textContent='أربع مراجعات مستقلة لكل حركة';passPanel.append(heading);
  for(const [key,title,hint] of passes){
    const label=document.createElement('label');label.textContent=title+' ';
    const select=document.createElement('select');select.id='pass-'+key;
    for(const [value,text] of [['pending','لم تُراجع'],['issue','يوجد عيب'],['checked','فُحص هذا الجانب']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
    const small=document.createElement('small');small.textContent=hint;label.append(select,document.createElement('br'),small);passPanel.append(label);
  }
  const disclaimer=document.createElement('p');disclaimer.textContent='افحص الجوانب الأربعة وسجّل توقيت أي ملاحظة قبل اختيار القرار.';passPanel.append(disclaimer);
  $('notes').closest('section').before(passPanel);
  let catalog = [], filtered = [], current, notes = {}, bank = null;
  const listNames = {trusted:'معتمد', review:'قيد المراجعة', redesign:'يحتاج مراجعة (إعادة تصميم)'};
  const localLists = {accepted:'trusted', rejected:'redesign'};
  // Sermon motions stay trusted and playing until a reviewer decides otherwise; new ones start under review.
  function listOf(item) {
    const fallback = item.source === 'active' ? 'trusted' : 'review';
    if (bank) return bank[item.id]?.list || fallback;
    const entry = notes[item.id];
    return entry?.motion_sha256 === item.motion_sha256 && (localLists[entry.decision] || 'review') || fallback;
  }
  function showBank() {
    const record = current && bank?.[current.id];
    $('bankBox').hidden = !record;
    if (!record) return;
    $('bankBox').dataset.list = record.list;
    $('bankTitle').textContent = `${listNames[record.list] || record.list} · ${new Date(record.at).toLocaleString('ar')}`;
    const result = record.result;
    $('bankResult').textContent = record.list === 'trusted'
      ? `رُبطت بالكلمات: ${result?.words?.join('، ') || 'لا كلمات جديدة'} · مواضع في الخطب: ${result?.sermon_items ?? 0}${result?.conflicts?.length ? ` · كلمات مربوطة سابقًا بإشارة أخرى (لم تتغير): ${result.conflicts.join('، ')}` : ''}`
      : `ملاحظة المراجع: ${record.note || 'لا توجد'}`;
    $('bankSuggestion').textContent = record.list !== 'trusted'
      ? (record.suggestion ? 'اقتراح المساعد للتصحيح (لا يشاهد الفيديو؛ تحقّق قبل التطبيق):\n' + record.suggestion : `لم يصل اقتراح المساعد: ${record.suggestion_error || 'جارٍ الطلب…'}`)
      : '';
  }
  function inView(item) {
    const view = $('view').value;
    return view === 'all' || listOf(item) === view;
  }
  function countViews() {
    const counts = {all: catalog.length, trusted: 0, review: 0, redesign: 0};
    for (const item of catalog) counts[listOf(item)]++;
    for (const option of $('view').options) option.textContent = option.textContent.replace(/ \(\d+\)$/, '') + ` (${counts[option.value]})`;
  }
  async function sendDecision(decision) {
    if (!bank || !current) return;
    const item = current;
    for (const id of ['acceptMotion','rejectMotion','reworkMotion']) $(id).disabled = true;
    $('noteStatus').textContent = decision === 'accepted' ? 'جارٍ نقلها إلى «معتمد» وترجمة الخطب…' : 'جارٍ حفظ القرار وطلب اقتراح المساعد للتصحيح…';
    try {
      const response = await fetch('/api/decision', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:item.id, decision, note:$('notes').value, motion_sha256:item.motion_sha256, passes:Object.fromEntries(passes.map(([key])=>[key,$('pass-'+key).value]))})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'تعذر تحديث بنك الإشارات.');
      bank[item.id] = result;
      $('noteStatus').textContent = result.list === 'trusted' ? `أضيفت «${result.ar}» إلى «معتمد» (${result.result.sermon_items} موضعًا جديدًا في الخطب).` : `أضيفت «${result.ar}» إلى «${listNames[result.list]}».`;
    } catch (error) {
      $('noteStatus').textContent = `حُفظ القرار في المتصفح فقط: ${error.message}`;
    } finally {
      countViews(); if (current === item) { showDecision(); showBank(); }
    }
  }
  try { notes = JSON.parse(localStorage.getItem(noteKey) || '{}'); } catch { notes = {}; }
  const status = message => { $('status').textContent = message; };
  const decisionLabels={pending:'قيد المراجعة',accepted:'معتمد',rejected:'يحتاج مراجعة (إعادة تصميم)',rework:'قيد المراجعة (أُعيدت للمقارنة)'};
  function showDecision(){
    const entry=current && notes[current.id];
    const stale=entry?.motion_sha256 && entry.motion_sha256!==current.motion_sha256;
    const decision=stale?'pending':entry?.decision||'pending';
    $('decisionStatus').textContent=stale?'تغيّر ملف الحركة؛ تحتاج قرارًا جديدًا.':decisionLabels[decision];
    $('decisionStatus').dataset.decision=decision;
    for(const id of ['acceptMotion','rejectMotion','reworkMotion'])$(id).disabled=!current;
    $('acceptMotion').disabled=!current || current.schema_errors.length>0;
  }
  $('safePose').onchange = () => { Signer.reviewSafety = $('safePose').checked; };
  setInterval(() => {
    const p = Signer.poseDiagnostics;
    const warnings = p ? [p.behind.length ? 'اليد خلف مستوى الكتف' : '', p.outside.length ? 'اليد قرب حدود الشاشة أو خارجها' : '', p.overlap_warning ? `تداخل محتمل ${p.overlap_mm} مم` : ''].filter(Boolean) : [];
    $('poseStatus').textContent = Signer.reviewSafety ? `حماية اليدين مفعّلة · تصحيحات الموضع: ${Signer.safetyCorrections}${warnings.length ? ' · تنبيه: ' + warnings.join('، ') : ''}` : 'حماية المعاينة متوقفة للمقارنة';
  }, 250);
  function select() {
    Signer.stop(); Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت';
    current = filtered.find(item => String(item.id) === $('pick').value);
    $('reference').pause(); $('reference').removeAttribute('src'); $('reference').load();
    $('notes').value = current ? notes[current.id]?.note || '' : '';
    for(const [key] of passes)$('pass-'+key).value=current ? notes[current.id]?.passes?.[key] || 'pending' : 'pending';
    $('metrics').replaceChildren();
    showDecision(); showBank();
    $('play').disabled = $('pause').disabled = !current || !Signer.ready || current.schema_errors.length > 0;
    if (!current) return status('لا توجد نتائج مطابقة.');
    status(`${current.ar} (#${current.id}) — جاهزة للمعاينة`);
    const metrics = [current.source === 'active' ? `مستخدمة في الخطب: ${current.uses} مرة` : 'حركة جديدة (staging)', current.fidelity != null ? `مطابقة الأفتار لبيانات الفيديو: ${current.fidelity}%${current.signfix ? ' (مصححة يدويًا)' : ''}` : 'مطابقة الأفتار: لم تُقس', `إطارات: ${current.frames}`, `مدة الحركة: ${current.seconds} ثانية`, `تتبع إحدى اليدين: ${Math.round(current.tracked_ratio * 100)}%`, `بنية الملف: ${current.schema_errors.length ? 'تحتاج فحصًا' : 'سليمة'}`];
    for (const metric of metrics) { const span = document.createElement('span'); span.textContent = metric; $('metrics').append(span); }
    if ($('showReference').checked) $('reference').src = `/reference/${current.id}.mp4`;
    $('previous').disabled = filtered.indexOf(current) === 0;
    $('next').disabled = filtered.indexOf(current) === filtered.length - 1;
  }
  function filter() {
    const query = $('search').value.trim();
    filtered = catalog.filter(item => (/^\d+$/.test(query) ? String(item.id)===query : item.ar.includes(query)) && inView(item));
    // Under review: weakest match with the source video first, so the worst are compared first.
    if ($('view').value === 'review') {
      const rank = item => item.signfix || item.fidelity == null ? 101 : item.fidelity;   // signfix motions differ from MediaPipe on purpose
      filtered.sort((a, b) => rank(a) - rank(b) || b.uses - a.uses);
    }
    $('pick').replaceChildren();
    for (const item of filtered) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.ar} — ${item.id}`; $('pick').append(option); }
    select();
  }
  $('search').oninput = filter; $('view').onchange = filter; $('pick').onchange = select;
  function move(delta) { if (!current) return; const target = filtered[filtered.indexOf(current) + delta]; if (target) { $('pick').value = target.id; select(); } }
  $('next').onclick = () => move(1); $('previous').onclick = () => move(-1);
  $('showReference').onchange = () => { $('reference').hidden = !$('showReference').checked; select(); };
  $('play').onclick = () => {
    if (!current) return;
    Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت';
    Signer.playList([{motion:current.id}], (_tag, error) => { status(error ? 'تعذر تحميل الحركة.' : `تشغيل معاينة ${current.ar} (#${current.id})`); }, current.source === 'active' ? 'sshi_motion/m/' : 'sshi_motion/staging/');
  };
  $('pause').onclick = () => { Signer.paused = !Signer.paused; $('pause').textContent = Signer.paused ? 'متابعة' : 'إيقاف مؤقت'; };
  $('speed').onchange = () => { Signer.speed = Number($('speed').value); };
  function saveReview(decision){
    if(!current)return;
    const old=notes[current.id]||{};
    const next={...old,id:current.id,ar:current.ar,note:$('notes').value,pose:Signer.poseDiagnostics,safety_enabled:Signer.reviewSafety,updated_at:new Date().toISOString(),motion_sha256:current.motion_sha256,approval:'not_approved',passes:Object.fromEntries(passes.map(([key])=>[key,$('pass-'+key).value]))};
    if(old.motion_sha256 && old.motion_sha256!==current.motion_sha256)next.decision='pending';
    if(decision){next.decision=decision;next.decision_at=next.updated_at;next.history=[...(old.history||[]),{decision,at:next.updated_at,motion_sha256:current.motion_sha256}];}
    const updated={...notes,[current.id]:next};
    try{localStorage.setItem(noteKey,JSON.stringify(updated));notes=updated;showDecision();$('noteStatus').textContent=decision?'حُفظ القرار والملاحظة محليًا.':'حُفظت الملاحظة محليًا.';}
    catch{$('noteStatus').textContent='تعذر الحفظ؛ لم يُسجل القرار. صدّر الملاحظات قبل المغادرة.';return;}
    if(decision){countViews();sendDecision(decision);}
  }
  $('save').onclick=()=>saveReview();
  $('acceptMotion').onclick=()=>{
    if(!current || current.schema_errors.length)return;
    if(passes.some(([key])=>$('pass-'+key).value!=='checked')){$('noteStatus').textContent='للاعتماد، أكمل المراجعات الأربع واختر «فُحص هذا الجانب» لكل منها بعد التحقق.';return;}
    saveReview('accepted');
  };
  $('rejectMotion').onclick=()=>saveReview('rejected');
  $('reworkMotion').onclick=()=>saveReview('rework');
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], {type:'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'bayan-motion-review-notes.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  try {
    let response = await fetch('/api/catalog'); if (!response.ok) response = await fetch('review-catalog.json'); if (!response.ok) throw Error('تعذر تحميل سجل المراجعة.');
    catalog = await response.json();
    for (const item of catalog) { item.uses ??= 0; item.schema_errors ??= []; }
    try {
      const bankResponse = await fetch('/api/bank');
      if (bankResponse.ok) {
        bank = (await bankResponse.json()).records;
        $('bankNote').textContent = 'الخادم المحلي: الاعتماد ينقل الحركة إلى «معتمد» وترجمة الخطب، والرفض يضعها في «يحتاج مراجعة» مع اقتراح المساعد. انشر الموقع ليظهر التحديث للجميع.';
      }
    } catch {}
    await Signer.init($('cv'), 'avatar/man.glb?v=7');
    Signer.reviewSafety = $('safePose').checked;
    countViews(); filter();
  } catch (error) { status(error.message); }
})();
