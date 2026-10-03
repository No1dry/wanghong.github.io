/* English is the default. Restore an explicit choice before the page paints. */
(() => {
  'use strict';
  if (window.EILanguage) return;
  const root = document.documentElement;
  const storageKey = 'ei-site-language';
  const bound = new WeakSet();
  const rendered = new WeakMap();
  let language = 'en';
  const valid = value => value === 'en' || value === 'zh';
  const common = {
    'site.homepage':{en:'Homepage',zh:'首页'},
    'site.lab':{en:'Lab',zh:'实验室'},
    'site.publications':{en:'Publications',zh:'论文成果'},
    'site.news':{en:'News',zh:'动态'},
    'site.join':{en:'Join Us',zh:'加入我们'},
    'site.homeLabel':{en:'EI Lab homepage',zh:'EI Lab 首页'},
    'site.navigation':{en:'Main navigation',zh:'主导航'},
    'site.language':{en:'Language',zh:'语言'},
    'site.english':{en:'Switch to English',zh:'切换到英文'},
    'site.chinese':{en:'Switch to Chinese',zh:'切换到中文'},
    'site.light':{en:'Light',zh:'浅色'},
    'site.dark':{en:'Dark',zh:'深色'},
    'site.toLight':{en:'Switch to light background',zh:'切换为浅色背景'},
    'site.toDark':{en:'Switch to dark background',zh:'切换为深色背景'},
    'site.allLight':{en:'Switch all pages to light',zh:'将所有页面切换为浅色'},
    'site.allDark':{en:'Switch all pages to dark',zh:'将所有页面切换为深色'}
  };
  window.EITranslations = Object.assign(common, window.EITranslations || {});
  function saved(fallback = 'en') {
    try {const value = window.localStorage.getItem(storageKey); return valid(value) ? value : fallback;}
    catch (_) {return fallback;}
  }
  function lookup(key) {
    const entry = window.EITranslations?.[key];
    if (typeof entry === 'string') return entry;
    return entry?.[language] ?? entry?.en;
  }
  function t(key, values = {}, fallback = '') {
    const template = lookup(key) ?? (fallback || key);
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
  }
  function nodes(scope, attribute) {
    const found = [...scope.querySelectorAll(`[${attribute}]`)];
    if (scope.matches?.(`[${attribute}]`)) found.unshift(scope);
    return found;
  }
  function apply(scope = document) {
    // Only curated page dictionaries are used as HTML, never applicant answers.
    for (const node of nodes(scope, 'data-i18n-html')) {
      const key = node.getAttribute('data-i18n-html'), text = lookup(key);
      if (text === undefined) continue;
      if (rendered.get(node) !== `${language}:${key}:${text}`) {
        node.innerHTML = text;
        rendered.set(node, `${language}:${key}:${text}`);
      }
    }
    for (const node of nodes(scope, 'data-i18n')) {
      const text = lookup(node.getAttribute('data-i18n'));
      if (text !== undefined && node.textContent !== String(text)) node.textContent = text;
    }
    for (const attribute of ['placeholder','title','aria-label','alt']) {
      for (const node of nodes(scope, `data-i18n-${attribute}`)) {
        const text = lookup(node.getAttribute(`data-i18n-${attribute}`));
        if (text !== undefined) node.setAttribute(attribute, text);
      }
    }
    for (const button of document.querySelectorAll('[data-language]')) {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
      if (!bound.has(button)) {
        button.addEventListener('click', () => set(button.dataset.language));
        bound.add(button);
      }
    }
  }
  function set(value, persist = true) {
    const next = valid(value) ? value : 'en';
    const changed = next !== language;
    language = next;
    root.lang = next === 'zh' ? 'zh-CN' : 'en';
    root.dataset.language = next;
    if (persist) {
      try {window.localStorage.setItem(storageKey, next);} catch (_) {}
    }
    if (document.readyState !== 'loading') apply();
    // Dynamic labels refresh after static copy, including same-language clicks.
    if (changed || document.readyState !== 'loading') window.dispatchEvent(new CustomEvent('site-language-change', {detail:{language:next}}));
    return next;
  }
  window.EILanguage = Object.freeze({set, t, apply, get current() {return language;}});
  set(saved(), false);
  function ready() {
    apply();
    window.dispatchEvent(new CustomEvent('site-language-change', {detail:{language}}));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once:true});
  else ready();
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) set(saved(), false);
  });
  window.addEventListener('pageshow', () => set(saved(language), false));
})();
