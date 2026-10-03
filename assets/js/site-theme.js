/* Run synchronously in <head> so a saved theme applies before the first paint. */
(() => {
  'use strict';
  if (window.EITheme) return;

  const root = document.documentElement;
  const key = 'ei-site-theme';
  const legacyKey = 'ei-publications-theme';
  let theme = 'dark';
  let boundButton = null;
  const isTheme = value => value === 'light' || value === 'dark';

  function savedTheme(fallback = 'dark') {
    try {
      const saved = window.localStorage.getItem(key);
      if (isTheme(saved)) return saved;
      const legacy = window.localStorage.getItem(legacyKey);
      if (isTheme(legacy)) {
        try { window.localStorage.setItem(key, legacy); } catch (_) {}
        return legacy;
      }
    } catch (_) {
      // A blocked storage area must not prevent the current page from working.
    }
    return fallback;
  }

  function updateControl() {
    const button = document.getElementById('themeBtn');
    const label = document.getElementById('themeLabel');
    const light = theme === 'light';
    const translate = (key, fallback) => window.EILanguage?.t(key, {}, fallback) || fallback;
    if (button) {
      button.setAttribute('aria-pressed', String(light));
      button.setAttribute('aria-label', translate(light ? 'site.toDark' : 'site.toLight', light ? 'Switch to dark background' : 'Switch to light background'));
      button.title = translate(light ? 'site.allDark' : 'site.allLight', light ? 'Switch all pages to dark' : 'Switch all pages to light');
    }
    if (label) label.textContent = translate(light ? 'site.dark' : 'site.light', light ? 'Dark' : 'Light');
  }

  function setTheme(value, persist = true) {
    const next = isTheme(value) ? value : 'dark';
    const changed = root.dataset.theme !== next;
    theme = next;
    root.dataset.theme = next;
    if (persist) {
      try { window.localStorage.setItem(key, next); } catch (_) {}
    }
    updateControl();
    if (changed) window.dispatchEvent(new CustomEvent('site-theme-change', { detail: { theme: next } }));
    return next;
  }

  function toggleTheme() { return setTheme(theme === 'light' ? 'dark' : 'light'); }

  function bindControl() {
    const button = document.getElementById('themeBtn');
    if (button && button !== boundButton) {
      if (boundButton) boundButton.removeEventListener('click', toggleTheme);
      button.addEventListener('click', toggleTheme);
      boundButton = button;
    }
    updateControl();
  }

  window.EITheme = Object.freeze({
    set: setTheme,
    toggle: toggleTheme,
    get current() { return theme; }
  });
  setTheme(savedTheme(), false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControl, { once: true });
  else bindControl();

  window.addEventListener('storage', event => {
    if (event.key === key || event.key === legacyKey || event.key === null) setTheme(savedTheme(), false);
  });
  window.addEventListener('pageshow', () => {
    setTheme(savedTheme(theme), false);
    bindControl();
  });
  window.addEventListener('site-language-change', updateControl);
})();
