/* Suggestions only: this module never updates reviewer decisions or motion data. */
(() => {
  const panel = document.createElement('section');
  panel.className = 'assistant-panel';
  panel.innerHTML = `
    <h2>مساعد بيان للمراجعة <span class="ai-chip">AI</span></h2>
    <p>اسأل عن الحركة المختارة أو طريقة فحصها. المساعد يستند إلى بياناتها الفنية وسؤالك؛ لا يشاهد الفيديو أو الأفتار.</p>
    <div class="assistant-prompts">
      <button type="button">كيف أفحص دوران الرسغ؟</button>
      <button type="button">كيف أتأكد من وضوح الأصابع؟</button>
      <button type="button">اقترح خطوات مقارنة بالمصدر</button>
    </div>
    <div id="assistantMessages" role="log" aria-live="polite"></div>
    <form id="assistantForm">
      <label for="assistantQuestion">سؤالك عن الحركة</label>
      <textarea id="assistantQuestion" maxlength="2000" required
        placeholder="مثال: عند الثانية 0.8 الرسغ يبدو ملتويًا، ماذا أفحص؟"></textarea>
      <button type="submit" id="assistantSend">اطلب اقتراحًا</button>
      <span id="assistantStatus" role="status"></span>
    </form>`;
  document.querySelector('main').append(panel);

  const messages = panel.querySelector('#assistantMessages');
  const question = panel.querySelector('#assistantQuestion');
  const status = panel.querySelector('#assistantStatus');
  const send = panel.querySelector('#assistantSend');

  function addMessage(text, kind) {
    const entry = document.createElement('p');
    entry.className = `assistant-message ${kind}`;
    // Provider and user text must never become executable markup.
    entry.textContent = text;
    messages.append(entry);
    while (messages.children.length > 12) messages.firstElementChild.remove();
  }

  panel.querySelectorAll('.assistant-prompts button').forEach(button => {
    button.onclick = () => {
      question.value = button.textContent;
      question.focus();
    };
  });

  panel.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const identifier = Number(document.getElementById('pick').value);
    const text = question.value.trim();
    if (!identifier || !text) {
      status.textContent = 'اختر حركة واكتب سؤالك أولًا.';
      return;
    }
    send.disabled = true;
    status.textContent = 'المساعد يجهّز الاقتراح…';
    addMessage(`الحركة #${identifier} — ${text}`, 'user');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    try {
      const response = await fetch('/api/review_assistant', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({motion_id: identifier, question: text}),
        signal: controller.signal,
      });
      if (!response.headers.get('Content-Type')?.includes('application/json')) {
        throw Error('خدمة المساعد غير متاحة؛ حدّث الصفحة أو تحقق من تشغيل الخادم.');
      }
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'تعذر الحصول على اقتراح.');
      if (typeof result.answer !== 'string' || result.motion_id !== identifier) {
        throw Error('استجابة غير صالحة.');
      }
      addMessage(`اقتراح للحركة #${identifier}\n${result.answer}`, 'reply');
      status.textContent = 'وصل الاقتراح؛ القرار يبقى لك.';
    } catch (error) {
      status.textContent = error.name === 'AbortError'
        ? 'انتهت مهلة الطلب؛ حاول مرة أخرى.'
        : error.message === 'Failed to fetch'
          ? 'تعذر الاتصال بالخادم.'
          : error.message;
    } finally {
      clearTimeout(timeout);
      send.disabled = false;
    }
  };
})();
