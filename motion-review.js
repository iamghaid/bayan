/* Motion review controller: four-pass checks and hash-bound local decisions.
 * JSON exports preserve reviewer history; decisions do not promote library entries.
 * AI suggestions live in review-assistant.js and never write these records.
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
  let catalog = [], filtered = [], current, notes = {};
  try { notes = JSON.parse(localStorage.getItem(noteKey) || '{}'); } catch { notes = {}; }
  const status = message => { $('status').textContent = message; };
  const decisionLabels={pending:'بانتظار القرار',accepted:'اعتماد المراجع',rejected:'مرفوضة',rework:'إعادة للمراجعة'};
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
    showDecision();
    $('play').disabled = $('pause').disabled = !current || !Signer.ready || current.schema_errors.length > 0;
    if (!current) return status('لا توجد نتائج مطابقة.');
    status(`${current.ar} (#${current.id}) — جاهزة للمعاينة`);
    const metrics = [`إطارات: ${current.frames}`, `مدة الحركة: ${current.seconds} ثانية`, `تتبع إحدى اليدين: ${Math.round(current.tracked_ratio * 100)}%`, `بنية الملف: ${current.schema_errors.length ? 'تحتاج فحصًا' : 'سليمة'}`];
    for (const metric of metrics) { const span = document.createElement('span'); span.textContent = metric; $('metrics').append(span); }
    if ($('showReference').checked) $('reference').src = `/reference/${current.id}.mp4`;
    $('previous').disabled = filtered.indexOf(current) === 0;
    $('next').disabled = filtered.indexOf(current) === filtered.length - 1;
  }
  function filter() {
    const query = $('search').value.trim();
    filtered = catalog.filter(item => /^\d+$/.test(query) ? String(item.id)===query : item.ar.includes(query));
    $('pick').replaceChildren();
    for (const item of filtered) { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.ar} — ${item.id}`; $('pick').append(option); }
    select();
  }
  $('search').oninput = filter; $('pick').onchange = select;
  function move(delta) { if (!current) return; const target = filtered[filtered.indexOf(current) + delta]; if (target) { $('pick').value = target.id; select(); } }
  $('next').onclick = () => move(1); $('previous').onclick = () => move(-1);
  $('showReference').onchange = () => { $('reference').hidden = !$('showReference').checked; select(); };
  $('play').onclick = () => {
    if (!current) return;
    Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت';
    Signer.playList([{motion:current.id}], (_tag, error) => { status(error ? 'تعذر تحميل الحركة.' : `تشغيل معاينة ${current.ar} (#${current.id})`); }, 'sshi_motion/staging/');
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
    catch{$('noteStatus').textContent='تعذر الحفظ؛ لم يُسجل القرار. صدّر الملاحظات قبل المغادرة.';}
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
    await Signer.init($('cv'), 'avatar/man.glb?v=7');
    Signer.reviewSafety = $('safePose').checked;
    filter();
  } catch (error) { status(error.message); }
})();
