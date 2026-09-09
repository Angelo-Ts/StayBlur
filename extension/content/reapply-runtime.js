(() => {
  'use strict';

  const SETTINGS_KEY = 'pb:settings';
  const RULE_PREFIX = 'rule:';
  const DOMAIN_PREFIX = 'idx:domain:';
  const PAGE_PREFIX = 'idx:page:';
  const ATTR = 'data-progettoblur-rule-id';
  const STYLE_ID = 'pb-reapply-style';
  const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];
  const RETRY_DELAYS = [0, 100, 300, 700, 1500, 3000, 6000, 10000];

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
    return !!s &&
      !/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(s) &&
      !/^[a-f0-9]{10,}$/i.test(s) &&
      !/(\d{9,}|\d{4,}_\d{4,})$/.test(s);
  };
  const tokens = value => String(value || '').split(/\s+/).map(x => x.trim()).filter(stable);
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
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

  function textAnchors(text) {
    const value = norm(text);
    return { prefix: value.slice(0, 100), suffix: value.slice(-100), length: value.length };
  }

  function score(fp, el) {
    let value = 0;
    let independent = 0;
    const elementText = norm(el.textContent);
    const storedText = norm(fp.text);

    if (fp.stableId && el.id === fp.stableId) {
      value += .45;
      independent++;
    }

    const classes = fp.stableClasses || [];
    if (classes.length) {
      const current = tokens(el.className);
      const hit = classes.filter(c => current.includes(c)).length / classes.length;
      if (hit >= .65) {
        value += .18;
        independent++;
      }
    }

    const attrs = fp.semanticAttributes || [];
    if (attrs.length) {
      const hit = attrs.filter(a => el.getAttribute(a.name)?.toLowerCase() === String(a.value).toLowerCase()).length / attrs.length;
      if (hit >= .65) {
        value += .18;
        independent++;
      }
    }

    if (fp.tagName === el.tagName.toLowerCase()) value += .05;
    if (fp.parentTag === el.parentElement?.tagName.toLowerCase()) value += .05;

    const parentClasses = fp.parentClasses || [];
    if (parentClasses.length) {
      const current = tokens(el.parentElement?.className);
      const hit = parentClasses.filter(c => current.includes(c)).length / parentClasses.length;
      if (hit >= .5) {
        value += .06;
        independent++;
      }
    }

    if (Number.isInteger(fp.siblingIndex) && fp.siblingIndex === [...(el.parentElement?.children || [])].indexOf(el)) {
      value += .07;
      independent++;
    }

    if (storedText && elementText === storedText) {
      value += .14;
      independent++;
    } else if (storedText.length >= 20) {
      const anchors = textAnchors(storedText);
      const prefixOk = anchors.prefix.length >= 20 && elementText.startsWith(anchors.prefix);
      const suffixOk = anchors.suffix.length >= 20 && elementText.endsWith(anchors.suffix);
      const lengthRatio = anchors.length ? Math.min(elementText.length, anchors.length) / Math.max(elementText.length, anchors.length) : 0;
      if (prefixOk) { value += .08; independent++; }
      if (suffixOk) { value += .08; independent++; }
      if (lengthRatio >= .75) value += .04;
    }

    return { score: Math.min(1, value), independent };
  }

  function addCandidates(set, list) {
    for (const element of list || []) if (element instanceof Element) set.add(element);
  }

  function findElement(rule) {
    const fp = rule.fingerprint || {};
    const candidates = new Set();

    if (fp.stableId) {
      try { addCandidates(candidates, document.querySelectorAll(`#${esc(fp.stableId)}`)); } catch (_) {}
    }
    if (fp.cssSelector) {
      try { addCandidates(candidates, document.querySelectorAll(fp.cssSelector)); } catch (_) {}
    }
    for (const attr of fp.semanticAttributes || []) {
      try { addCandidates(candidates, document.querySelectorAll(`[${esc(attr.name)}="${CSS.escape(String(attr.value))}"]`)); } catch (_) {}
    }

    const tag = fp.tagName && /^[a-z][a-z0-9-]*$/i.test(fp.tagName) ? fp.tagName : null;
    const storedText = norm(fp.text);
    if (tag) {
      const elements = document.getElementsByTagName(tag);
      if (storedText) {
        const anchors = textAnchors(storedText);
        for (const element of elements) {
          const text = norm(element.textContent);
          if (text === storedText || (storedText.length >= 20 && ((anchors.prefix.length >= 20 && text.startsWith(anchors.prefix)) || (anchors.suffix.length >= 20 && text.endsWith(anchors.suffix))))) {
            candidates.add(element);
          }
        }
      }
      if (!candidates.size && elements.length <= 500) addCandidates(candidates, elements);
    }

    let best = null;
    let second = null;
    for (const element of candidates) {
      const current = { ...score(fp, element), element };
      if (!best || current.score > best.score) {
        second = best;
        best = current;
      } else if (!second || current.score > second.score) {
        second = current;
      }
    }
    if (!best) return null;

    const gap = second ? best.score - second.score : 1;
    let uniqueSelector = false;
    if (fp.cssSelector) {
      try { uniqueSelector = document.querySelectorAll(fp.cssSelector).length === 1; } catch (_) {}
    }
    if (uniqueSelector && best.element.tagName.toLowerCase() === fp.tagName) {
      return { element: best.element, confidence: 1, independent: Math.max(3, best.independent) };
    }
    if (best.score >= .68 && best.independent >= 2 && gap > .08) return best;
    if (best.independent >= 2 && best.score >= .62 && gap > .12) return best;
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

  function removeVisualEffect(element) {
    if (!(element instanceof Element)) return;
    element.classList.remove('pb-effect-base', ...EFFECTS.map(x => `pb-effect-${x}`));
    element.style.removeProperty('--pb-blur');
    element.style.removeProperty('--pb-strong-blur');
    element.removeAttribute(ATTR);
  }

  function remove(ruleId) {
    const element = applied.get(ruleId);
    if (element?.isConnected) removeVisualEffect(element);
    applied.delete(ruleId);
  }

  function removeDomRule(ruleId) {
    if (!ruleId) return;
    try {
      for (const element of document.querySelectorAll(`[${ATTR}="${esc(ruleId)}"]`)) removeVisualEffect(element);
    } catch (_) {}
    remove(ruleId);
  }

  function removeDomAll() {
    for (const element of document.querySelectorAll(`[${ATTR}]`)) removeVisualEffect(element);
    for (const effect of EFFECTS) {
      for (const element of document.querySelectorAll(`.pb-effect-${effect}`)) removeVisualEffect(element);
    }
    applied.clear();
  }

  async function applyRuleWithRetry(rule) {
    if (!rule.enabled || !(await extensionEnabled()) || suppressed.has(rule.ruleId)) {
      removeDomRule(rule.ruleId);
      return true;
    }
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      if (!rule.enabled || suppressed.has(rule.ruleId) || !(await extensionEnabled())) {
        removeDomRule(rule.ruleId);
        return true;
      }
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
      const activeIds = new Set(rules.map(rule => rule.ruleId));
      for (const ruleId of [...applied.keys()]) if (!activeIds.has(ruleId)) remove(ruleId);
    } finally {
      evaluating = false;
      if (pendingEvaluate) { pendingEvaluate = false; schedule(); }
    }
  }

  function schedule(delay = 80) {
    clearTimeout(timer);
    timer = setTimeout(evaluateAll, delay);
  }

  chrome.runtime.onMessage.addListener(message => {
    switch (message?.type) {
      case 'BG_REMOVE_RULE_EFFECT_PAGE':
        suppressed.add(message.ruleId);
        removeDomRule(message.ruleId);
        break;
      case 'BG_REMOVE_ALL_EFFECTS_PAGE':
        for (const ruleId of applied.keys()) suppressed.add(ruleId);
        removeDomAll();
        break;
      case 'BG_RETRY_RULE_ON_PAGE':
      case 'POPUP_ENABLE_RULE':
        suppressed.delete(message.ruleId);
        schedule(0);
        break;
      case 'POPUP_DISABLE_RULE':
        suppressed.add(message.ruleId);
        removeDomRule(message.ruleId);
        break;
      default:
        break;
    }
  });

  chrome.storage.onChanged.addListener(changes => {
    const relevant = changes[SETTINGS_KEY] || Object.keys(changes).some(key => key.startsWith(RULE_PREFIX) || key.startsWith('idx:'));
    if (!relevant) return;
    if (changes[SETTINGS_KEY]?.newValue?.extensionEnabled === false) {
      removeDomAll();
      return;
    }
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(RULE_PREFIX)) continue;
      const rule = change.newValue;
      if (!rule?.enabled) suppressed.add(rule?.ruleId || key.slice(RULE_PREFIX.length));
      else if (rule.ruleId) suppressed.delete(rule.ruleId);
    }
    schedule(0);
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => m.type === 'childList' && m.addedNodes.length)) schedule(100);
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
