// مترجم الخطبة بلغة الإشارة — منطق المطابقة والامتناع والتزامن + تشغيل الأفاتار (CWASA)
const SAMPLE='الحمد لله رب العالمين، والصلاة والسلام على رسول الله. أيها المسلمون، اتقوا الله، واعلموا أن الله يحب المحسنين، ويغفر لمن تاب إليه. وأحسنوا إلى الوالدين، وحافظوا على العائلة. وأنفقوا من المال في سبيل الله، وأعطوا الفقير، وساعدوا المحتاج، واشكروا الله على نعمه. وتذكروا الموت ويوم القيامة، واعملوا للجنة، واحذروا النار. وأقيموا الصلاة وآتوا الزكاة.';
const STATUS={verified:'مُراجَع',pending:'بانتظار المراجعة',ambiguous:'ملتبس — امتناع'};
const $=id=>document.getElementById(id);

// ---------- تطبيع العربية ----------
function norm(s){return s.replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[^\u0621-\u064A ]/g,'').trim();}
function cands(t){
  const out=new Set([t]);
  if(/^[وف]/.test(t)&&t.length>3) out.add(t.slice(1));
  for(const x of [...out]){
    if(x.startsWith('لل')&&x.length>3) out.add('ال'+x.slice(2));
    if(/^[بلك]/.test(x)&&x.length>3) out.add(x.slice(1));
  }
  for(const x of [...out]) if(x.startsWith('ال')&&x.length>4) out.add(x.slice(2));
  return [...out];
}

// ---------- القاموس ----------
let LEX=[],WORD=new Map(),PHRASE=new Map(),sigmlCache={};
async function loadLexicon(){
  const r=await fetch('lexicon.json',{cache:'no-store'});
  LEX=(await r.json()).terms;
  WORD.clear();PHRASE.clear();
  for(const e of LEX){ for(const v of e.variants) WORD.set(norm(v),e); for(const p of (e.phrases||[])) PHRASE.set(norm(p),e); }
}
// الإشارة تُعرض فقط إذا: المصطلح مُراجَع شرعيًا + له ملف SiGML + حركة الأفاتار مُراجَعة
const demo=()=>document.getElementById('demo').checked;
// العرض التجريبي: يشغّل إشارات غير مُراجَعة لإثبات عمل النظام فقط، ويمتنع دائمًا عن الملتبس
// الفيديو البشري (KArSL) له الأولوية على الأفاتار عند توفره
// أفاتار فقط: لا تبديل بين الفيديو والأفاتار أثناء الخطبة (كان يقطع الأداء)
const AVATAR_ONLY=true;
const videoOk=e=>!AVATAR_ONLY&&e.status!=='ambiguous'&&e.video&&(demo()||(e.status==='verified'&&e.video_reviewed));
const playable=e=>videoOk(e)||(e.status!=='ambiguous'&&e.sigml&&(demo()||(e.status==='verified'&&e.sign_reviewed)));
async function getSigml(e){
  if(!sigmlCache[e.id]){
    const r=await fetch('sigml/'+e.sigml);   // الملفات داخل مجلد sigml/
    if(!r.ok) throw new Error('missing '+e.sigml);
    sigmlCache[e.id]=await r.text();
  }
  return sigmlCache[e.id];
}
// مدة تقديرية للإشارة: عدد الإشارات داخل الملف × 1.4 ثانية
const signDuration=txt=>Math.max(1500,((txt.match(/<hns_sign|<hamgestural_sign/g)||[]).length||1)*1400);

// ---------- الأفاتار ----------
let avatarReady=false;
function initAvatar(){
  if(typeof CWASA==='undefined'){ setState('idle','تعذّر تحميل محرك الأفاتار — تحقق من الاتصال بالإنترنت'); return; }
  // حركة محيطية (تنفّس وحركة خفيفة) أثناء الإشارة وبعدها حتى لا يبدو الأفاتار متجمّدًا
  CWASA.init({ambIdle:true,ambSign:true,avSettings:{initAv:'marc',ambIdle:true,ambSign:true}});
  CWASA.addHook('avatarsign',onAvatarSign,0);
  CWASA.addHook('animidle',onAvatarIdle,0);
  avatarReady=true; setState('idle','الأفاتار جاهز — اضغط تشغيل');
}
function playOnAvatar(txt){
  if(!avatarReady||typeof CWASA.playSiGMLText!=='function') return false;
  CWASA.playSiGMLText(txt,0); return true;
}

