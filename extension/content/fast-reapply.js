(() => {
  'use strict';

  // Fast path for SPA/virtualized pages: when a site recreates DOM nodes,
  // reapply saved rules against only the newly inserted subtree instead of
  // waiting for the full safety matcher to scan the whole document.
  const SETTINGS_KEY = 'pb:settings';
  const RULE_PREFIX = 'rule:';
  const DOMAIN_PREFIX = 'idx:domain:';
  const PAGE_PREFIX = 'idx:page:';
  const ATTR = 'data-progettoblur-rule-id';
  const STYLE_ID = 'pb-rule-style';
  const PIXELATE_FILTER_ID = 'pb-progettoblur-pixelate-filter';
  const EFFECT_CLASSES = ['pb-effect-base', 'pb-effect-blur', 'pb-effect-strongBlur', 'pb-effect-pixelate', 'pb-effect-blackout', 'pb-effect-hide'];
  const MAX_SUBTREE_NODES = 800;
  const TEXT_LIMIT = 1200;

  let enabled = true;
  let rules = [];
  let loadedKey = '';
  let loadPromise = null;
  let observer = null;
  let visibilityObserver = null;
  let pendingNodes = new Set();
  let flushTimer = 0;
  const tracked = new Map();

  const context = () => ({ domain: location.hostname, path: location.pathname || '/' });
  const contextKey = () => `${location.hostname}|${location.pathname || '/'}`;
  const keyRule = id => `${RULE_PREFIX}${id}`;
  const keyDomain = d => `${DOMAIN_PREFIX}${d}`;
  const keyPage = (d, p) => `${PAGE_PREFIX}${d}:${p}`;

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  }
  function volatileText(value) {
    const s = normalizeText(value);
    return !s || s.length > TEXT_LIMIT || /\b(?:\d{4,}|[A-F0-9]{12,})\b/i.test(s);
  }
  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const stableToken = value => value && !(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ||
    /^[a-f0-9]{10,}$/i.test(value) ||
    /(\d{9,}|\d{4,}_\d{4,})$/.test(value)
  );
  const stableTokens = tokens => (tokens || []).filter(stableToken);

  async function getRules() {
    const ck = contextKey();
    if (loadedKey === ck) return rules;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const c = context();
      const r = await chrome.storage.local.get({
        [SETTINGS_KEY]: { extensionEnabled: true },
        [keyDomain(c.domain)]: [],
        [keyPage(c.domain, c.path)]: []
      });
      enabled = r[SETTINGS_KEY]?.extensionEnabled !== false;
      const ids = [...new Set([...(r[keyDomain(c.domain)] || []), ...(r[keyPage(c.domain, c.path)] || [])])];
      if (!ids.length) return [];
      const stored = await chrome.storage.local.get(ids.map(keyRule));
      return ids.map(id => stored[keyRule(id)]).filter(r => r && r.enabled !== false);
    })();
    try {
      rules = await loadPromise;
      loadedKey = ck;
      return rules;
    } finally {
      loadPromise = null;
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:url("#${PIXELATE_FILTER_ID}") contrast(var(--pb-pixel-contrast,1.8)) saturate(.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}`;
    (document.head || document.documentElement).appendChild(s);

    if (!document.getElementById(PIXELATE_FILTER_ID)) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.position = 'absolute';
      svg.style.width = '0';
      svg.style.height = '0';
      svg.style.overflow = 'hidden';
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.id = PIXELATE_FILTER_ID;
      filter.setAttribute('x', '-10%');
      filter.setAttribute('y', '-10%');
      filter.setAttribute('width', '120%');
      filter.setAttribute('height', '120%');
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const noise = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
      noise.setAttribute('type', 'fractalNoise');
      noise.setAttribute('baseFrequency', '0.12');
      noise.setAttribute('numOctaves', '1');
      noise.setAttribute('seed', '17');
      noise.setAttribute('result', 'pbNoise');
      const displacement = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
      displacement.setAttribute('in', 'SourceGraphic');
      displacement.setAttribute('in2', 'pbNoise');
      displacement.setAttribute('scale', '10');
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      filter.append(noise, displacement);
      defs.appendChild(filter);
      svg.appendChild(defs);
      (document.body || document.documentElement).appendChild(svg);
    }
  }

  function track(el, rule) {
    tracked.set(rule.ruleId, el);
    if (!visibilityObserver) return;
    try { visibilityObserver.observe(el); } catch (_) {}
  }

  function apply(el, rule) {
    if (!(el instanceof Element) || !enabled) return;
    ensureStyle();
    const px = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    EFFECT_CLASSES.slice(1).forEach(c => el.classList.remove(c));
    el.classList.add('pb-effect-base', `pb-effect-${rule.effect || 'blur'}`);
    el.style.setProperty('--pb-blur', `${Math.max(1, Math.round(px / 100 * 12))}px`);
    el.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(px / 100 * 28))}px`);
    el.style.setProperty('--pb-pixel-contrast', `${1.25 + px / 100 * 1.75}`);
    el.setAttribute(ATTR, rule.ruleId);
    track(el, rule);
  }

  function candidateNodes(root) {
    if (!(root instanceof Element)) return [];
    const out = [root];
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length && out.length < MAX_SUBTREE_NODES; i++) out.push(all[i]);
    return out;
  }

  function classMatch(fp, el) {
    const expected = (fp?.stableClasses || []).map(x => x.className).filter(Boolean);
    if (!expected.length) return true;
    const current = new Set(stableTokens(String(el.className || '').split(/\s+/)));
    return expected.some(x => current.has(x));
  }

  async function safeExact(fp, el) {
    if (!(el instanceof Element) || el.tagName.toLowerCase() !== fp?.tagName) return false;
    if (fp.stableId?.value && el.id !== fp.stableId.value) return false;
    if (!classMatch(fp, el)) return false;
    if (fp.normalizedTextHash) {
      const text = normalizeText(el.textContent);
      if (volatileText(text)) return false;
      return await sha256(text) === fp.normalizedTextHash.hash;
    }
    return true;
  }

  async function findFast(rule, nodes) {
    const fp = rule.fingerprint;
    if (!fp) return null;

    // 1) The recorded CSS path is the cheapest and most precise signal.
    if (fp.cssSelector) {
      const exact = [];
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        try {
          if (node.matches(fp.cssSelector)) exact.push(node);
          for (const el of node.querySelectorAll(fp.cssSelector)) exact.push(el);
        } catch (_) {}
        if (exact.length > 1) break;
      }
      if (exact.length === 1 && await safeExact(fp, exact[0])) return exact[0];
    }

    // 2) Stable id is effectively unique and survives most virtualized DOM churn.
    if (fp.stableId?.value) {
      const id = fp.stableId.value;
      for (const node of nodes) {
        if (node.id === id && await safeExact(fp, node)) return node;
        try {
          const el = node.querySelector(`#${CSS.escape(id)}`);
          if (el && await safeExact(fp, el)) return el;
        } catch (_) {}
      }
    }

    // 3) For virtualized content, exact stable text is a safe fallback when unique.
    if (fp.normalizedTextHash) {
      let found = null;
      for (const node of nodes) {
        const text = normalizeText(node.textContent);
        if (!volatileText(text) && await sha256(text) === fp.normalizedTextHash.hash && await safeExact(fp, node)) {
          if (found && found !== node) return null;
          found = node;
        }
      }
      if (found) return found;
    }

    return null;
  }

  async function flush() {
    flushTimer = 0;
    if (!pendingNodes.size) return;
    const nodes = [...pendingNodes];
    pendingNodes.clear();
    const currentRules = await getRules();
    if (!enabled || !currentRules.length) return;

    await Promise.all(currentRules.map(async rule => {
      const trackedEl = tracked.get(rule.ruleId);
      if (trackedEl?.isConnected && trackedEl.getAttribute(ATTR) === rule.ruleId) return;
      const el = await findFast(rule, nodes);
      if (el) apply(el, rule);
    }));
  }

  function schedule(nodes) {
    for (const node of nodes) if (node instanceof Element) pendingNodes.add(node);
    if (!pendingNodes.size || flushTimer) return;
    if (typeof requestAnimationFrame === 'function') {
      flushTimer = requestAnimationFrame(() => { flushTimer = 0; flush(); });
    } else {
      flushTimer = setTimeout(flush, 0);
    }
  }

  function observe() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(mutations => {
      const added = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) if (node instanceof Element) added.push(node);
      }
      if (added.length) schedule(added);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function hasEffect(rule, el) {
    return el.getAttribute(ATTR) === rule.ruleId &&
      el.classList.contains('pb-effect-base') &&
      el.classList.contains(`pb-effect-${rule.effect || 'blur'}`);
  }

  function observeVisibility() {
    if (visibilityObserver || typeof IntersectionObserver !== 'function') return;
    visibilityObserver = new IntersectionObserver(entries => {
      if (!enabled) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const rule = rules.find(r => tracked.get(r.ruleId) === el);
        if (rule && el.isConnected && !hasEffect(rule, el)) apply(el, rule);
      }
    }, { root: null, rootMargin: '200px 0px' });
  }

  function refresh() {
    loadedKey = '';
    rules = [];
    tracked.clear();
    pendingNodes.clear();
    getRules().then(current => {
      if (enabled && current.length) schedule([document.documentElement]);
    });
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes[SETTINGS_KEY]) {
      enabled = changes[SETTINGS_KEY].newValue?.extensionEnabled !== false;
      if (!enabled) return;
      refresh();
    }
    if (Object.keys(changes).some(k => k.startsWith(RULE_PREFIX) || k.startsWith('idx:'))) refresh();
  });

  addEventListener('popstate', refresh, true);
  addEventListener('hashchange', refresh, true);
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    if (original.__progettoBlurFastWrapped) continue;
    const wrapped = function (...args) {
      const before = location.href;
      const result = original.apply(this, args);
      if (location.href !== before) refresh();
      return result;
    };
    Object.defineProperty(wrapped, '__progettoBlurFastWrapped', { value: true });
    history[name] = wrapped;
  }

  observeVisibility();
  getRules().then(current => {
    if (enabled && current.length) schedule([document.documentElement]);
    observe();
  });
})();
