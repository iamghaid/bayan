/* Shared navigation: keep views mounted so Arabic drafts and review notes survive. */
(() => {
  const tabs = [document.getElementById('speechTab'), document.getElementById('reviewTab')];
  const panels = [document.getElementById('speechPanel'), document.getElementById('reviewPanel')];
  const frames = [document.getElementById('speechFrame'), document.getElementById('reviewFrame')];

  function selectTab(index) {
    const previous = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    if (previous !== index) {
      frames[previous].contentWindow?.postMessage({type: 'bayan-pause-view'}, location.origin);
    }
    tabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(position === index));
      tab.tabIndex = position === index ? 0 : -1;
      panels[position].hidden = position !== index;
    });
    // Load the review renderer only when needed; preserve it on later switches.
    if (index === 1 && !frames[1].getAttribute('src')) {
      frames[1].src = 'motion-review.html?embedded=1';
    }
    history.replaceState(null, '', index === 1 ? '#review' : '#speech');
  }

  tabs.forEach((tab, index) => {
    tab.onclick = () => selectTab(index);
    tab.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      selectTab(target);
      tabs[target].focus();
    };
  });
  if (location.hash === '#review') selectTab(1);
})();