// ---------- الأداء المتصل (جملة بجملة، مثل المترجم البشري) ----------
// إشارات الجملة الواحدة تُجمع في تسلسل واحد يؤديه الأفاتار دفعة واحدة، فينتقل من إشارة إلى التي تليها
// دون العودة لوضع الراحة، ثم يتوقف توقفًا طبيعيًا (مع حركة التنفّس) حتى الجملة التالية.
// النص يسير بسرعته الطبيعية ولا يتجاوز كلمة لم يصلها الأفاتار بعد.
let cont=null;   // {map: رقم الإشارة ← رقم الكلمة, cur: الكلمة الحالية, sent: رقم الجملة}
let doneSent=new Set();
const sigInner=txt=>txt.replace(/^[\s\S]*?<sigml[^>]*>/i,'').replace(/<\/sigml>[\s\S]*$/i,'');
const isSigned=it=>it.match&&playable(it.match)&&it.match.sigml;
async function buildSequence(sent){
  const parts=[],map=[];
  for(let k=0;k<items.length;k++){
    const it=items[k],e=it.match;
    if(it.sent!==sent||!isSigned(it)) continue;
    let txt; try{ txt=await getSigml(e); }catch(err){ continue; }
    const inner=sigInner(txt), n=(inner.match(/<hns_sign|<hamgestural_sign/g)||[]).length||1;
    parts.push(inner); for(let j=0;j<n;j++) map.push(k);
  }
  return {sigml:'<sigml>'+parts.join('\n')+'</sigml>',map};
}
// أين يجب أن يتوقف النص منتظرًا الأفاتار: بداية الكلمة المُشار إليها التالية
function contCap(){
  if(!cont) return Infinity;
  if(performance.now()-cont.seen>7000) return Infinity;   // أمان: لو صمت المحرك لا يتجمد النص
  const from=cont.cur>=0?cont.cur:cont.map[0]-1;
  for(let k=from+1;k<items.length;k++) if(isSigned(items[k])) return items[k].start-1;   // قبلها مباشرة، فلا تُفعَّل حتى يصلها الأفاتار
  return Infinity;
}
function onAvatarSign(evt){
  if(!cont) return;
  const k=cont.map[evt.msg.s]; if(k===undefined) return;
  cont.cur=k; cont.seen=performance.now();
  if(t<items[k].start) t=items[k].start+1;       // النص يلحق بالأفاتار
  activeId=k; showActive(items[k]); update();
}
function onAvatarIdle(){ if(cont&&cont.cur>=0&&cont.cur===cont.map[cont.map.length-1]) cont=null; }   // انتهى التسلسل
// عرض حالة الكلمة الحالية دون تشغيل شيء (الأفاتار يعمل بالتسلسل المتصل)
function showActive(it){
  const e=it.match;$('gloss').textContent=e.status==='ambiguous'?'امتناع':e.gloss;
  if(e.status==='ambiguous'){setState('ambiguous','«'+e.gloss+'»: '+e.note);return;}
  if(!playable(e)||!e.sigml){ setState('pending',(e.note?e.note+' — ':'')+'لا توجد إشارة لهذا المصطلح في القاموس — نص فقط'); return; }
  const reviewed=e.status==='verified'&&e.sign_reviewed;
  setState(reviewed?'verified':'pending',reviewed?'الأفاتار يؤدي الإشارة المعتمدة':'عرض تجريبي: إشارة جزائرية غير مُراجَعة — لا تُعتمد');
}
async function startContinuous(sent){
  if(doneSent.has(sent)) return false;
  doneSent.add(sent);
  const seq=await buildSequence(sent);
  if(!seq.map.length) return false;
  cont={map:seq.map,cur:-1,sent,seen:performance.now()+3000};   // مهلة لتجهيز التسلسل
  CWASA.playSiGMLText(seq.sigml,0);
  return true;
}
function stopContinuous(){ if(cont){ doneSent.delete(cont.sent); cont=null; try{ CWASA.stopSiGML(0); }catch(e){} } }

