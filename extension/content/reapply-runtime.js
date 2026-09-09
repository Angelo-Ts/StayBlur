(() => {
  'use strict';

  const SETTINGS_KEY = 'pb:settings';
  const RULE_PREFIX = 'rule:';
  const DOMAIN_PREFIX = 'idx:domain:';
  const PAGE_PREFIX = 'idx:page:';
  const ATTR = 'data-progettoblur-rule-id';
  const STYLE_ID = 'pb-reapply-style';
  const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];
  const RETRY_DELAYS = [0, 60, 180, 400, 800, 1500];

  const applied = new Map();
  const suppressed = new Set();
  let evaluating = false;
  let pendingEvaluate = false;
  let timer = null;

  const ctx = () => ({ domain: location.hostname, path: location.pathname || '/' });
  const ruleKey = id => `${RULE_PREFIX}${id}`;
  const domainKey = domain => `${DOMAIN_PREFIX}${domain}`;
  const pageKey = (domain, path) => `${PAGE_PREFIX}${domain}:${path}`;
  const frameKey = () => {
    const chain = [];
    try {
      let w = window;
      while (w !== w.top) {
        const frame = w.frameElement;
        if (!frame) return null;
        const tag = (frame.tagName || 'iframe').toLowerCase();
        const id = String(frame.id || '').trim();
        const name = String(frame.name || '').trim();
        if (id) chain.unshift(`${tag}#${id}`);
        else if (name) chain.unshift(`${tag}[name=${name}]`);
        else {
          const siblings = frame.parentElement
            ? [...frame.parentElement.children].filter(x => x.tagName === frame.tagName)
            : [];
          chain.unshift(`${tag}[n=${Math.max(0, siblings.indexOf(frame))}]`);
        }
        w = w.parent;
      }
      return chain.length ? `frame:${chain.join('/')}` : 'top';
    } catch (_) {
      return null;
    }
  };

  const stable = value => {
    const s = String(value || '').trim();
    return !!s && !/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(s) && !/^[a-f0-9]{10,}$/i.test(s) && !/(\d{9,}|\d{4,}_\d{4,})$/.test(s);
  };
  const tokens = value => String(value || '').split(/\s+/).map(x => x.trim()).filter(stable);
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const esc = value => CSS.escape(String(value));

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:blur(8px) contrast(1.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}';
    (document.head || document.documentElement)?.appendChild(style);
  }

  function cssPath(el) {
    if (el.id && stable(el.id)) return `#${esc(el.id)}`;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node instanceof Element && node !== document.documentElement && depth++ < 10) {
      let part = node.tagName.toLowerCase();
      const classes = tokens(node.className).slice(0, 2);
      if (classes.length) part += `.${classes.map(esc).join('.')}`;
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join('>');
  }

  function score(fp, el) {
    let value = 0;
    let independent = 0;
    if (fp.stableId && el.id === fp.stableId) { value += .45; independent++; }
    const classes = fp.stableClasses || [];
    if (classes.length) {
      const hit = classes.filter(c => tokens(el.className).includes(c)).length / classes.length;
      if (hit >= .65) { value += .18; independent++; }
    }
    const attrs = fp.semanticAttributes || [];
    if (attrs.length) {
      const hit = attrs.filter(a => el.getAttribute(a.name)?.toLowerCase() === String(a.value).toLowerCase()).length / attrs.length;
      if (hit >= .65) { value += .18; independent++; }
    }
    if (fp.tagName === el.tagName.toLowerCase()) value += .05;
    if (fp.parentTag === el.parentElement?.tagName.toLowerCase()) value += .05;
    const parentClasses = fp.parentClasses || [];
    if (parentClasses.length) {
      const hit = parentClasses.filter(c => tokens(el.parentElement?.className).includes(c)).length / parentClasses.length;
      if (hit >= .5) { value += .06; independent++; }
    }
    if (Number.isInteger(fp.siblingIndex) && fp.siblingIndex === [...(el.parentElement?.children || [])].indexOf(el)) { value += .07; independent++; }
    if (fp.text && fp.text.length <= 600 && norm(el.textContent) === fp.text) { value += .12; independent++; }
    return { score: Math.min(1, value), independent };
  }

  function findElement(rule) {
    const fp = rule.fingerprint || {};
    const candidates = [];
    const seen = new Set();
    const add = list => {
      for (const el of list || []) if (!seen.has(el)) { seen.add(el); candidates.push(el); }
    };

    if (fp.stableId) {
      try { add(document.querySelectorAll(`#${esc(fp.stableId)}`)); } catch (_) {}
    }
    if (fp.cssSelector) {
      try {
        const direct = [...document.querySelectorAll(fp.cssSelector)];
        if (direct.length === 1) return { element: direct[0], confidence: 1, independent: 3 };
        add(direct);
      } catch (_) {}
    }
    for (const attr of fp.semanticAttributes || []) {
      try { add(document.querySelectorAll(`[${esc(attr.name)}="${CSS.escape(attr.value)}"]`)); } catch (_) {}
    }
    if (fp.tagName && fp.text) {
      for (const el of document.getElementsByTagName(fp.tagName)) {
        if (norm(el.textContent) === fp.text) add([el]);
      }
    }

    let best = null;
    let second = null;
    for (const el of candidates) {
      const current = { ...score(fp, el), element: el };
      if (!best || current.score > best.score) { second = best; best = current; }
      else if (!second || current.score > second.score) second = current;
    }
    if (!best) return null;
    const gap = second ? best.score - second.score : 1;
    if (best.score >= .72 && best.independent >= 2 && gap > .05) return best;
    return null;
  }

  async function getRules() {
    const c = ctx();
    const keys = [domainKey(c.domain), pageKey(c.domain, c.path)];
    const indexes = await chrome.storage.local.get({ [keys[0]]: [], [keys[1]]: [] });
    const ids = [...new Set([...(indexes[keys[0]] || []), ...(indexes[keys[1]] || [])])];
    if (!ids.length) return [];
    const loaded = await chrome.storage.local.get(ids.map(ruleKey));
    const currentFrame = frameKey() || 'unknown';
    return ids.map(id => loaded[ruleKey(id)]).filter(Boolean).filter(rule => !rule.frameKey || rule.frameKey === currentFrame);
  }

  async function extensionEnabled() {
    const result = await chrome.storage.local.get({ [SETTINGS_KEY]: { extensionEnabled: true } });
    return result[SETTINGS_KEY]?.extensionEnabled !== false;
  }

  function apply(rule, element) {
    if (!(element instanceof Element)) return false;
    ensureStyle();
    for (const effect of EFFECTS) element.classList.remove(`pb-effect-${effect}`);
    const intensity = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    element.classList.add('pb-effect-base', `pb-effect-${EFFECTS.includes(rule.effect) ? rule.effect : 'blur'}`);
    element.style.setProperty('--pb-blur', `${Math.max(1, Math.round(intensity * .12))}px`);
    element.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(intensity * .28))}px`);
    element.setAttribute(ATTR, rule.ruleId);
    applied.set(rule.ruleId, element);
    return true;
  }

  function remove(ruleId) {
    const element = applied.get(ruleId);
    if (element?.isConnected) {
      element.classList.remove('pb-effect-base', ...EFFECTS.map(x => `pb-effect-${x}`));
      element.removeAttribute(ATTR);
    }
    applied.delete(ruleId);
  }

  async function applyRuleWithRetry(rule) {
    if (!rule.enabled || !(await extensionEnabled()) || suppressed.has(rule.ruleId)) {
      remove(rule.ruleId);
      return true;
    }
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      if (!rule.enabled || suppressed.has(rule.ruleId)) return true;
      const result = findElement(rule);
      if (result) return apply(rule, result.element);
    }
    return false;
  }

  async function evaluateAll() {
    if (evaluating) { pendingEvaluate = true; return; }
    evaluating = true;
    try {
      const rules = await getRules();
      await Promise.all(rules.map(applyRuleWithRetry));
      for (const [ruleId] of applied) if (!rules.some(rule => rule.ruleId === ruleId)) remove(ruleId);
    } finally {
      evaluating = false;
      if (pendingEvaluate) { pendingEvaluate = false; schedule(); }
    }
  }

  function schedule(delay = 50) {
    clearTimeout(timer);
    timer = setTimeout(evaluateAll, delay);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'BG_REMOVE_RULE_EFFECT_PAGE') {
      suppressed.add(message.ruleId);
      remove(message.ruleId);
    } else if (message?.type === 'BG_REMOVE_ALL_EFFECTS_PAGE') {
      for (const ruleId of applied.keys()) suppressed.add(ruleId);
      for (const ruleId of [...applied.keys()]) remove(ruleId);
    } else if (message?.type === 'BG_RETRY_RULE_ON_PAGE') {
      suppressed.delete(message.ruleId);
      schedule(0);
    } else if (message?.type === 'POPUP_ENABLE_RULE') {
      suppressed.delete(message.ruleId);
      schedule(0);
    } else if (message?.type === 'POPUP_DISABLE_RULE') {
      suppressed.add(message.ruleId);
      remove(message.ruleId);
    }
  });

  chrome.storage.onChanged.addListener(changes => {
    if (changes[SETTINGS_KEY] || Object.keys(changes).some(key => key.startsWith(RULE_PREFIX) || key.startsWith('idx:'))) {
      if (changes[SETTINGS_KEY]?.newValue?.extensionEnabled === false) {
        for (const ruleId of [...applied.keys()]) remove(ruleId);
      } else {
        schedule(0);
      }
    }
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => m.type === 'childList' && m.addedNodes.length)) schedule(60);
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });

  addEventListener('popstate', () => { suppressed.clear(); schedule(0); }, true);
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    if (original.__stayBlurRuntimeWrapped) continue;
    const wrapped = function (...args) {
      const before = location.href;
      const result = original.apply(this, args);
      if (location.href !== before) { suppressed.clear(); schedule(0); }
      return result;
    };
    Object.defineProperty(wrapped, '__stayBlurRuntimeWrapped', { value: true });
    history[name] = wrapped;
  }

  schedule(0);
})();
