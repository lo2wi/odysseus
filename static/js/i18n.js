// Odysseus i18n — lightweight runtime translation layer
// Usage:
//   import { __, I18N } from './i18n.js';
//   el.textContent = __('chat.send', 'Send');
//   // Or in HTML: <span data-i18n="chat.send">Send</span>
//   // Or placeholder: <input data-i18n-placeholder="search.hint">
//   // Or title: <button data-i18n-title="tool.close">✖</button>
//   // Or aria-label: <div data-i18n-aria="memory.title">

const I18N = {
  _locale: null,
  _dict: {},
  _ready: false,
  _readyPromise: null,
  _resolveReady: null,

  async init(locale) {
    if (this._readyPromise) return this._readyPromise;
    this._readyPromise = new Promise((resolve) => { this._resolveReady = resolve; });

    const target = locale || this._detectLocale();
    this._locale = target;

    // English is the source language — strings are already in English, no dict needed
    if (!target || target === 'en' || target.startsWith('en-')) {
      this._ready = true;
      this._resolveReady();
      return;
    }

    try {
      const resp = await fetch(`/static/locale/${target}.json`);
      if (resp.ok) {
        this._dict = await resp.json();
      } else {
        console.warn(`[i18n] Locale "${target}" not found, falling back to English`);
        this._locale = 'en';
      }
    } catch (e) {
      console.warn(`[i18n] Failed to load locale "${target}":`, e.message);
      this._locale = 'en';
    }

    this._ready = true;
    this._resolveReady();
    this._processDOM();
    document.documentElement.lang = this._locale;
  },

  _detectLocale() {
    const stored = (() => {
      try { return localStorage.getItem('odysseus-locale'); } catch (_) { return null; }
    })();
    if (stored) return stored;

    const nav = (navigator.language || navigator.languages?.[0] || 'en').toLowerCase();
    // Map common Chinese variants to zh-CN
    if (nav.startsWith('zh')) return 'zh-CN';
    if (nav.startsWith('ja')) return 'ja';
    if (nav.startsWith('ko')) return 'ko';
    if (nav.startsWith('fr')) return 'fr';
    if (nav.startsWith('de')) return 'de';
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('pt')) return 'pt-BR';
    return 'en';
  },

  t(key, fallback) {
    if (!this._dict) return fallback !== undefined ? fallback : key;

    // Support dot-notation: "chat.send" → dict.chat.send
    let val = this._dict;
    const parts = key.split('.');
    for (const p of parts) {
      if (val == null || typeof val !== 'object') break;
      val = val[p];
    }

    if (val === undefined || val === null || val === '') {
      return fallback !== undefined ? fallback : key;
    }
    return val;
  },

  has(key) {
    let val = this._dict;
    const parts = key.split('.');
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return false;
      val = val[p];
    }
    return val !== undefined && val !== null && val !== '';
  },

  /** Process all data-i18n attributes in the DOM */
  _processDOM(root = document) {
    if (!this._dict) return;

    // Text content: <span data-i18n="key">Default</span>
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const translated = this.t(key, null);
      if (translated !== null) el.textContent = translated;
    });

    // Placeholder: <input data-i18n-placeholder="key">
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      const translated = this.t(key, null);
      if (translated !== null) el.placeholder = translated;
    });

    // Title: <button data-i18n-title="key">
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;
      const translated = this.t(key, null);
      if (translated !== null) el.title = translated;
    });

    // Aria-label: <div data-i18n-aria="key">
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;
      const translated = this.t(key, null);
      if (translated !== null) el.setAttribute('aria-label', translated);
    });
  },

  /** Set locale at runtime and reload */
  async setLocale(locale) {
    try { localStorage.setItem('odysseus-locale', locale); } catch (_) {}
    this._ready = false;
    this._readyPromise = null;
    this._dict = {};
    await this.init(locale);
    // Re-process entire DOM
    this._processDOM(document);
  },

  /** Get current locale code */
  getLocale() {
    return this._locale || 'en';
  },
};

// Shortcut — safe to call before init; returns the fallback until dict loads
function __(key, fallback) {
  return I18N.t(key, fallback);
}

// Auto-init on import — top-level await blocks all downstream modules
// until the locale dictionary is loaded, so __() calls never return fallback
// on a Chinese browser.
await I18N.init();

// Expose globally so inline scripts (login.html, etc.) can use them
window.I18N = I18N;
window.__ = __;

export { __, I18N };