// ---------- التحليل ----------
let items=[],total=0,t=0,playing=false,last=0,holdUntil=0,activeId=null;
function analyze(text){
  const toks=text.split(/\s+/).filter(Boolean);
  items=[];let clock=0,i=0,sent=0;
  while(i<toks.length){
    let match=null,span=1;
    if(i+1<toks.length){ const n2=norm(toks[i+1]); for(const c of cands(norm(toks[i]))){ const e=PHRASE.get(c+' '+n2); if(e){match=e;span=2;break;} } }
    if(!match) for(const c of cands(norm(toks[i]))){ const e=WORD.get(c); if(e){match=e;break;} }
    const txt=toks.slice(i,i+span).join(' ');
    const dur=span*260+norm(txt).length*55;
    items.push({txt,start:clock,dur,match,sent});clock+=dur;i+=span;
    if(/[.!?؟]$/.test(txt)) sent++;   // نهاية جملة
  }
  total=clock;t=0;activeId=null;render();update();
}
function render(){
  $('transcript').innerHTML='';
  items.forEach(it=>{
    const s=document.createElement('span');s.className='tok'+(it.match?' m-'+it.match.status:'');s.textContent=it.txt;s.tabIndex=0;
    s.onclick=()=>{t=it.start;activeId=null;update();};it.el=s;$('transcript').append(s,' ');
  });
  const m=items.filter(it=>it.match),n=f=>m.filter(f).length;
  $('stats').innerHTML=[[items.length,'مقطع نصي'],[n(it=>playable(it.match)),'إشارة تُؤدّى'],[n(it=>it.match.status!=='ambiguous'&&!playable(it.match)),'نص فقط'],[n(it=>it.match.status==='ambiguous'),'امتناع']]
    .map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}
function setState(cls,msg){$('state').className='state '+cls;$('state').textContent=msg;}
async function onActive(it){
  // الأداء المتصل: أول كلمة مُشار إليها في الجملة تبدأ تسلسل الجملة كاملة
  if(avatarReady&&playing&&isSigned(it)&&!cont){ showActive(it); await startContinuous(it.sent); return; }
  if(cont){ if(!isSigned(it)) showActive(it); return; }
  const e=it.match;$('gloss').textContent=e.status==='ambiguous'?'امتناع':e.gloss;
  if(e.status==='ambiguous'){setState('ambiguous','«'+e.gloss+'»: '+e.note);return;}
  if(!playable(e)){
    if(!e.sigml) setState('pending',(e.note?e.note+' — ':'')+'لا توجد إشارة لهذا المصطلح في القاموس — نص فقط');
    else if(e.status!=='verified') setState('pending','الإشارة موجودة لكن المصطلح بانتظار المراجعة — نص فقط (فعّل العرض التجريبي لمشاهدتها)');
    else setState('pending','الإشارة موجودة لكن الحركة لم تُراجَع — نص فقط (فعّل العرض التجريبي لمشاهدتها)');
    return;
  }
  const v=$('vid');
  if(videoOk(e)){
    v.src=e.video;v.hidden=false;v.currentTime=0;
    const reviewed=e.status==='verified'&&e.video_reviewed;
    setState(reviewed?'verified':'pending',reviewed?'مترجم بشري (KArSL) — إشارة معتمدة':'عرض تجريبي: مقطع KArSL غير مُراجَع — لا يُعتمد');
    if($('wait').checked&&playing) holdUntil=Infinity;
    v.play().catch(()=>{v.hidden=true;holdUntil=0;setState('pending','تعذّر تشغيل '+e.video+' — تأكد من وجود الملف');});
    return;
  }
  v.hidden=true;v.pause();
  try{
    const txt=await getSigml(e);
    const ok=playOnAvatar(txt);
    if(ok){
      const reviewed=e.status==='verified'&&e.sign_reviewed;
      setState(reviewed?'verified':'pending',reviewed?'الأفاتار يؤدي الإشارة المعتمدة':'عرض تجريبي: إشارة جزائرية غير مُراجَعة — لا تُعتمد');
      if($('wait').checked&&playing) holdUntil=performance.now()+signDuration(txt);
    } else setState('pending','الأفاتار غير جاهز — نص فقط');
  }catch(err){ setState('pending','تعذّر تحميل ملف الإشارة '+e.sigml+' — نص فقط'); }
}
function update(){
  let cur=-1; items.forEach((it,k)=>{if(t>=it.start)cur=k;});
  items.forEach((it,k)=>{it.el.classList.toggle('now',k===cur&&t>0);it.el.classList.toggle('past',k<cur);});
  const it=cur>=0?items[cur]:null;
  if(t>0&&it&&it.match&&activeId!==cur){activeId=cur;onActive(it);}
  if(t>0&&it&&!it.match&&activeId!==null&&t>items[activeId].start+items[activeId].dur+900){activeId=null;$('gloss').textContent='—';setState('idle','لا مصطلح شرعي هنا — التعليق النصي مستمر');}
  const a=Math.max(0,cur-4),b=Math.min(items.length,cur+5);
  $('caption').textContent=cur>=0&&t>0?items.slice(a,b).map(x=>x.txt).join(' '):'\u00a0';
}
function loop(now){
  if(!playing)return;
  if(now>=holdUntil) t=Math.min(t+now-last,Math.max(t,contCap())); last=now;   // في الأداء المتصل ينتظر النص الأفاتار
  if(t>=total){t=total;playing=false;$('play').textContent='تشغيل';}
  update(); if(playing) requestAnimationFrame(loop);
}

