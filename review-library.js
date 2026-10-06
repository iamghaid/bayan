/* Reviewer decisions promote exact source labels within this browser only. */
window.BayanReviewLibrary = (() => {
  const key = 'bayan-motion-review-notes-v1';
  const normalize = text => text.replace(/[\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآ]/g, 'ا').trim();
  let catalog;
  async function entries() {
    if (!catalog) catalog = (async () => {
      let response = await fetch('/api/catalog');
      if (!response.ok) response = await fetch('review-catalog.json');
      if (!response.ok) throw Error('Review catalog unavailable');
      return response.json();
    })();
    try { return await catalog; } catch (_) { catalog = null; return []; }
  }
  async function apply(plan) {
    let notes;
    try { notes = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return plan; }
    const approved = new Map();
    for (const row of await entries()) {
      const record = notes[row.id];
      if (record?.decision !== 'accepted' || !row.motion_sha256 || record.motion_sha256 !== row.motion_sha256 || row.schema_errors?.length || row.technical_preflight?.startsWith('hold_')) continue;
      const label = normalize(row.ar);
      // Conflicting accepted labels stay unresolved instead of guessing.
      approved.set(label, approved.has(label) ? null : row);
    }
    return plan.map(item => {
      if (item.action === 'quran' || item.reason === 'reported-translation-issue') return item;
      const row = approved.get(normalize(item.text));
      if (!row) return item;
      return {...item, action:'sign', id:row.id, sign:row.ar, conf:'high',
        reviewer_approved:true, preview_only:false, motion_base:'sshi_motion/staging/'};
    });
  }
  async function bank() {
    let notes;
    try { notes = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { return []; }
    return (await entries()).filter(row => notes[row.id]?.decision === 'accepted'
      && row.motion_sha256 && notes[row.id].motion_sha256 === row.motion_sha256
      && !row.schema_errors?.length && !row.technical_preflight?.startsWith('hold_'));
  }
  return {key, apply, bank};
})();
