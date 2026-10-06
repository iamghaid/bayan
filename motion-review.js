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
  const listNames = {trusted:'معتمد', review:'قيد المراجعة', redesign:'تحتاج إعادة تصميم'};
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
  const fmt = n => n.toLocaleString('en');
  const pct = (n, total) => total ? `${Math.round(n / total * 1000) / 10}%` : '0%';
  function decided(item) {
    if (bank) return Boolean(bank[item.id]);
    const entry = notes[item.id];
    return entry?.motion_sha256 === item.motion_sha256 && Boolean(localLists[entry.decision] || entry.decision === 'rework');
  }
  // Number board: how many motions sit in each bank, and how many a reviewer has actually decided.
  function countViews() {
    const counts = {all: catalog.length, trusted: 0, review: 0, redesign: 0};
    let fromSermons = 0, acceptedByReviewer = 0, decisions = 0;
    for (const item of catalog) {
      const list = listOf(item);
      counts[list]++;
      if (decided(item)) { decisions++; if (list === 'trusted') acceptedByReviewer++; }
      else if (list === 'trusted') fromSermons++;
    }
    $('totalCount').textContent = fmt(counts.all);
    for (const card of document.querySelectorAll('.card')) {
      const view = card.dataset.view;
      card.querySelector('.card-num').textContent = fmt(counts[view]);
      card.querySelector('.card-pct').textContent = view === 'all' ? '' : `${pct(counts[view], counts.all)} من المكتبة`;
      card.setAttribute('aria-pressed', String($('view').value === view));
    }
    document.querySelector('.card[data-view=trusted] .card-sub').textContent = `${fmt(fromSermons)} من الخطب · ${fmt(acceptedByReviewer)} اعتمدتِها`;
    document.querySelector('.card[data-view=all] .card-sub').textContent = `قرارات مسجّلة: ${fmt(decisions)} من ${fmt(counts.all)}`;
    for (const segment of $('bar').children) segment.style.width = pct(counts[segment.dataset.list], counts.all);
    for (const option of $('view').options) option.textContent = option.textContent.replace(/ \(\d+\)$/, '') + ` (${counts[option.value]})`;
    $('boardScope').textContent = bank
      ? 'القرارات من سجل الخادم المحلي (tools/motion_bank.json).'
      : 'القرارات المحفوظة في هذا المتصفح فقط. القرارات النهائية تُسجَّل من الخادم المحلي.';
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
      countViews(); filter(); if (current === item) { showDecision(); showBank(); }
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
    for (const row of $('list').children) row.setAttribute?.('aria-selected', String(current != null && row.dataset.id === String(current.id)));
    $('list').querySelector('[aria-selected=true]')?.scrollIntoView({block: 'nearest'});
    $('position').textContent = current ? `الحركة ${fmt(filtered.indexOf(current) + 1)} من ${fmt(filtered.length)}` : `0 من ${fmt(filtered.length)}`;
    $('reference').pause(); $('reference').removeAttribute('src'); $('reference').load(); $('referenceStatus').textContent = '';
    $('notes').value = current ? notes[current.id]?.note || '' : '';
    for(const [key] of passes)$('pass-'+key).value=current ? notes[current.id]?.passes?.[key] || 'pending' : 'pending';
    $('metrics').replaceChildren(); $('playNote').hidden = true;
    showDecision(); showBank();
    $('play').disabled = $('pause').disabled = !current || !Signer.ready || current.schema_errors.length > 0;
    if (!current) return status('لا توجد نتائج مطابقة.');
    status(`${current.ar} (#${current.id}) — ${current.source === 'staging' ? 'حركة جديدة قيد المراجعة، ' : ''}جاهزة للمعاينة`);
    const metrics = [current.source === 'active' ? `مستخدمة في الخطب: ${current.uses} مرة` : 'حركة جديدة (staging)', current.fidelity != null ? `مطابقة الأفتار لبيانات الفيديو: ${current.fidelity}%${current.signfix ? ' (مصححة يدويًا)' : ''}` : 'مطابقة الأفتار: لم تُقس', `إطارات: ${current.frames}`, `مدة الحركة: ${current.seconds} ثانية`, `تتبع إحدى اليدين: ${Math.round(current.tracked_ratio * 100)}%`, `بنية الملف: ${current.schema_errors.length ? 'تحتاج فحصًا' : 'سليمة'}`];
    for (const metric of metrics) { const span = document.createElement('span'); span.textContent = metric; $('metrics').append(span); }
    if ($('showReference').checked) showReference(current);
    $('previous').disabled = filtered.indexOf(current) === 0;
    $('next').disabled = filtered.indexOf(current) === filtered.length - 1;
  }
  // Reference video: the owner's local copy first, else the public original on sshi.sa (nothing is uploaded).
  function showReference(item) {
    const video = $('reference'), online = item.video ? 'https://sshi.sa/api/file/' + encodeURIComponent(item.video) : '';
    $('referenceStatus').textContent = 'جارٍ تحميل فيديو المصدر…';
    video.onloadeddata = () => { if (current === item) $('referenceStatus').textContent = video.src.startsWith('https://sshi.sa') ? 'فيديو المصدر من مكتبة sshi.sa' : 'فيديو المصدر من نسختك المحلية'; };
    video.onerror = () => {
      if (current !== item || !video.getAttribute('src')) return;
      if (online && video.src !== online) { video.src = online; return; }
      $('referenceStatus').textContent = 'تعذر تحميل فيديو المصدر لهذه الحركة.';
    };
    video.src = location.hostname === '127.0.0.1' || location.hostname === 'localhost' || !online ? `/reference/${item.id}.mp4` : online;
  }
  function filter() {
    const query = $('search').value.trim();
    filtered = catalog.filter(item => (/^\d+$/.test(query) ? String(item.id)===query : item.ar.includes(query)) && inView(item));
    // signfix motions differ from MediaPipe on purpose, and new motions have no measurement yet.
    const weak = item => item.signfix || item.fidelity == null ? 101 : item.fidelity;
    const strong = item => item.signfix || item.fidelity == null ? -1 : item.fidelity;
    const orders = {
      weak: (a, b) => weak(a) - weak(b) || b.uses - a.uses,
      strong: (a, b) => strong(b) - strong(a) || b.uses - a.uses,
      used: (a, b) => b.uses - a.uses || a.id - b.id,
      alpha: (a, b) => a.ar.localeCompare(b.ar, 'ar') || a.id - b.id,
      id: (a, b) => a.id - b.id
    };
    filtered.sort(orders[$('sort').value] || orders.weak);
    const keep = current && filtered.includes(current) ? String(current.id) : null;
    $('pick').replaceChildren();
    const rows = document.createDocumentFragment();
    filtered.forEach((item, index) => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.ar} — ${item.id}`; $('pick').append(option);
      rows.append(listRow(item, index));
    });
    $('list').replaceChildren(rows);
    if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'لا توجد حركات مطابقة.'; $('list').append(empty); }
    if (keep) $('pick').value = keep;
    $('listTitle').textContent = `${document.querySelector(`.card[data-view=${$('view').value}] .card-name`).textContent} · ${fmt(filtered.length)} حركة`;
    select();
  }
  function listRow(item, index) {
    const list = listOf(item);
    const row = document.createElement('button');
    row.type = 'button'; row.className = 'row'; row.dataset.id = item.id; row.setAttribute('role', 'option');
    const cell = (cls, text) => { const span = document.createElement('span'); span.className = cls; if (text != null) span.textContent = text; return span; };
    const name = cell('name', item.ar || '—'); const id = document.createElement('small'); id.textContent = '#' + item.id; name.append(id);
    const chip = cell('chip', listNames[list]); chip.dataset.list = list;
    const fid = cell('fid');
    if (item.fidelity != null) {
      const track = document.createElement('i'), fill = document.createElement('b');
      fill.style.width = Math.max(0, Math.min(100, item.fidelity)) + '%'; track.append(fill);
      fid.append(track, `${Math.round(item.fidelity)}%`);
      if (item.fidelity < 60 && !item.signfix) fid.dataset.low = '';
      if (item.signfix) { const em = document.createElement('em'); em.textContent = 'مصححة يدويًا'; fid.append(em); }
    } else { const em = document.createElement('em'); em.textContent = 'لم تُقس'; fid.append(em); }
    row.append(cell('rank', fmt(index + 1)), name, chip, fid, cell('uses', item.uses ? `${fmt(item.uses)} مرة` : '—'));
    row.onclick = () => { $('pick').value = item.id; select(); };
    return row;
  }
  function setView(view) {
    $('view').value = view;
    $('sort').value = view === 'review' || view === 'redesign' ? 'weak' : 'used';
    countViews(); filter();
  }
  for (const card of document.querySelectorAll('.card')) card.onclick = () => setView(card.dataset.view);
  $('search').oninput = filter; $('view').onchange = () => setView($('view').value); $('pick').onchange = select; $('sort').onchange = filter;
  $('list').onkeydown = event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); } };
  function move(delta) { if (!current) return; const target = filtered[filtered.indexOf(current) + delta]; if (target) { $('pick').value = target.id; select(); } }
  $('next').onclick = () => move(1); $('previous').onclick = () => move(-1);
  $('showReference').onchange = () => { $('reference').hidden = !$('showReference').checked; select(); };
  $('play').onclick = () => {
    if (!current) return;
    Signer.paused = false; $('pause').textContent = 'إيقاف مؤقت';
    const item = current;
    Signer.playList([{motion:item.id}], (_tag, error) => {
      status(error ? 'تعذر تحميل الحركة.' : `تشغيل معاينة ${item.ar} (#${item.id})`);
      if (error && item.source === 'staging' && current === item) {
        $('playNote').textContent = 'ملف هذه الحركة غير موجود على الموقع بعد. فيديو المصدر متاح للمقارنة.';
        $('playNote').hidden = false;
      }
    }, item.source === 'active' ? 'sshi_motion/m/' : 'sshi_motion/staging/');
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
    if(decision){countViews();if(!bank)filter();sendDecision(decision);}
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
    countViews(); filter();   // numbers and list first, so they show even while the avatar loads
    await Signer.init($('cv'), 'avatar/man.glb?v=7');
    Signer.reviewSafety = $('safePose').checked;
    select();
  } catch (error) { status(error.message); }
})();
