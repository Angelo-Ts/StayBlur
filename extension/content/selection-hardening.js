(() => {
  'use strict';
  const ATTR = 'data-progettoblur-rule-id';
  const FOCUS = 'pb-focus-overlay';
  const STYLE = 'pb-hardening-style';
  let overlay = null;
  let target = null;
  let raf = 0;
  let restoring = false;

  const ruleKey = id => `rule:${id}`;
  const domainKey = d => `idx:domain:${d}`;
  const pageKey = (d, p) => `idx:page:${d}:${p}`;

  function ensureOverlayStyle() {
    if (document.getElementById(STYLE)) return;
    const style = document.createElement('style');
    style.id = STYLE;
    style.textContent = `#${FOCUS}{position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:3px solid #1769d1;box-shadow:0 0 0 5px rgba(23,105,209,.22);border-radius:3px;display:none}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureOverlay() {
    ensureOverlayStyle();
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = FOCUS;
    overlay.setAttribute('data-progettoblur-ui', 'true');
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function updateOverlay() {
    raf = 0;
    if (!target || !target.isConnected) {
      if (overlay) overlay.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) {
      if (overlay) overlay.style.display = 'none';
      return;
    }
    const o = ensureOverlay();
    o.style.display = 'block';
    o.style.left = `${Math.max(0, r.left - 2)}px`;
    o.style.top = `${Math.max(0, r.top - 2)}px`;
    o.style.width = `${Math.max(0, r.width + 4)}px`;
    o.style.height = `${Math.max(0, r.height + 4)}px`;
  }

  function scheduleOverlay() {
    if (!raf) raf = requestAnimationFrame(updateOverlay);
  }

  function clearOverlay() {
    target = null;
    if (overlay) overlay.style.display = 'none';
  }

  async function readRules() {
    try {
      const domain = location.hostname;
      const path = location.pathname || '/';
      const dk = domainKey(domain);
      const pk = pageKey(domain, path);
      const index = await chrome.storage.local.get({ [dk]: [], [pk]: [] });
      const ids = [...new Set([...(index[dk] || []), ...(index[pk] || [])])];
      if (!ids.length) return [];
      const rules = await chrome.storage.local.get(ids.map(ruleKey));
      return ids.map(id => rules[ruleKey(id)]).filter(Boolean).filter(r => r.enabled !== false && (!r.frameKey || r.frameKey === 'top'));
    } catch (_) {
      return [];
    }
  }

  function cssEscape(v) { return CSS.escape(String(v)); }
  function stable(v) { const s=String(v||'').trim(); return !!s && !/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(s) && !/^[a-f0-9]{10,}$/.test(s) && !/(\d{9,}|\d{4,}_\d{4,})$/.test(s); }
  function tokens(v) { return String(v||'').split(/\s+/).map(x=>x.trim()).filter(stable); }
  function norm(v) { return String(v||'').replace(/\s+/g,' ').trim().slice(0,1200); }

  function candidates(rule) {
    const fp = rule.fingerprint || {};
    const out = [];
    const seen = new Set();
    const add = xs => { for (const x of xs) if (!seen.has(x)) { seen.add(x); out.push(x); } };
    if (fp.cssSelector) {
      try { const xs = document.querySelectorAll(fp.cssSelector); if (xs.length === 1) add(xs); } catch (_) {}
    }
    if (fp.stableId) {
      try { add(document.querySelectorAll(`#${cssEscape(fp.stableId)}`)); } catch (_) {}
    }
    for (const a of fp.semanticAttributes || []) {
      try { add(document.querySelectorAll(`[${cssEscape(a.name)}="${cssEscape(a.value)}"]`)); } catch (_) {}
    }
    if (fp.tagName && !out.length) add(document.getElementsByTagName(fp.tagName));
    return out;
  }

  function best(rule) {
    const fp = rule.fingerprint || {};
    let winner = null;
    let bestScore = -1;
    let second = -1;
    let count = 0;
    for (const el of candidates(rule)) {
      count += 1;
      let score = 0;
      if (fp.stableId && el.id === fp.stableId) score += .45;
      const cls = fp.stableClasses || [];
      if (cls.length) {
        const hit = cls.filter(c => tokens(el.className).includes(c)).length / cls.length;
        if (hit >= .65) score += .18;
      }
      const attrs = fp.semanticAttributes || [];
      if (attrs.length) {
        let hit = 0;
        for (const a of attrs) if (el.getAttribute(a.name)?.toLowerCase() === a.value) hit += 1;
        if (hit / attrs.length >= .65) score += .18;
      }
      if (fp.tagName === el.tagName.toLowerCase()) score += .05;
      if (fp.parentTag === el.parentElement?.tagName.toLowerCase()) score += .05;
      if (Number.isInteger(fp.siblingIndex) && fp.siblingIndex === [...(el.parentElement?.children || [])].indexOf(el)) score += .07;
      if (fp.text && norm(el.textContent) === fp.text && fp.text.length <= 600) score += .08;
      if (score > bestScore) { second = bestScore; bestScore = score; winner = el; }
      else if (score > second) second = score;
    }
    if (!winner) return null;
    if (count === 1) return winner;
    return bestScore >= .72 && bestScore - second > .05 ? winner : null;
  }

  function applyVisual(rule, el) {
    const i = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    const effect = ['blur','strongBlur','pixelate','blackout','hide'].includes(rule.effect) ? rule.effect : 'blur';
    el.classList.add('pb-effect-base', `pb-effect-${effect}`);
    el.style.setProperty('--pb-blur', `${Math.max(1, Math.round(i * .12))}px`);
    el.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round(i * .28))}px`);
    el.setAttribute(ATTR, rule.ruleId);
  }

  async function reapplyAfterSelection() {
    if (restoring) return;
    restoring = true;
    try {
      const rules = await readRules();
      for (const rule of rules) {
        if (document.querySelector(`[${ATTR}="${cssEscape(rule.ruleId)}"]`)) continue;
        const el = best(rule);
        if (el) applyVisual(rule, el);
      }
    } finally {
      restoring = false;
    }
  }

  chrome.runtime.onMessage.addListener(m => {
    if (m?.type !== 'BG_FOCUS_RULE') return;
    setTimeout(() => {
      try {
        const el = document.querySelector(`[${ATTR}="${cssEscape(m.ruleId)}"]`);
        if (el) { target = el; scheduleOverlay(); }
      } catch (_) {}
    }, 120);
  });

  addEventListener('scroll', scheduleOverlay, true);
  addEventListener('resize', scheduleOverlay, true);
  addEventListener('transitionrun', scheduleOverlay, true);
  addEventListener('transitionend', scheduleOverlay, true);

  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    clearOverlay();
    setTimeout(reapplyAfterSelection, 0);
    setTimeout(reapplyAfterSelection, 150);
    setTimeout(reapplyAfterSelection, 500);
  }, true);
})();
