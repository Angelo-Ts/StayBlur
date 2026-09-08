(() => {
  'use strict';

  const SETTINGS_KEY = 'pb:settings';
  const RULE_PREFIX = 'rule:';
  const DOMAIN_PREFIX = 'idx:domain:';
  const PAGE_PREFIX = 'idx:page:';
  const ATTR = 'data-progettoblur-rule-id';
  const STYLE_ID = 'pb-rule-style';
  const HIGHLIGHT = 'pb-selection-highlight';
  const RULE_FOCUS = 'pb-rule-focus';
  const MAX_CANDIDATES = 1000;
  const SOURCE_CAP = 200;
  const RETRY_DELAYS = [25, 75, 150, 300, 600];
  const INTEGRITY_ATTRS = ['class', 'style', 'id', 'hidden'];
  const SAFETY_MIN_CONFIDENCE = 0.85;
  const SAFETY_MIN_INDEPENDENT = 3;
  const EFFECT_CLASSES = ['pb-effect-base', 'pb-effect-blur', 'pb-effect-strongBlur', 'pb-effect-pixelate', 'pb-effect-blackout', 'pb-effect-hide'];
  const INDEPENDENT = ['stableId', 'semanticAttributes', 'textHash', 'stableClasses', 'ancestorContext', 'structureContext'];
  const WEIGHTS = { stableId: .26, semanticAttributes: .22, textHash: .14, stableClasses: .12, ancestorContext: .10, structureContext: .08, cssSelector: .04, geometry: .02, tagName: .02 };

  const keyRule = id => `${RULE_PREFIX}${id}`;
  const keyDomain = domain => `${DOMAIN_PREFIX}${domain}`;
  const keyPage = (domain, path) => `${PAGE_PREFIX}${domain}:${path}`;
  const context = () => ({ domain: location.hostname, path: location.pathname || '/' });
  const contextKey = () => `${location.hostname}|${location.pathname || '/'}`;

  function frameDescriptor(frame) {
    const tag = (frame?.tagName || 'iframe').toLowerCase();
    const id = typeof frame?.id === 'string' ? frame.id.trim() : '';
    const name = typeof frame?.name === 'string' ? frame.name.trim() : '';
    const parent = frame?.parentElement;
    const siblings = parent ? [...parent.children].filter(el => el.tagName === frame.tagName) : [];
    const index = siblings.indexOf(frame);
    if (id) return `${tag}#${id}`;
    if (name) return `${tag}[name=${name}]`;
    return `${tag}[n=${index >= 0 ? index : '?'}]`;
  }

  function frameContextKey() {
    const chain = [];
    try {
      let win = window;
      while (win !== win.top) {
        const frame = win.frameElement;
        if (!frame || frame.nodeType !== 1) return null;
        chain.unshift(frameDescriptor(frame));
        win = win.parent;
      }
    } catch (_) {
      return null;
    }
    return chain.length ? `frame:${chain.map((part, depth) => `${depth}:${part}`).join('/')}` : 'top';
  }

  function ruleAppliesToCurrentFrame(rule) {
    const current = frameContextKey();
    return !!current && (rule.frameKey ? rule.frameKey === current : current === 'top');
  }

  let settingsCache = { extensionEnabled: true, selectionEffect: 'blur', selectionIntensity: 60 };
  let settingsReady = false;
  let rulesCache = null;
  let rulesCacheContext = '';
  let rulesLoad = null;

  async function getSettings() {
    if (settingsReady) return settingsCache;
    const result = await chrome.storage.local.get({ [SETTINGS_KEY]: settingsCache });
    settingsCache = { ...settingsCache, ...(result[SETTINGS_KEY] || {}) };
    settingsReady = true;
    return settingsCache;
  }

  async function getRule(id) {
    const result = await chrome.storage.local.get({ [keyRule(id)]: undefined });
    return result[keyRule(id)];
  }

  async function getRules() {
    const currentKey = contextKey();
    if (rulesCache && rulesCacheContext === currentKey) return rulesCache;
    if (rulesLoad && rulesLoad.context === currentKey) return rulesLoad.promise;
    const promise = (async () => {
      const c = context();
      const stored = await chrome.storage.local.get({
        [keyDomain(c.domain)]: [],
        [keyPage(c.domain, c.path)]: []
      });
      const ids = [...new Set([...(stored[keyDomain(c.domain)] || []), ...(stored[keyPage(c.domain, c.path)] || [])])];
      if (!ids.length) return [];
      const loaded = await chrome.storage.local.get(ids.map(keyRule));
      return ids.map(id => loaded[keyRule(id)]).filter(Boolean).filter(ruleAppliesToCurrentFrame);
    })();
    rulesLoad = { context: currentKey, promise };
    const result = await promise;
    if (rulesLoad?.promise === promise) rulesLoad = null;
    if (contextKey() === currentKey) {
      rulesCache = result;
      rulesCacheContext = currentKey;
    }
    return result;
  }

  function invalidateRulesCache() {
    rulesCache = null;
    rulesCacheContext = '';
    rulesLoad = null;
  }

  let saveRuleQueue = Promise.resolve();
  function saveRule(rule) {
    const operation = saveRuleQueue.then(async () => {
      const dKey = keyDomain(rule.domain);
      const pKey = keyPage(rule.domain, rule.path || '/');
      const old = await chrome.storage.local.get({ [dKey]: [], [pKey]: [] });
      await chrome.storage.local.set({
        [keyRule(rule.ruleId)]: rule,
        [dKey]: [...new Set([...(old[dKey] || []), rule.ruleId])],
        [pKey]: [...new Set([...(old[pKey] || []), rule.ruleId])]
      });
      if (contextKey() === `${rule.domain}|${rule.path || '/'}`) {
        const current = rulesCache || [];
        rulesCache = [...current.filter(r => r.ruleId !== rule.ruleId), rule];
        rulesCacheContext = contextKey();
      }
      return rule;
    });
    saveRuleQueue = operation.catch(() => {});
    return operation;
  }

  async function updateRule(rule) {
    const updated = { ...rule, updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [keyRule(updated.ruleId)]: updated });
    if (rulesCache && rulesCacheContext === contextKey()) rulesCache = rulesCache.map(r => r.ruleId === updated.ruleId ? updated : r);
    return updated;
  }

  async function deleteRule(id) {
    const rule = await getRule(id);
    if (!rule) return;
    await chrome.storage.local.remove(keyRule(id));
    const dKey = keyDomain(rule.domain);
    const pKey = keyPage(rule.domain, rule.path || '/');
    const old = await chrome.storage.local.get({ [dKey]: [], [pKey]: [] });
    await chrome.storage.local.set({
      [dKey]: (old[dKey] || []).filter(x => x !== id),
      [pKey]: (old[pKey] || []).filter(x => x !== id)
    });
    if (rulesCache) rulesCache = rulesCache.filter(r => r.ruleId !== id);
  }

  const stableToken = value => value && !(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) || /^[a-f0-9]{10,}$/i.test(value) || /(\d{9,}|\d{4,}_\d{4,})$/.test(value));
  const stableTokens = tokens => (tokens || []).filter(stableToken);

  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const volatileText = value => {
    const s = normalizeText(value);
    return !s || s.length > 1200 || /\b(?:\d{4,}|[A-F0-9]{12,})\b/i.test(s);
  };

  const attrNames = /^(data-|aria-|name$|role$|type$|href$|inputmode$|rel$|target$)/i;
  const rawAttrs = new Set(['role', 'type', 'inputmode', 'rel', 'target']);
  const semanticCache = new WeakMap();

  async function semanticAttrs(el) {
    const cached = semanticCache.get(el);
    if (cached) return cached;
    const promise = (async () => {
      const out = [];
      for (const attr of el.attributes || []) {
        if (!attrNames.test(attr.name) || !attr.value) continue;
        const name = attr.name.toLowerCase();
        out.push({ name, valueKind: rawAttrs.has(name) ? 'structural' : 'hash', value: rawAttrs.has(name) ? attr.value.toLowerCase() : await sha256(attr.value.toLowerCase()) });
      }
      return out;
    })();
    semanticCache.set(el, promise);
    return promise;
  }

  function cssPathFor(el) {
    const parts = [];
    let current = el;
    let depth = 0;
    while (current instanceof Element && current !== document.documentElement && depth++ < 8) {
      const tag = current.tagName.toLowerCase();
      const id = stableToken(current.id) ? current.id : '';
      if (id) {
        parts.unshift(`#${CSS.escape(id)}`);
        break;
      }
      const classes = stableTokens(String(current.className || '').split(/\s+/).filter(Boolean)).slice(0, 2);
      let part = tag;
      if (classes.length) part += `.${classes.map(CSS.escape).join('.')}`;
      const siblings = current.parentElement ? [...current.parentElement.children].filter(x => x.tagName === current.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join('>');
  }

  async function fingerprint(el) {
    const ids = stableTokens([el.id]);
    const classes = stableTokens(String(el.className || '').split(/\s+/).filter(Boolean));
    const attrs = await semanticAttrs(el);
    const text = normalizeText(el.textContent || '');
    const fp = {
      generationVersion: '1.5',
      cssSelector: cssPathFor(el),
      stableId: ids[0] ? { value: ids[0] } : undefined,
      semanticAttributes: attrs,
      stableClasses: classes.map(className => ({ className })),
      tagName: el.tagName.toLowerCase()
    };
    if (!volatileText(text)) fp.normalizedTextHash = { algorithm: 'SHA-256', hash: await sha256(text), stable: true };
    const chain = [];
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth++ < 4) {
      chain.push({ tag: parent.tagName.toLowerCase(), stableClasses: stableTokens(String(parent.className || '').split(/\s+/).filter(Boolean)) });
      parent = parent.parentElement;
    }
    fp.ancestorContext = { chain, depthCaptured: chain.length };
    const siblings = el.parentElement ? [...el.parentElement.children] : [];
    const index = siblings.indexOf(el);
    fp.structureContext = {
      siblingSignature: { previousTag: index > 0 ? siblings[index - 1].tagName.toLowerCase() : undefined, nextTag: index >= 0 && index < siblings.length - 1 ? siblings[index + 1].tagName.toLowerCase() : undefined, indexWithinStableParent: index >= 0 ? index : undefined },
      childSignature: { stableChildTagsTopK: [...new Set([...el.children].slice(0, 5).map(x => x.tagName.toLowerCase()))].slice(0, 3) }
    };
    const rect = el.getBoundingClientRect();
    const vw = Math.max(innerWidth, 1);
    const vh = Math.max(innerHeight, 1);
    fp.geometricHint = { viewportXRatio: Math.max(0, Math.min(1, rect.x / vw)), viewportYRatio: Math.max(0, Math.min(1, rect.y / vh)), widthRatio: Math.max(0, Math.min(1, rect.width / vw)), heightRatio: Math.max(0, Math.min(1, rect.height / vh)) };
    return fp;
  }

  function eqAttrs(a, b) { return a.name === b.name && a.valueKind === b.valueKind && a.value === b.value; }

  async function score(fp, el, cssMatched) {
    const attrs = await semanticAttrs(el);
    const id = fp.stableId && el.id === fp.stableId.value ? 1 : 0;
    const semantic = fp.semanticAttributes?.length ? fp.semanticAttributes.filter(x => attrs.some(y => eqAttrs(x, y))).length / fp.semanticAttributes.length : 0;
    const text = fp.normalizedTextHash && !volatileText(el.textContent) && await sha256(normalizeText(el.textContent)) === fp.normalizedTextHash.hash ? 1 : 0;
    const classes = fp.stableClasses?.length ? fp.stableClasses.filter(x => stableTokens(String(el.className || '').split(/\s+/)).includes(x.className)).length / fp.stableClasses.length : 0;
    let parent = el.parentElement;
    let ancestor = 0;
    let depth = 0;
    for (const expected of fp.ancestorContext?.chain || []) {
      if (!parent || depth++ >= 4) break;
      if (parent.tagName.toLowerCase() === expected.tag && expected.stableClasses.every(c => stableTokens(String(parent.className || '').split(/\s+/)).includes(c))) ancestor++;
      parent = parent.parentElement;
    }
    ancestor = fp.ancestorContext?.chain?.length ? ancestor / fp.ancestorContext.chain.length : 0;
    const index = el.parentElement ? [...el.parentElement.children].indexOf(el) : -1;
    const expectedIndex = fp.structureContext?.siblingSignature?.indexWithinStableParent;
    const structureAvailable = Number.isInteger(expectedIndex) && expectedIndex >= 0;
    const structure = structureAvailable && expectedIndex === index ? 1 : 0;
    const css = cssMatched ? 1 : 0;
    const rect = el.getBoundingClientRect();
    const g = fp.geometricHint;
    const geometry = g ? Math.max(0, 1 - (Math.abs(rect.x / Math.max(innerWidth, 1) - g.viewportXRatio) + Math.abs(rect.y / Math.max(innerHeight, 1) - g.viewportYRatio) + Math.abs(rect.width / Math.max(innerWidth, 1) - g.widthRatio) + Math.abs(rect.height / Math.max(innerHeight, 1) - g.heightRatio)) / 4) : 0;
    const tag = fp.tagName === el.tagName.toLowerCase() ? 1 : 0;
    const parts = {
      stableId: { score: id, available: !!fp.stableId }, semanticAttributes: { score: semantic, available: !!fp.semanticAttributes?.length },
      textHash: { score: text, available: !!fp.normalizedTextHash }, stableClasses: { score: classes, available: !!fp.stableClasses?.length },
      ancestorContext: { score: ancestor, available: !!fp.ancestorContext?.chain?.length }, structureContext: { score: structure, available: structureAvailable },
      cssSelector: { score: css, available: true }, geometry: { score: geometry, available: !!g }, tagName: { score: tag, available: true }
    };
    let total = 0;
    let available = 0;
    for (const [key, value] of Object.entries(parts)) if (value.available) { total += WEIGHTS[key] * value.score; available += WEIGHTS[key]; }
    const independent = INDEPENDENT.filter(key => parts[key].available && parts[key].score >= .65).length;
    return { element: el, totalScore: available ? total / available : 0, independent, parts };
  }

  const shadowRoots = new Set();
  function collectShadowRoots() {
    const roots = [document];
    const visit = root => {
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot && !shadowRoots.has(el.shadowRoot)) {
        shadowRoots.add(el.shadowRoot);
        roots.push(el.shadowRoot);
        visit(el.shadowRoot);
      }
    };
    visit(document);
    for (const root of shadowRoots) if (!roots.includes(root)) roots.push(root);
    return roots;
  }

  function queryAll(selector, limit = Infinity) {
    const out = [];
    for (const root of collectShadowRoots()) {
      try {
        for (const el of root.querySelectorAll(selector)) {
          out.push(el);
          if (out.length >= limit) return out;
        }
      } catch (_) {}
    }
    return out;
  }

  async function match(fp) {
    const set = new Set();
    const cssSet = new WeakSet();
    const add = (elements, css = false) => {
      for (const el of elements) {
        if (set.size >= MAX_CANDIDATES) break;
        set.add(el);
        if (css) cssSet.add(el);
      }
    };
    if (fp.stableId?.value) add(queryAll(`#${CSS.escape(fp.stableId.value)}`, SOURCE_CAP));
    for (const attr of fp.semanticAttributes || []) if (attr.valueKind === 'structural') {
      add(queryAll(`[${CSS.escape(attr.name)}="${CSS.escape(attr.value)}"]`, SOURCE_CAP));
      if (set.size >= MAX_CANDIDATES) break;
    }
    if (fp.cssSelector) add(queryAll(fp.cssSelector, SOURCE_CAP), true);
    if (!set.size) add(queryAll(fp.tagName || '*', MAX_CANDIDATES));
    const ranked = [];
    for (const el of set) ranked.push(await score(fp, el, cssSet.has(el)));
    ranked.sort((a, b) => b.totalScore - a.totalScore || b.independent - a.independent || String(a.element?.id || '').localeCompare(String(b.element?.id || '')));
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.totalScore < .6) return { status: 'notFound', confidence: best?.totalScore || 0, selected: best };
    if (best.totalScore < SAFETY_MIN_CONFIDENCE || best.independent < SAFETY_MIN_INDEPENDENT || (second && Math.abs(best.totalScore - second.totalScore) <= .05)) return { status: 'ambiguous', confidence: best.totalScore, selected: best };
    return { status: 'active', confidence: best.totalScore, selected: best };
  }

  let styleReady = false;
  function ensureStyle() {
    if (styleReady || document.getElementById(STYLE_ID)) { styleReady = true; return; }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:blur(8px) contrast(1.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(style);
    styleReady = true;
  }

  const original = new WeakMap();
  const applied = new Map();
  function apply(el, rule) {
    if (!(el instanceof Element)) return;
    ensureStyle();
    if (!original.has(el)) original.set(el, { filter: el.style.filter, visibility: el.style.visibility, color: el.style.color, textShadow: el.style.textShadow, blur: el.style.getPropertyValue('--pb-blur'), strong: el.style.getPropertyValue('--pb-strong-blur') });
    const px = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    EFFECT_CLASSES.slice(1).forEach(c => el.classList.remove(c));
    el.classList.add('pb-effect-base', `pb-effect-${rule.effect || 'blur'}`);
    el.style.setProperty('--pb-blur', `${Math.max(1, Math.round(px / 100 * 12))}px`);
    el.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(px / 100 * 28))}px`);
    el.setAttribute(ATTR, rule.ruleId);
    applied.set(rule.ruleId, el);
  }

  function removeElement(el) {
    if (!(el instanceof Element)) return;
    el.classList.remove(RULE_FOCUS);
    EFFECT_CLASSES.forEach(c => el.classList.remove(c));
    const old = original.get(el);
    if (old) {
      old.filter ? el.style.setProperty('filter', old.filter) : el.style.removeProperty('filter');
      old.visibility ? el.style.setProperty('visibility', old.visibility) : el.style.removeProperty('visibility');
      old.color ? el.style.setProperty('color', old.color) : el.style.removeProperty('color');
      old.textShadow ? el.style.setProperty('text-shadow', old.textShadow) : el.style.removeProperty('text-shadow');
      old.blur ? el.style.setProperty('--pb-blur', old.blur) : el.style.removeProperty('--pb-blur');
      old.strong ? el.style.setProperty('--pb-strong-blur', old.strong) : el.style.removeProperty('--pb-strong-blur');
      original.delete(el);
    }
    el.removeAttribute(ATTR);
  }

  function removeRule(id) {
    const el = applied.get(id);
    if (el) removeElement(el);
    applied.delete(id);
    if (!el) queryAll(`[${ATTR}="${CSS.escape(id)}"]`).forEach(removeElement);
  }

  function removeAll() {
    applied.clear();
    queryAll(`[${ATTR}]`).forEach(removeElement);
  }

  function effectIsIntact(el, rule) {
    return el instanceof Element && el.isConnected && el.getAttribute(ATTR) === rule.ruleId && el.classList.contains('pb-effect-base') && el.classList.contains(`pb-effect-${rule.effect || 'blur'}`);
  }

  let integrityFrame = 0;
  let integrityQueued = false;
  async function checkAppliedIntegrity() {
    integrityFrame = 0;
    integrityQueued = false;
    if (!(await getSettings()).extensionEnabled || !applied.size) return;
    const rules = await getRules();
    const byId = new Map(rules.map(rule => [rule.ruleId, rule]));
    const missing = [];
    for (const [id, el] of applied) {
      const rule = byId.get(id);
      if (!rule || pageSuppressed.has(id) || (selection && selectionCreated.has(id))) continue;
      if (!effectIsIntact(el, rule)) missing.push([el, rule]);
    }
    for (const [el, rule] of missing) if (el.isConnected) apply(el, rule); else queueEvaluate(0);
  }

  function queueIntegrityCheck() {
    if (integrityQueued) return;
    integrityQueued = true;
    if (typeof requestAnimationFrame === 'function') integrityFrame = requestAnimationFrame(checkAppliedIntegrity);
    else integrityFrame = setTimeout(checkAppliedIntegrity, 0);
  }

  let selection = false;
  let hover = null;
  let focusedRule = null;
  let retryTimer = null;
  let evaluating = false;
  let evaluateQueued = false;
  const selectionCreated = new Set();
  const retryCounts = new Map();
  const pageSuppressed = new Set();

  function stopSelection() {
    const wasActive = selection;
    selection = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    if (hover) hover.classList.remove(HIGHLIGHT);
    hover = null;
    if (wasActive) queueEvaluate(0);
  }

  function clearRuleFocus() {
    if (focusedRule) {
      focusedRule.classList.remove(RULE_FOCUS);
      focusedRule = null;
    }
  }

  function target(node) {
    if (!(node instanceof Element) || node.id === STYLE_ID || node.closest('[data-progettoblur-ui="true"]')) return null;
    return node;
  }

  function onMove(event) {
    const element = target(event.target);
    if (!element) return;
    if (hover && hover !== focusedRule) hover.classList.remove(HIGHLIGHT);
    hover = element;
    hover.classList.add(HIGHLIGHT);
  }

  function onClick(event) {
    const element = target(event.target);
    if (!element || element.tagName === 'IFRAME') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (element.closest(`[${ATTR}]`)) return;
    if (!selection) return;
    clearRuleFocus();
    const c = context();
    const now = new Date().toISOString();
    const settings = settingsCache || { extensionEnabled: true, selectionEffect: 'blur', selectionIntensity: 60 };
    const allowedEffects = new Set(['blur', 'strongBlur', 'pixelate', 'blackout', 'hide']);
    const effect = allowedEffects.has(settings.selectionEffect) ? settings.selectionEffect : 'blur';
    const intensity = Math.max(0, Math.min(100, Number(settings.selectionIntensity ?? 60)));
    const rule = {
      ruleId: `rule-${crypto.randomUUID()}`,
      scope: 'page', domain: c.domain, path: c.path, url: location.href,
      frameKey: frameContextKey() || 'unknown', enabled: true, status: 'active', effect, intensity,
      createdAt: now, updatedAt: now, fingerprint: null
    };
    selectionCreated.add(rule.ruleId);
    apply(element, rule);
    retryCounts.delete(rule.ruleId);
    void (async () => {
      try {
        rule.fingerprint = await fingerprint(element);
        await saveRule(rule);
      } catch (_) {
        selectionCreated.delete(rule.ruleId);
        removeRule(rule.ruleId);
      }
    })();
  }

  function startSelection() {
    stopSelection();
    selectionCreated.clear();
    selection = true;
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
  }

  function focusRule(id) {
    clearRuleFocus();
    let element = applied.get(id);
    if (!element) element = queryAll(`[${ATTR}="${CSS.escape(id)}"]`, 10)[0];
    if (!element) return false;
    focusedRule = element;
    element.classList.add(RULE_FOCUS);
    try { element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); } catch (_) { element.scrollIntoView(); }
    return true;
  }

  globalThis.__progettoBlurStartSelection = startSelection;
  globalThis.__progettoBlurStopSelection = stopSelection;
  addEventListener('keydown', event => {
    if (selection && event.key === 'Escape') {
      event.preventDefault();
      stopSelection();
    }
  }, true);

  async function persistStatus(rule, result) {
    if (rule.status === result.status && Math.abs(Number(rule.lastConfidence || 0) - Number(result.confidence || 0)) < .01) return;
    await updateRule({ ...rule, status: result.status, lastConfidence: result.confidence, statusContext: { domain: context().domain, path: context().path, evaluatedAt: new Date().toISOString() }, lastMatchedAt: result.status === 'active' ? new Date().toISOString() : rule.lastMatchedAt });
  }

  async function evaluateRule(rule) {
    if (selection && selectionCreated.has(rule.ruleId) && applied.has(rule.ruleId)) return { status: 'active', confidence: rule.lastConfidence || 1 };
    if (!ruleAppliesToCurrentFrame(rule)) { removeRule(rule.ruleId); return { status: 'notApplicable', confidence: 0 }; }
    if (!rule.enabled || !(await getSettings()).extensionEnabled) { removeRule(rule.ruleId); return { status: 'disabled', confidence: 0 }; }
    if (pageSuppressed.has(rule.ruleId)) { removeRule(rule.ruleId); return { status: 'suppressed', confidence: 0 }; }
    const result = await match(rule.fingerprint);
    if (result.status === 'active' && result.selected?.element) apply(result.selected.element, rule);
    else if (!(selection && selectionCreated.has(rule.ruleId))) removeRule(rule.ruleId);
    await persistStatus(rule, result);
    return result;
  }

  async function evaluateAll() {
    if (evaluating) { evaluateQueued = true; return; }
    evaluating = true;
    try {
      const rules = await getRules();
      const results = await Promise.all(rules.map(async rule => ({ rule, result: await evaluateRule(rule) })));
      const pending = results.filter(x => x.rule.enabled && !pageSuppressed.has(x.rule.ruleId) && (x.result.status === 'notFound' || x.result.status === 'ambiguous')).map(x => x.rule.ruleId);
      if (pending.length) scheduleRetries(pending);
    } finally {
      evaluating = false;
      if (evaluateQueued) { evaluateQueued = false; queueEvaluate(0); }
    }
  }

  function scheduleRetries(ids) {
    clearTimeout(retryTimer);
    const attempt = Math.max(...ids.map(id => retryCounts.get(id) || 0));
    if (attempt >= RETRY_DELAYS.length) return;
    retryTimer = setTimeout(async () => {
      const next = [];
      const rules = await getRules();
      for (const id of ids) {
        if (pageSuppressed.has(id) || (selection && selectionCreated.has(id))) continue;
        const count = retryCounts.get(id) || 0;
        if (count >= RETRY_DELAYS.length) continue;
        retryCounts.set(id, count + 1);
        const rule = rules.find(r => r.ruleId === id);
        if (!rule || !rule.enabled) continue;
        const result = await evaluateRule(rule);
        if (result.status !== 'active') next.push(id);
      }
      if (next.length) scheduleRetries(next);
    }, RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
  }

  function queueEvaluate(delay = 20) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(evaluateAll, delay);
  }

  const observedRoots = new WeakSet();
  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    const observer = new MutationObserver(mutations => {
      let added = false;
      let integrity = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) added = true;
        if (mutation.type === 'attributes' && mutation.target instanceof Element && applied.has(mutation.target)) integrity = true;
      }
      if (integrity) queueIntegrityCheck();
      if (added) {
        collectShadowRoots();
        observeAllRoots();
        if (!selection) {
          if (!evaluating) queueEvaluate(20);
          else evaluateQueued = true;
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: INTEGRITY_ATTRS });
    observedRoots.add(root);
  }

  function observeAllRoots() {
    if (document.documentElement) observeRoot(document.documentElement);
    for (const root of shadowRoots) observeRoot(root);
  }

  addEventListener('scroll', queueIntegrityCheck, { capture: true, passive: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message?.type) {
        case 'BG_ENTER_SELECTION': startSelection(); break;
        case 'BG_EXIT_SELECTION': stopSelection(); break;
        case 'BG_FOCUS_RULE': focusRule(message.ruleId); break;
        case 'BG_REMOVE_RULE_EFFECT_PAGE': pageSuppressed.add(message.ruleId); retryCounts.delete(message.ruleId); removeRule(message.ruleId); break;
        case 'BG_REMOVE_ALL_EFFECTS_PAGE': { const rules = await getRules(); rules.forEach(r => pageSuppressed.add(r.ruleId)); retryCounts.clear(); removeAll(); break; }
        case 'BG_RETRY_RULE_ON_PAGE': { pageSuppressed.delete(message.ruleId); retryCounts.delete(message.ruleId); const rule = await getRule(message.ruleId); if (rule) await evaluateRule(rule); break; }
        case 'POPUP_DISABLE_RULE': { const rule = await getRule(message.ruleId); if (rule) { rule.enabled = false; rule.status = 'disabled'; pageSuppressed.delete(rule.ruleId); await updateRule(rule); removeRule(rule.ruleId); } break; }
        case 'POPUP_ENABLE_RULE': { const rule = await getRule(message.ruleId); if (rule) { rule.enabled = true; pageSuppressed.delete(rule.ruleId); retryCounts.delete(rule.ruleId); await updateRule(rule); await evaluateRule(rule); } break; }
        case 'POPUP_DELETE_RULE': pageSuppressed.delete(message.ruleId); retryCounts.delete(message.ruleId); selectionCreated.delete(message.ruleId); removeRule(message.ruleId); await deleteRule(message.ruleId); break;
        case 'CONTENT_GET_STATE': { const settings = await getSettings(); sendResponse({ ok: true, extensionEnabled: settings.extensionEnabled !== false, selectionActive: selection, rules: await getRules() }); return; }
        default: break;
      }
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });

  function installSpaHooks() {
    for (const name of ['pushState', 'replaceState']) {
      const originalFn = history[name];
      if (originalFn.__progettoBlurWrapped) continue;
      const wrapped = function (...args) {
        const before = location.href;
        const result = originalFn.apply(this, args);
        if (location.href !== before) {
          retryCounts.clear();
          pageSuppressed.clear();
          selectionCreated.clear();
          invalidateRulesCache();
          clearTimeout(retryTimer);
          evaluateAll();
        }
        return result;
      };
      Object.defineProperty(wrapped, '__progettoBlurWrapped', { value: true });
      history[name] = wrapped;
    }
    addEventListener('popstate', () => {
      retryCounts.clear(); pageSuppressed.clear(); selectionCreated.clear(); invalidateRulesCache(); clearTimeout(retryTimer); evaluateAll();
    }, true);
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes[SETTINGS_KEY]) {
      settingsCache = { extensionEnabled: true, selectionEffect: 'blur', selectionIntensity: 60, ...(changes[SETTINGS_KEY].newValue || {}) };
      settingsReady = true;
      if (settingsCache.extensionEnabled === false) removeAll();
      else if (!selection) queueEvaluate(0);
    }
    if (Object.keys(changes).some(key => key.startsWith(RULE_PREFIX) || key.startsWith('idx:'))) {
      invalidateRulesCache();
      if (!selection) queueEvaluate(0);
    }
  });

  installSpaHooks();
  collectShadowRoots();
  observeAllRoots();
  evaluateAll();
})();
