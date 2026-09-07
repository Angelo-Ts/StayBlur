(() => {
  'use strict';

  const SETTINGS_KEY = 'pb:settings';
  const RULE_PREFIX = 'rule:';
  const DOMAIN_PREFIX = 'idx:domain:';
  const PAGE_PREFIX = 'idx:page:';
  const ATTR = 'data-progettoblur-rule-id';
  const STYLE_ID = 'pb-rule-style';
  const HIGHLIGHT = 'pb-selection-highlight';
  const MAX_CANDIDATES = 1000;
  const RETRY_DELAYS = [25, 75, 150, 300, 600];
  const WEIGHTS = { stableId: .26, semanticAttributes: .22, textHash: .14, stableClasses: .12, ancestorContext: .10, structureContext: .08, cssSelector: .04, geometry: .02, tagName: .02 };
  const INDEPENDENT = ['stableId', 'semanticAttributes', 'textHash', 'stableClasses', 'ancestorContext', 'structureContext'];
  const EFFECT_CLASSES = ['pb-effect-base', 'pb-effect-blur', 'pb-effect-strongBlur', 'pb-effect-pixelate', 'pb-effect-blackout', 'pb-effect-hide'];

  const keyRule = id => `${RULE_PREFIX}${id}`;
  const keyDomain = d => `${DOMAIN_PREFIX}${d}`;
  const keyPage = (d, p) => `${PAGE_PREFIX}${d}:${p}`;
  const context = () => ({ domain: location.hostname, path: location.pathname || '/' });
  const contextKey = () => `${location.hostname}|${location.pathname || '/'}`;

  let settingsCache = { extensionEnabled: true };
  let settingsReady = false;
  let rulesCache = null;
  let rulesCacheContext = '';
  let rulesLoad = null;

  async function getSettings() {
    if (settingsReady) return settingsCache;
    const r = await chrome.storage.local.get({ [SETTINGS_KEY]: { extensionEnabled: true } });
    settingsCache = { extensionEnabled: true, ...(r[SETTINGS_KEY] || {}) };
    settingsReady = true;
    return settingsCache;
  }
  async function getRule(id) {
    const r = await chrome.storage.local.get({ [keyRule(id)]: undefined });
    return r[keyRule(id)];
  }
  async function getRules() {
    const ck = contextKey();
    if (rulesCache && rulesCacheContext === ck) return rulesCache;
    if (rulesLoad && rulesLoad.context === ck) return rulesLoad.promise;
    const promise = (async () => {
      const c = context();
      const r = await chrome.storage.local.get({ [keyDomain(c.domain)]: [], [keyPage(c.domain, c.path)]: [] });
      const ids = [...new Set([...(r[keyDomain(c.domain)] || []), ...(r[keyPage(c.domain, c.path)] || [])])];
      if (!ids.length) return [];
      const loaded = await chrome.storage.local.get(ids.map(keyRule));
      return ids.map(id => loaded[keyRule(id)]).filter(Boolean);
    })();
    rulesLoad = { context: ck, promise };
    const result = await promise;
    if (rulesLoad?.promise === promise) rulesLoad = null;
    if (contextKey() === ck) { rulesCache = result; rulesCacheContext = ck; }
    return result;
  }
  function invalidateRulesCache() { rulesCache = null; rulesCacheContext = ''; rulesLoad = null; }
  async function saveRule(rule) {
    const dKey = keyDomain(rule.domain), pKey = keyPage(rule.domain, rule.path || '/');
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
    const dKey = keyDomain(rule.domain), pKey = keyPage(rule.domain, rule.path || '/');
    const old = await chrome.storage.local.get({ [dKey]: [], [pKey]: [] });
    await chrome.storage.local.set({
      [dKey]: (old[dKey] || []).filter(x => x !== id),
      [pKey]: (old[pKey] || []).filter(x => x !== id)
    });
    if (rulesCache) rulesCache = rulesCache.filter(r => r.ruleId !== id);
  }

  const stableToken = value => value && !(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ||
    /^[a-f0-9]{10,}$/i.test(value) ||
    /(\d{9,}|\d{4,}_\d{4,})$/.test(value)
  );
  const stableTokens = tokens => (tokens || []).filter(stableToken);
  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000); }
  function volatileText(value) {
    const s = normalizeText(value);
    return !s || s.length > 1200 || /\b(?:\d{4,}|[A-F0-9]{12,})\b/i.test(s);
  }
  const attrNames = /^(data-|aria-|name$|role$|type$|href$|inputmode$|rel$|target$)/i;
  const rawAttrs = new Set(['role', 'type', 'inputmode', 'rel', 'target']);
  async function semanticAttrs(el) {
    const out = [];
    for (const a of el.attributes || []) {
      if (!attrNames.test(a.name) || !a.value) continue;
      const name = a.name.toLowerCase();
      out.push({ name, valueKind: rawAttrs.has(name) ? 'structural' : 'hash', value: rawAttrs.has(name) ? a.value.toLowerCase() : await sha256(a.value.toLowerCase()) });
    }
    return out;
  }
  function cssPathFor(el) {
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur instanceof Element && cur !== document.documentElement && depth++ < 8) {
      const tag = cur.tagName.toLowerCase();
      const id = stableToken(cur.id) ? cur.id : '';
      if (id) { parts.unshift(`#${CSS.escape(id)}`); break; }
      const classes = stableTokens(String(cur.className || '').split(/\s+/).filter(Boolean)).slice(0, 2);
      let part = tag;
      if (classes.length) part += `.${classes.map(CSS.escape).join('.')}`;
      const siblings = cur.parentElement ? [...cur.parentElement.children].filter(x => x.tagName === cur.tagName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join('>');
  }
  async function fingerprint(el) {
    const ids = stableTokens([el.id]);
    const classes = stableTokens(String(el.className || '').split(/\s+/).filter(Boolean));
    const attrs = await semanticAttrs(el);
    const text = normalizeText(el.textContent || '');
    const fp = { generationVersion: '1.5', cssSelector: cssPathFor(el), stableId: ids[0] ? { value: ids[0] } : undefined, semanticAttributes: attrs, stableClasses: classes.map(className => ({ className })), tagName: el.tagName.toLowerCase() };
    if (!volatileText(text)) fp.normalizedTextHash = { algorithm: 'SHA-256', hash: await sha256(text), stable: true };
    const chain = [];
    let p = el.parentElement, depth = 0;
    while (p && depth++ < 4) { chain.push({ tag: p.tagName.toLowerCase(), stableClasses: stableTokens(String(p.className || '').split(/\s+/).filter(Boolean)) }); p = p.parentElement; }
    fp.ancestorContext = { chain, depthCaptured: chain.length };
    const parent = el.parentElement, siblings = parent ? [...parent.children] : [], i = siblings.indexOf(el);
    fp.structureContext = { siblingSignature: { previousTag: i > 0 ? siblings[i - 1].tagName.toLowerCase() : undefined, nextTag: i >= 0 && i < siblings.length - 1 ? siblings[i + 1].tagName.toLowerCase() : undefined, indexWithinStableParent: i }, childSignature: { stableChildTagsTopK: [...new Set([...el.children].slice(0, 5).map(x => x.tagName.toLowerCase()))].slice(0, 3) } };
    const r = el.getBoundingClientRect(), vw = Math.max(innerWidth, 1), vh = Math.max(innerHeight, 1);
    fp.geometricHint = { viewportXRatio: Math.max(0, Math.min(1, r.x / vw)), viewportYRatio: Math.max(0, Math.min(1, r.y / vh)), widthRatio: Math.max(0, Math.min(1, r.width / vw)), heightRatio: Math.max(0, Math.min(1, r.height / vh)) };
    return fp;
  }
  function eqAttrs(a, b) { return a.name === b.name && a.valueKind === b.valueKind && a.value === b.value; }
  async function score(fp, el, cssMatched) {
    const attrs = await semanticAttrs(el), id = fp.stableId && el.id === fp.stableId.value ? 1 : 0;
    const semantic = fp.semanticAttributes?.length ? fp.semanticAttributes.filter(x => attrs.some(y => eqAttrs(x, y))).length / fp.semanticAttributes.length : 0;
    const text = fp.normalizedTextHash && !volatileText(el.textContent) && await sha256(normalizeText(el.textContent)) === fp.normalizedTextHash.hash ? 1 : 0;
    const classes = fp.stableClasses?.length ? fp.stableClasses.filter(x => stableTokens(String(el.className || '').split(/\s+/)).includes(x.className)).length / fp.stableClasses.length : 0;
    let parent = el.parentElement, ancestor = 0, depth = 0;
    for (const expected of fp.ancestorContext?.chain || []) {
      if (!parent || depth++ >= 4) break;
      if (parent.tagName.toLowerCase() === expected.tag && expected.stableClasses.every(c => stableTokens(String(parent.className || '').split(/\s+/)).includes(c))) ancestor += 1;
      parent = parent.parentElement;
    }
    ancestor = fp.ancestorContext?.chain?.length ? ancestor / fp.ancestorContext.chain.length : 0;
    const i = el.parentElement ? [...el.parentElement.children].indexOf(el) : -1;
    const structure = fp.structureContext?.siblingSignature?.indexWithinStableParent === i ? 1 : 0;
    const css = cssMatched ? 1 : 0;
    const r = el.getBoundingClientRect(), g = fp.geometricHint;
    const geometry = g ? Math.max(0, 1 - (Math.abs(r.x / Math.max(innerWidth, 1) - g.viewportXRatio) + Math.abs(r.y / Math.max(innerHeight, 1) - g.viewportYRatio) + Math.abs(r.width / Math.max(innerWidth, 1) - g.widthRatio) + Math.abs(r.height / Math.max(innerHeight, 1) - g.heightRatio)) / 4) : 0;
    const tag = fp.tagName === el.tagName.toLowerCase() ? 1 : 0;
    const parts = { stableId: { score: id, available: !!fp.stableId }, semanticAttributes: { score: semantic, available: !!fp.semanticAttributes?.length }, textHash: { score: text, available: !!fp.normalizedTextHash }, stableClasses: { score: classes, available: !!fp.stableClasses?.length }, ancestorContext: { score: ancestor, available: !!fp.ancestorContext?.chain?.length }, structureContext: { score: structure, available: true }, cssSelector: { score: css, available: true }, geometry: { score: geometry, available: !!g }, tagName: { score: tag, available: true } };
    let total = 0, available = 0;
    for (const [k, v] of Object.entries(parts)) if (v.available) { total += WEIGHTS[k] * v.score; available += WEIGHTS[k]; }
    const independent = INDEPENDENT.filter(k => parts[k].available && parts[k].score >= .65).length;
    return { element: el, totalScore: available ? total / available : 0, independent, parts };
  }

  const shadowRoots = new Set();
  function collectShadowRoots() {
    const roots = [document];
    const visit = root => { for (const el of root.querySelectorAll('*')) if (el.shadowRoot && !shadowRoots.has(el.shadowRoot)) { shadowRoots.add(el.shadowRoot); roots.push(el.shadowRoot); visit(el.shadowRoot); } };
    visit(document);
    for (const root of shadowRoots) if (!roots.includes(root)) roots.push(root);
    return roots;
  }
  function queryAll(selector) {
    const out = [];
    for (const root of collectShadowRoots()) { try { out.push(...root.querySelectorAll(selector)); } catch (_) {} }
    return out;
  }
  async function exactSelectorSafe(fp, el) {
    if (!el || el.tagName.toLowerCase() !== fp.tagName) return false;
    if (fp.stableId?.value && el.id !== fp.stableId.value) return false;
    if (fp.stableClasses?.length) {
      const current = stableTokens(String(el.className || '').split(/\s+/));
      if (!fp.stableClasses.some(x => current.includes(x.className))) return false;
    }
    if (fp.normalizedTextHash) {
      if (volatileText(el.textContent)) return false;
      return await sha256(normalizeText(el.textContent)) === fp.normalizedTextHash.hash;
    }
    return true;
  }
  async function match(fp) {
    const set = new Set(), cssSet = new WeakSet();
    if (fp.cssSelector) {
      const exact = queryAll(fp.cssSelector);
      if (exact.length === 1 && await exactSelectorSafe(fp, exact[0])) return { status: 'active', confidence: 1, selected: { element: exact[0], totalScore: 1, independent: 6, parts: {} } };
      exact.forEach(el => { set.add(el); cssSet.add(el); });
    }
    if (fp.stableId?.value) queryAll(`#${CSS.escape(fp.stableId.value)}`).forEach(el => set.add(el));
    for (const a of fp.semanticAttributes || []) if (a.valueKind === 'structural') queryAll(`[${CSS.escape(a.name)}="${CSS.escape(a.value)}"]`).forEach(el => set.add(el));
    if (!set.size) queryAll(fp.tagName || '*').slice(0, MAX_CANDIDATES).forEach(el => set.add(el));
    const ranked = [];
    for (const el of set) { ranked.push(await score(fp, el, cssSet.has(el))); if (ranked.length >= MAX_CANDIDATES) break; }
    ranked.sort((a, b) => b.totalScore - a.totalScore || b.independent - a.independent);
    const a = ranked[0], b = ranked[1];
    if (!a || a.totalScore < .6) return { status: 'notFound', confidence: a?.totalScore || 0, selected: a };
    if (a.totalScore < .85 || a.independent < 3 || Math.abs(a.totalScore - (b?.totalScore || 0)) <= .05) return { status: 'ambiguous', confidence: a.totalScore, selected: a };
    return { status: 'active', confidence: a.totalScore, selected: a };
  }

  const original = new WeakMap();
  const applied = new Map();
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = `.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:blur(8px) contrast(1.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}.${HIGHLIGHT}{outline:2px solid #00a3ff!important;outline-offset:1px!important;cursor:crosshair!important}`;
    (document.head || document.documentElement).appendChild(s);
  }
  function apply(el, rule) {
    if (!el) return;
    ensureStyle();
    if (!original.has(el)) original.set(el, { blur: el.style.getPropertyValue('--pb-blur'), strong: el.style.getPropertyValue('--pb-strong-blur') });
    const px = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    el.classList.add('pb-effect-base', `pb-effect-${rule.effect}`);
    el.style.setProperty('--pb-blur', `${Math.max(1, Math.round(px / 100 * 12))}px`);
    el.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(px / 100 * 28))}px`);
    el.setAttribute(ATTR, rule.ruleId);
    applied.set(rule.ruleId, el);
  }
  function removeElement(el) {
    if (!el) return;
    EFFECT_CLASSES.forEach(c => el.classList.remove(c));
    const o = original.get(el);
    if (o) {
      if (o.blur) el.style.setProperty('--pb-blur', o.blur); else el.style.removeProperty('--pb-blur');
      if (o.strong) el.style.setProperty('--pb-strong-blur', o.strong); else el.style.removeProperty('--pb-strong-blur');
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

  let selection = false, hover = null, retryTimer = null, evaluating = false, evaluateQueued = false;
  const retryCounts = new Map(), pageSuppressed = new Set();
  function stopSelection() {
    selection = false;
    document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true);
    if (hover) hover.classList.remove(HIGHLIGHT); hover = null;
  }
  function target(t) {
    if (!(t instanceof Element) || t.id === STYLE_ID || t.closest('[data-progettoblur-ui="true"]')) return null;
    return t;
  }
  function onMove(e) {
    const t = target(e.target); if (!t) return;
    if (hover) hover.classList.remove(HIGHLIGHT); hover = t; hover.classList.add(HIGHLIGHT);
  }
  async function onClick(e) {
    const t = target(e.target); if (!t) return;
    if (t.closest(`[${ATTR}]`)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); stopSelection(); return; }
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); stopSelection();
    const c = context(), now = new Date().toISOString();
    const rule = { ruleId: `rule-${crypto.randomUUID()}`, scope: 'page', domain: c.domain, path: c.path, url: location.href, enabled: true, status: 'active', effect: 'blur', intensity: 60, createdAt: now, updatedAt: now, fingerprint: await fingerprint(t) };
    await saveRule(rule); apply(t, rule); retryCounts.delete(rule.ruleId);
  }
  function onKey(e) { if (e.key === 'Escape') stopSelection(); }
  function startSelection() { stopSelection(); selection = true; document.addEventListener('mousemove', onMove, true); document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true); }

  async function persistStatus(rule, result) {
    if (rule.status === result.status && Math.abs(Number(rule.lastConfidence || 0) - Number(result.confidence || 0)) < .01) return;
    const updated = { ...rule, status: result.status, lastConfidence: result.confidence, statusContext: { domain: context().domain, path: context().path, evaluatedAt: new Date().toISOString() }, lastMatchedAt: result.status === 'active' ? new Date().toISOString() : rule.lastMatchedAt };
    await updateRule(updated);
  }
  async function evaluateRule(rule) {
    if (!rule.enabled || !(await getSettings()).extensionEnabled) { removeRule(rule.ruleId); return { status: 'disabled', confidence: 0 }; }
    if (pageSuppressed.has(rule.ruleId)) { removeRule(rule.ruleId); return { status: 'suppressed', confidence: 0 }; }
    const result = await match(rule.fingerprint);
    if (result.status === 'active' && result.selected?.element) apply(result.selected.element, rule); else removeRule(rule.ruleId);
    await persistStatus(rule, result);
    return result;
  }
  async function evaluateAll() {
    if (evaluating) { evaluateQueued = true; return; }
    evaluating = true;
    try {
      const rules = await getRules();
      const results = await Promise.all(rules.map(async r => ({ rule: r, result: await evaluateRule(r) })));
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
        if (pageSuppressed.has(id)) continue;
        const n = retryCounts.get(id) || 0;
        if (n >= RETRY_DELAYS.length) continue;
        retryCounts.set(id, n + 1);
        const r = rules.find(rule => rule.ruleId === id);
        if (!r || !r.enabled) continue;
        const result = await evaluateRule(r);
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
    const observer = new MutationObserver(() => {
      collectShadowRoots(); observeAllRoots();
      if (!evaluating) queueEvaluate(20); else evaluateQueued = true;
    });
    observer.observe(root, { childList: true, subtree: true });
    observedRoots.add(root);
  }
  function observeAllRoots() { if (document.documentElement) observeRoot(document.documentElement); for (const root of shadowRoots) observeRoot(root); }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      switch (message?.type) {
        case 'BG_ENTER_SELECTION': startSelection(); break;
        case 'BG_EXIT_SELECTION': stopSelection(); break;
        case 'BG_REMOVE_RULE_EFFECT_PAGE': pageSuppressed.add(message.ruleId); retryCounts.delete(message.ruleId); removeRule(message.ruleId); break;
        case 'BG_REMOVE_ALL_EFFECTS_PAGE': { const rules = await getRules(); rules.forEach(r => pageSuppressed.add(r.ruleId)); retryCounts.clear(); removeAll(); break; }
        case 'BG_RETRY_RULE_ON_PAGE': { pageSuppressed.delete(message.ruleId); retryCounts.delete(message.ruleId); const r = await getRule(message.ruleId); if (r) await evaluateRule(r); break; }
        case 'POPUP_DISABLE_RULE': { const r = await getRule(message.ruleId); if (r) { r.enabled = false; r.status = 'disabled'; pageSuppressed.delete(r.ruleId); await updateRule(r); removeRule(r.ruleId); } break; }
        case 'POPUP_ENABLE_RULE': { const r = await getRule(message.ruleId); if (r) { r.enabled = true; pageSuppressed.delete(r.ruleId); retryCounts.delete(r.ruleId); await updateRule(r); await evaluateRule(r); } break; }
        case 'POPUP_DELETE_RULE': pageSuppressed.delete(message.ruleId); retryCounts.delete(message.ruleId); removeRule(message.ruleId); await deleteRule(message.ruleId); break;
        case 'CONTENT_GET_STATE': { const settings = await getSettings(); sendResponse({ ok: true, extensionEnabled: settings.extensionEnabled !== false, selectionActive: selection, rules: await getRules() }); return; }
        default: break;
      }
      sendResponse({ ok: true });
    })().catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  });

  function installSpaHooks() {
    for (const name of ['pushState', 'replaceState']) {
      const originalFn = history[name]; if (originalFn.__progettoBlurWrapped) continue;
      const wrapped = function (...args) { const before = location.href; const result = originalFn.apply(this, args); if (location.href !== before) { retryCounts.clear(); pageSuppressed.clear(); invalidateRulesCache(); clearTimeout(retryTimer); evaluateAll(); } return result; };
      Object.defineProperty(wrapped, '__progettoBlurWrapped', { value: true }); history[name] = wrapped;
    }
    addEventListener('popstate', () => { retryCounts.clear(); pageSuppressed.clear(); invalidateRulesCache(); clearTimeout(retryTimer); evaluateAll(); }, true);
  }

  chrome.storage.onChanged.addListener(changes => {
    if (changes[SETTINGS_KEY]) {
      settingsCache = { extensionEnabled: true, ...(changes[SETTINGS_KEY].newValue || {}) };
      settingsReady = true;
      if (settingsCache.extensionEnabled === false) removeAll();
      else queueEvaluate(0);
    }
    if (Object.keys(changes).some(k => k.startsWith(RULE_PREFIX) || k.startsWith('idx:'))) {
      invalidateRulesCache();
      queueEvaluate(0);
    }
  });

  collectShadowRoots(); observeAllRoots();
  evaluateAll();
})();