document.addEventListener('DOMContentLoaded',()=>{$('vid').addEventListener('ended',()=>{holdUntil=0;$('vid').hidden=true;});$('vid').addEventListener('error',()=>{holdUntil=0;});});
// ---------- جدول القاموس ----------
function renderLex(){
  $('lex').innerHTML=LEX.map(e=>`<tr>
    <td><b>${e.gloss}</b>${e.note?`<br><small>${e.note}</small>`:''}</td>
    <td>${[...(e.phrases||[]),...e.variants].join('، ')}</td>
    <td><span class="badge ${e.status}">${STATUS[e.status]}</span></td>
    <td>${e.karsl_id?`KArSL #${e.karsl_id}${e.karsl_note?`<br><small>${e.karsl_note}</small>`:''}`:(e.sigml?(e.source||e.sigml):'<span class="missing">غير موجود</span>')}</td>
    <td>${e.sigml?(e.sign_reviewed?'✓ مُراجَعة':'<span class="missing">لم تُراجَع</span>'):'—'}</td>
    <td>${e.sigml?`<button data-prev="${e.id}">معاينة</button>`:''}</td></tr>`).join('');
}
$('lex').addEventListener('click',async ev=>{
  const id=ev.target.dataset.prev; if(!id) return;
  const e=LEX.find(x=>x.id===id);
  try{ const txt=await getSigml(e); if(!playOnAvatar(txt)) alert('الأفاتار غير جاهز'); $('gloss').textContent=e.gloss; setState(e.sign_reviewed?'verified':'pending',e.sign_reviewed?'معاينة إشارة مُراجَعة':'معاينة — هذه الحركة لم تُراجَع بعد'); }
  catch(err){ alert('تعذّر تحميل '+e.sigml); }
});

// ---------- أحداث ----------
$('play').onclick=async()=>{
  if(playing){playing=false;stopContinuous();$('play').textContent='تشغيل';return;}
  if(t>=total){t=0;activeId=null;}
  if(t===0) doneSent.clear();
  playing=true;holdUntil=0;$('play').textContent='إيقاف مؤقت';
  last=performance.now();requestAnimationFrame(loop);
};
$('demo').onchange=()=>{render();update();};
$('restart').onclick=()=>{stopContinuous();doneSent.clear();t=0;activeId=null;holdUntil=0;if(playing){playing=false;$('play').textContent='تشغيل';}update();};
$('analyze').onclick=()=>{playing=false;$('play').textContent='تشغيل';const v=$('custom').value.trim();if(v)analyze(v);};
$('testPlay').onclick=()=>{ const v=$('sigmlTest').value.trim(); if(!v) return; if(!playOnAvatar(v)) alert('الأفاتار غير جاهز بعد'); };

window.addEventListener('load',async()=>{
  initAvatar();
  try{ await loadLexicon(); }catch(e){ setState('idle','تعذّر تحميل lexicon.json — شغّل المشروع عبر خادم محلي (انظر README)'); return; }
  $('custom').value=SAMPLE; renderLex(); analyze(SAMPLE);
});
