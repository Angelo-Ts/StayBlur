(() => {
  'use strict';

  const RULE_ATTR = 'data-progettoblur-rule-id';
  const RULE_PREFIX = 'rule:';
  const OVERLAY_ID = 'stayblur-rule-focus-overlay';
  const MESSAGE_SOURCE = 'stayblur-focus-rule';
  const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];

  let overlay = null;
  let focused = null;
  let timer = 0;

  const stable = value => {
    const s = String(value || '').trim();
    return !!s && !/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(s) &&
      !/^[a-f0-9]{10,}$/.test(s) && !/(\d{9,}|\d{4,}_\d{4,})$/.test(s);
  };
  const tokens = value => String(value || '').split(/\s+/).map(x => x.trim()).filter(stable);
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  const esc = value => CSS.escape(String(value));

  async function getRule(id) {
    const result = await chrome.storage.local.get({ [RULE_PREFIX + id]: null });
    return result[RULE_PREFIX + id] || null;
  }

  function frameDescriptor(frame) {
    const tag = (frame?.tagName || 'iframe').toLowerCase();
    const id = String(frame?.id || '').trim();
    const name = String(frame?.name || '').trim();
    if (id) return `${tag}#${id}`;
    if (name) return `${tag}[name=${name}]`;
    const parent = frame?.parentElement;
    const same = parent ? [...parent.children].filter(x => x.tagName === frame.tagName) : [];
    return `${tag}[n=${Math.max(0, same.indexOf(frame))}]`;
  }

  function frameKey() {
    const chain = [];
    try {
      let w = window;
      while (w !== w.top) {
        const frame = w.frameElement;
        if (!frame) return null;
        chain.unshift(frameDescriptor(frame));
        w = w.parent;
      }
      return chain.length ? `frame:${chain.join('/')}` : 'top';
    } catch (_) {
      return null;
    }
  }

  function score(fp, el) {
    let value = 0;
    let independent = 0;
    if (fp.stableId && el.id === fp.stableId) { value += 0.45; independent++; }
    const classes = fp.stableClasses || [];
    if (classes.length) {
      const hit = classes.filter(c => tokens(el.className).includes(c)).length / classes.length;
      if (hit >= 0.5) { value += 0.18 * hit; independent++; }
    }
    const attrs = fp.semanticAttributes || [];
    if (attrs.length) {
      const hit = attrs.filter(a => el.getAttribute(a.name)?.toLowerCase() === String(a.value).toLowerCase()).length / attrs.length;
      if (hit >= 0.5) { value += 0.18 * hit; independent++; }
    }
    if (fp.tagName === el.tagName.toLowerCase()) value += 0.05;
    if (fp.parentTag === el.parentElement?.tagName.toLowerCase()) value += 0.05;
    const parentClasses = fp.parentClasses || [];
    if (parentClasses.length) {
      const hit = parentClasses.filter(c => tokens(el.parentElement?.className).includes(c)).length / parentClasses.length;
      if (hit >= 0.5) { value += 0.06 * hit; independent++; }
    }
    if (Number.isInteger(fp.siblingIndex) && fp.siblingIndex === [...(el.parentElement?.children || [])].indexOf(el)) { value += 0.07; independent++; }
    if (fp.text && fp.text.length <= 600 && norm(el.textContent) === fp.text) { value += 0.12; independent++; }
    return { value: Math.min(1, value), independent };
  }

  function collectCandidates(rule) {
    const fp = rule.fingerprint || {};
    const candidates = [];
    const seen = new Set();
    const add = list => {
      for (const el of list) if (el instanceof Element && !seen.has(el)) { seen.add(el); candidates.push(el); }
    };
    try { add(document.querySelectorAll(`[${RULE_ATTR}="${esc(rule.ruleId)}"]`)); } catch (_) {}
    if (candidates.length) return candidates;
    if (fp.stableId) {
      try { const byId = [...document.querySelectorAll(`#${esc(fp.stableId)}`)]; if (byId.length === 1) return byId; add(byId); } catch (_) {}
    }
    if (fp.cssSelector) {
      try { const byCss = [...document.querySelectorAll(fp.cssSelector)]; if (byCss.length === 1) return byCss; add(byCss); } catch (_) {}
    }
    for (const attr of fp.semanticAttributes || []) {
      try { add(document.querySelectorAll(`[${esc(attr.name)}="${esc(attr.value)}"]`)); } catch (_) {}
    }
    if (fp.tagName && fp.text) for (const el of document.getElementsByTagName(fp.tagName)) if (norm(el.textContent) === fp.text) add([el]);
    if (!candidates.length && fp.tagName) { try { add(document.getElementsByTagName(fp.tagName)); } catch (_) {} }
    return candidates;
  }

  function choose(rule) {
    const fp = rule.fingerprint || {};
    const candidates = collectCandidates(rule);
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let best = null;
    let second = null;
    for (const el of candidates) {
      const scored = score(fp, el);
      const item = { el, ...scored };
      if (!best || item.value > best.value) { second = best; best = item; }
      else if (!second || item.value > second.value) second = item;
    }
    const gap = second ? best.value - second.value : 1;
    return best && best.independent >= 2 && best.value >= 0.25 && gap > 0.02 ? best.el : null;
  }

  function clear() {
    if (timer) clearTimeout(timer);
    timer = 0;
    if (overlay) overlay.remove();
    overlay = null;
    focused = null;
  }

  function update() {
    if (!overlay || !focused || !focused.isConnected) return clear();
    const rect = focused.getBoundingClientRect();
    Object.assign(overlay.style, {left:`${Math.round(rect.left-3)}px`,top:`${Math.round(rect.top-3)}px`,width:`${Math.max(0,Math.round(rect.width+6))}px`,height:`${Math.max(0,Math.round(rect.height+6))}px`});
  }

  function show(el) {
    clear();
    focused = el;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('data-progettoblur-ui', 'true');
    Object.assign(overlay.style, {position:'fixed',pointerEvents:'none',zIndex:'2147483647',border:'3px solid #1769d1',borderRadius:'3px',boxShadow:'0 0 0 5px rgba(23,105,209,.22)',boxSizing:'border-box'});
    (document.body || document.documentElement).appendChild(overlay);
    update();
    addEventListener('scroll', update, true);
    addEventListener('resize', update, true);
    timer = setTimeout(() => {removeEventListener('scroll', update, true);removeEventListener('resize', update, true);clear();}, 3500);
  }

  function applyEffect(el, rule) {
    if (!(el instanceof Element)) return;
    const effect = EFFECTS.includes(rule.effect) ? rule.effect : 'blur';
    const intensity = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    ['blur','strongBlur','pixelate','blackout','hide'].forEach(name => el.classList.remove(`pb-effect-${name}`));
    el.classList.add('pb-effect-base', `pb-effect-${effect}`);
    el.style.setProperty('--pb-blur', `${Math.max(1, Math.round(intensity * 0.12))}px`);
    el.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(intensity * 0.28))}px`);
    el.setAttribute(RULE_ATTR, rule.ruleId);
  }

  async function focusRule(ruleId) {
    const rule = await getRule(ruleId);
    if (!rule || (rule.frameKey && rule.frameKey !== (frameKey() || 'unknown'))) return false;
    const el = choose(rule);
    if (!el) return false;
    applyEffect(el, rule);
    try { el.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}); } catch (_) { el.scrollIntoView(); }
    requestAnimationFrame(() => requestAnimationFrame(() => show(el)));
    return true;
  }

  addEventListener('message', event => {
    const data = event?.data;
    if (!data || data.source !== MESSAGE_SOURCE || !data.ruleId) return;
    focusRule(data.ruleId).catch(() => {});
  });
})();
