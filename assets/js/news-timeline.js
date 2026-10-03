/* The HTML remains a complete, chronological archive when JavaScript is off. */
(() => {
  'use strict';
  const page = document.querySelector('.nt-page');
  const viewport = document.getElementById('timelineViewport');
  const track = document.getElementById('timelineTrack');
  if (!page || !viewport || !track) return;

  const items = [...track.querySelectorAll('.nt-item')];
  const groups = [...track.querySelectorAll('.nt-year-group')];
  const filters = [...page.querySelectorAll('[data-news-filter]')];
  const yearLinks = [...page.querySelectorAll('[data-news-year]')];
  const status = document.getElementById('newsStatus');
  const progress = document.getElementById('newsProgress');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = items.slice();
  let frame = 0;
  let active = null;
  const t = (key, vars = {}, fallback = '') => window.EILanguage ? window.EILanguage.t(key, vars, fallback) : fallback;

  function updateLabels() {
    for (const group of groups) {
      const count = [...group.querySelectorAll('.nt-item')].filter(item => !item.hidden).length;
      group.querySelector('.nt-year-count').textContent = t(count === 1 ? 'news.countOne' : 'news.count', {count}, `${count} ${count === 1 ? 'update' : 'updates'}`);
    }
    status.textContent = t(visible.length === 1 ? 'news.statusOne' : 'news.status', {count:visible.length}, `${visible.length} ${visible.length === 1 ? 'update' : 'updates'} · Newest first`);
    track.querySelectorAll('time[datetime]').forEach(time => {
      const [year, month] = time.getAttribute('datetime').split('-');
      const label = time.querySelector('.nt-date-month');
      const monthName = t(`news.month.${Number(month)}`, {}, label.textContent);
      label.textContent = monthName;
      time.setAttribute('aria-label', t('news.date', {month:monthName, year}, `${monthName} ${year}`));
    });
  }

  function pauseVideos(container) {
    container.querySelectorAll('video').forEach(video => { if (!video.paused) video.pause(); });
  }

  function updateReading() {
    frame = 0;
    const bounds = viewport.getBoundingClientRect();
    const readingLine = bounds.top + Math.min(90, bounds.height * .18);
    let nearest = visible[0] || null;
    let distance = Infinity;
    for (const item of visible) {
      const next = Math.abs(item.getBoundingClientRect().top - readingLine);
      if (next < distance) { distance = next; nearest = item; }
    }
    if (nearest !== active) {
      if (active) active.classList.remove('active');
      if (nearest) nearest.classList.add('active');
      active = nearest;
    }
    for (const link of yearLinks) {
      if (active && link.dataset.newsYear === active.dataset.year) link.setAttribute('aria-current', 'date');
      else link.removeAttribute('aria-current');
    }
    const distanceAvailable = viewport.scrollHeight - viewport.clientHeight;
    const ratio = distanceAvailable > 1 ? Math.min(1, Math.max(0, viewport.scrollTop / distanceAvailable)) : 1;
    page.style.setProperty('--news-progress', ratio.toFixed(4));
    progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  }

  function requestReading() {
    if (!frame) frame = requestAnimationFrame(updateReading);
  }

  function selectCategory(category) {
    for (const item of items) {
      item.hidden = category !== 'all' && item.dataset.category !== category;
      if (item.hidden) pauseVideos(item);
    }
    visible = items.filter(item => !item.hidden);
    for (const group of groups) {
      const count = [...group.querySelectorAll('.nt-item')].filter(item => !item.hidden).length;
      group.hidden = count === 0;
      const link = yearLinks.find(item => item.dataset.newsYear === group.dataset.year);
      if (link) link.hidden = count === 0;
    }
    for (const filter of filters) filter.setAttribute('aria-pressed', String(filter.dataset.newsFilter === category));
    updateLabels();
    viewport.scrollTo({ top: 0, behavior: 'instant' });
    requestReading();
  }

  for (const filter of filters) {
    filter.disabled = false;
    const count = filter.dataset.newsFilter === 'all' ? items.length : items.filter(item => item.dataset.category === filter.dataset.newsFilter).length;
    filter.querySelector('.nt-filter-count').textContent = String(count).padStart(2, '0');
    filter.addEventListener('click', () => selectCategory(filter.dataset.newsFilter));
  }
  for (const link of yearLinks) link.addEventListener('click', event => {
    const target = document.getElementById(`news-year-${link.dataset.newsYear}`);
    if (!target || target.hidden) return;
    event.preventDefault();
    const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - 8;
    viewport.scrollTo({ top: Math.max(0, top), behavior: reduced.matches ? 'instant' : 'smooth' });
    viewport.focus({ preventScroll: true });
    requestReading();
  });
  track.querySelectorAll('details').forEach(details => details.addEventListener('toggle', () => {
    if (!details.open) pauseVideos(details);
    requestReading();
  }));
  viewport.addEventListener('scroll', requestReading, { passive: true });
  window.addEventListener('resize', requestReading, { passive: true });
  window.addEventListener('pageshow', requestReading);
  window.addEventListener('site-language-change', () => {
    const scrollTop = viewport.scrollTop;
    updateLabels();
    viewport.scrollTop = scrollTop;
    requestReading();
  });
  window.addEventListener('pagehide', () => pauseVideos(track));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseVideos(track); });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(requestReading);
    observer.observe(viewport);
    observer.observe(track);
  }
  if (document.fonts) document.fonts.ready.then(requestReading);
  updateLabels();
  requestReading();
})();
