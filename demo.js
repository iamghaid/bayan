/* Short-clip demo: transcription -> editable text -> conservative sign plan. */
(() => {
  const $ = id => document.getElementById(id);
  let busy = false;
  let audioURL;
  let recordedFile, recorder, recordingTimer, microphone;
  function preview(file) {
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = URL.createObjectURL(file); $('audioPreview').src = audioURL;
    $('transcript').value = '';
  }
  $('record').onclick = async () => {
    if (busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return status('التسجيل غير مدعوم في هذا المتصفح؛ يمكنك رفع ملف صوت.');
    $('record').disabled = true;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({audio:true});
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = mime ? new MediaRecorder(microphone, {mimeType:mime}) : new MediaRecorder(microphone);
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        clearTimeout(recordingTimer); microphone.getTracks().forEach(track => track.stop());
        const type = recorder.mimeType.split(';')[0];
        const extension = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
        recordedFile = new File(chunks, `bayan-recording.${extension}`, {type});
        preview(recordedFile); $('audioInput').value = '';
        $('record').disabled = false; $('stopRecord').disabled = true; $('audioInput').disabled = false; $('transcribe').disabled = false; $('prepare').disabled = false;
        $('recordStatus').textContent = 'انتهى التسجيل؛ استمع إليه ثم اضغط تفريغ الصوت.';
      };
      recorder.start();
      $('stopRecord').disabled = false; $('audioInput').disabled = true; $('transcribe').disabled = true; $('prepare').disabled = true;
      $('recordStatus').textContent = 'جارٍ التسجيل… يتوقف تلقائيًا بعد دقيقة. التسجيل محلي حتى تضغط تفريغ الصوت.';
      recordingTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 60000);
    } catch {
      microphone?.getTracks().forEach(track => track.stop()); $('record').disabled = false;
      status('تعذر بدء التسجيل. اسمح للميكروفون أو ارفع ملفًا صوتيًا.');
    }
  };
  $('stopRecord').onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
  window.addEventListener('pagehide', () => { microphone?.getTracks().forEach(track => track.stop()); clearTimeout(recordingTimer); });
  function status(message) { $('demoStatus').textContent = message; }
  // Browser recordings are WEBM/MP4, which Gemini may reject; send 16 kHz mono WAV instead.
  async function toWav(file) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context || !window.OfflineAudioContext) return null;
    const context = new Context();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const rate = 16000, length = Math.ceil(decoded.duration * rate);
      if (!length || 44 + length * 2 > 4 * 1024 * 1024) return null;
      const offline = new OfflineAudioContext(1, length, rate);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const samples = (await offline.startRendering()).getChannelData(0);
      const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
      const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVEfmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, samples.length * 2, true);
      samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
      return new Blob([view], {type: 'audio/wav'});
    } catch { return null; }
    finally { context.close(); }
  }
  async function request(path, options) {
    let response;
    try { response = await fetch(path, options); }
    catch { throw Error('تعذر الاتصال بخادم بيان. شغّل python tools/demo_server.py واترك نافذة PowerShell مفتوحة، ثم حاول مجددًا.'); }
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('شغّل خادم التجربة المحلي كما هو موضح في README.');
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'تعذرت المعالجة.');
    return result;
  }
  async function run(task) {
    if (busy) return;
    busy = true;
    $('transcribe').disabled = $('prepare').disabled = $('audioInput').disabled = true;
    try { await task(); } catch (error) { status(error.message); }
    finally { busy = false; $('transcribe').disabled = $('prepare').disabled = $('audioInput').disabled = false; }
  }
  $('audioInput').onchange = () => {
    recordedFile = null;
    const file = $('audioInput').files[0];
    if (audioURL) URL.revokeObjectURL(audioURL);
    $('audioPreview').removeAttribute('src');
    $('transcript').value = '';
    if (file) { audioURL = URL.createObjectURL(file); $('audioPreview').src = audioURL; }
    status('اختر تفريغ الصوت، ثم راجع النص قبل إعداد الإشارات.');
  };
  $('transcribe').onclick = () => run(async () => {
    const file = recordedFile || $('audioInput').files[0];
    if (!file || !file.size || file.size > 4 * 1024 * 1024) throw Error('اختر تسجيلًا لا يتجاوز 4 ميغابايت.');
    const types = {mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', webm:'audio/webm', ogg:'audio/ogg', flac:'audio/flac'};
    const mime = types[file.name.split('.').pop().toLowerCase()];
    if (!mime) throw Error('اختر MP3 أو WAV أو M4A أو WEBM أو OGG أو FLAC.');
    status('جارٍ تفريغ الصوت…');
    const wav = ['audio/webm', 'audio/mp4'].includes(mime) ? await toWav(file) : null;
    const result = await request('/api/transcribe', {method:'POST', headers:{'Content-Type':wav ? 'audio/wav' : mime}, body:wav || file});
    $('transcript').value = result.text;
    status(result.text ? 'راجع النص، خصوصًا الآيات والأسماء والنفي، ثم أعد الإشارات.' : 'لم ينتج التفريغ كلامًا. جرّب تسجيلًا أوضح.');
    if (result.text && $('autoPrepare').checked) await preparePlan();
  });
  async function preparePlan() {
    status('جارٍ مطابقة النص مع المكتبة وسجل المراجعة المحلي…');
    const result = await request('/api/plan', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:$('transcript').value, preview_unreviewed:$('previewUnreviewed').checked})});
    if (typeof window.BayanLoadPlan !== 'function') throw Error('انتظر اكتمال تحميل الأفتار ثم حاول مجددًا.');
    window.BayanLoadPlan(result);
    const list = $('demoSources'); list.replaceChildren();
    for (const item of result.plan) {
      const li = document.createElement('li');
      li.textContent = item.text + ' — ' + (item.action === 'quran' ? 'آية: نص فقط' : item.preview_only ? 'معاينة غير مراجعة' : item.action === 'sign' ? 'مطابقة في سجل المراجعة المحلي' : item.how === 'suffix-suggestion' ? 'اقتراح لصيغة الكلمة؛ يحتاج مراجعة ولن يُشغّل' : item.reason === 'ambiguous' ? 'مطابقة ملتبسة؛ لن تُشغّل' : 'تحتاج مراجعة؛ لن تُشغّل');
      for (const source of item.sources) {
        const span = document.createElement('span');
        span.textContent = ` | ${source.sign} (#${source.id}) · ${source.motion ? 'حركة موجودة' : 'حركة غير متوفرة'} · `;
        const link = document.createElement('a'); link.href = source.source; link.textContent = 'مكتبة المصدر'; link.target = '_blank'; link.rel = 'noopener noreferrer';
        li.append(span, link);
      }
      list.append(li);
      if (item.morphology) {
        const evidence = document.createElement('li');
        evidence.textContent = `${item.text} — تحليل صرفي مقترح: ${item.morphology.lemmas.join('، ')}؛ يحتاج مراجعة المعنى. `;
        const link = document.createElement('a');
        link.href = item.morphology.source; link.textContent = 'مصدر المحلل'; link.target = '_blank'; link.rel = 'noopener noreferrer';
        evidence.append(link); list.append(evidence);
      }
    }
    for (const reference of result.meaning_references || []) {
      const li = document.createElement('li');
      li.textContent = reference.text + ' — مرجع معنى؛ لا يثبت صحة الإشارة: ';
      const link = document.createElement('a');
      link.href = reference.url; link.textContent = reference.title;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      li.append(link); list.append(li);
    }
    status(result.note);
  }
  $('prepare').onclick = () => run(preparePlan);
})();
