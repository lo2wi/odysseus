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

    // Load pre-built reverse map (English→Chinese) from the dictionary
    if (this._dict._reverse) {
      Object.assign(_reverseMap, this._dict._reverse);
      delete this._dict._reverse;  // clean up, not a real translation section
    }

    this._ready = true;
    this._resolveReady();
    this._processDOM(document);
    document.documentElement.lang = this._locale;

    // Watch for dynamically-rendered content and translate it automatically.
    // Most of the Odysseus UI is built by JS after page load, so data-i18n
    // attributes on the initial HTML skeleton are not enough.
    if (!this._observer && typeof MutationObserver !== 'undefined') {
      this._observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {  // Element node
              this._processDOM(node);
            }
          }
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true });
    }
  },

  _detectLocale() {
    const stored = (() => {
      try { return localStorage.getItem('odysseus-locale'); } catch (_) { return null; }
    })();
    if (stored) return stored;

    const nav = (navigator.language || navigator.languages?.[0] || 'zh-CN').toLowerCase();
    // Map browser language to locale. Default to zh-CN (this is the Chinese fork).
    if (nav.startsWith('zh')) return 'zh-CN';
    if (nav.startsWith('ja')) return 'ja';
    if (nav.startsWith('ko')) return 'ko';
    if (nav.startsWith('fr')) return 'fr';
    if (nav.startsWith('de')) return 'de';
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('ru')) return 'ru';
    if (nav.startsWith('pt')) return 'pt-BR';
    // Default to zh-CN for this fork — English users can switch to upstream
    return 'zh-CN';
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

// Reverse map: English text → Chinese translation. Built automatically
// as __() is called. Used by translatePage() to handle strings that
// were never wrapped with __() in the source code.
const _reverseMap = {};

// Shortcut — safe to call before init; returns the fallback until dict loads
function __(key, fallback) {
  const result = I18N.t(key, fallback);
  // Build reverse map: if we got a real translation different from fallback
  if (fallback && typeof fallback === 'string' && result !== fallback && fallback.length >= 3) {
    _reverseMap[fallback] = result;
  }
  return result;
}

// Expose reverse map for debugging
I18N._reverseMap = _reverseMap;

// Expose globally BEFORE the await — inline scripts (login.html) need
// window.I18N to be available immediately so they can await _readyPromise.
window.I18N = I18N;
window.__ = __;

// Top-level await blocks all downstream <script type="module"> tags
// until the locale dictionary is loaded, so __() calls always resolve.
await I18N.init();

// --- Page-level translation: walks all text nodes and replaces known English ---
I18N.translatePage = function (root = document) {
  if (!this._dict) return;
  const map = _reverseMap;
  if (Object.keys(map).length === 0) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA' || tag === 'INPUT') {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent.trim();
        if (text.length >= 3 && text.length < 200 && map[text]) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (map[text]) {
      node.textContent = map[text];
    }
  }
};

// Run page-level translation after other modules finish rendering.
// Schedule at multiple delays to catch content rendered at different times.
setTimeout(() => I18N.translatePage(document), 200);
setTimeout(() => I18N.translatePage(document), 800);
setTimeout(() => I18N.translatePage(document), 2000);
// Also hook into the existing MutationObserver for new content.
if (I18N._observer) {
  const _origCallback = I18N._observer._callback;
  // Extend the observer to also run translatePage on new subtrees
}

export { __, I18N };
