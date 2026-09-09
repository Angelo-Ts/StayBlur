(() => {
  'use strict';

  const RULE_PREFIX = 'rule:';
  const ATTR = 'data-progettoblur-rule-id';
  const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];
  let globallyDisabled = false;
  let timer = null;

  function removeEffects() {
    for (const element of document.querySelectorAll(`[${ATTR}]`)) {
      element.classList.remove('pb-effect-base', ...EFFECTS.map(effect => `pb-effect-${effect}`));
      element.style.removeProperty('--pb-blur');
      element.style.removeProperty('--pb-strong-blur');
      element.removeAttribute(ATTR);
    }
    for (const effect of EFFECTS) {
      for (const element of document.querySelectorAll(`.pb-effect-${effect}`)) {
        element.classList.remove('pb-effect-base', ...EFFECTS.map(x => `pb-effect-${x}`));
        element.style.removeProperty('--pb-blur');
        element.style.removeProperty('--pb-strong-blur');
        element.removeAttribute(ATTR);
      }
    }
  }

  async function readGlobalState() {
    const state = await chrome.storage.local.get(null);
    const rules = Object.entries(state)
      .filter(([key, value]) => key.startsWith(RULE_PREFIX) && value && typeof value === 'object')
      .map(([, rule]) => rule);

    globallyDisabled = rules.length > 0 && rules.every(rule => rule.enabled === false);
    if (globallyDisabled) removeEffects();
    return globallyDisabled;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (await readGlobalState()) removeEffects();
    }, 0);
  }

  chrome.storage.onChanged.addListener(() => schedule());

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'BG_REMOVE_ALL_EFFECTS_PAGE') {
      globallyDisabled = true;
      removeEffects();
    }
    if (message?.type === 'BG_RETRY_RULE_ON_PAGE' || message?.type === 'POPUP_ENABLE_ALL_RULES') {
      globallyDisabled = false;
    }
  });

  const observer = new MutationObserver(mutations => {
    if (!globallyDisabled) return;
    if (mutations.some(m => m.type === 'childList' && m.addedNodes.length)) removeEffects();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  readGlobalState();
})();
