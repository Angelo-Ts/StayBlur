(() => {
  'use strict';

  const RULE_ATTR = 'data-progettoblur-rule-id';
  const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];
  const HIGHLIGHT = 'pb-selection-highlight';
  const RULE_FOCUS = 'pb-rule-focus';
  const FOCUS_OVERLAY = 'stayblur-rule-focus-overlay';

  function removeVisualEffect(element) {
    if (!(element instanceof Element)) return;
    element.classList.remove('pb-effect-base', ...EFFECTS.map(effect => `pb-effect-${effect}`));
    element.style.removeProperty('--pb-blur');
    element.style.removeProperty('--pb-strong-blur');
    element.removeAttribute(RULE_ATTR);
  }

  function removeAllVisualEffects() {
    const elements = document.querySelectorAll(`[${RULE_ATTR}]`);
    for (const element of elements) removeVisualEffect(element);

    // Also clean orphaned effect classes left by a runtime that is no longer
    // tracking the element in its in-memory map.
    for (const effect of EFFECTS) {
      for (const element of document.querySelectorAll(`.pb-effect-${effect}`)) {
        removeVisualEffect(element);
      }
    }
  }

  function removeRuleVisualEffect(ruleId) {
    if (!ruleId) return;
    let elements = [];
    try {
      elements = document.querySelectorAll(`[${RULE_ATTR}="${CSS.escape(String(ruleId))}"]`);
    } catch (_) {
      return;
    }
    for (const element of elements) removeVisualEffect(element);
  }

  function clearSelectionUi() {
    for (const element of document.querySelectorAll(`.${HIGHLIGHT}, .${RULE_FOCUS}`)) {
      element.classList.remove(HIGHLIGHT, RULE_FOCUS);
    }
    document.getElementById(FOCUS_OVERLAY)?.remove();
  }

  addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    clearSelectionUi();
  }, true);

  chrome.runtime.onMessage.addListener(message => {
    switch (message?.type) {
      case 'BG_EXIT_SELECTION':
        clearSelectionUi();
        break;
      case 'BG_REMOVE_RULE_EFFECT_PAGE':
        removeRuleVisualEffect(message.ruleId);
        break;
      case 'BG_REMOVE_ALL_EFFECTS_PAGE':
        removeAllVisualEffects();
        clearSelectionUi();
        break;
      default:
        break;
    }
  });
})();
