(() => {
  'use strict';

  const HIGHLIGHT = 'pb-selection-highlight';
  const UI_SELECTOR = '[data-progettoblur-ui="true"]';
  const RULE_ATTR = 'data-progettoblur-rule-id';
  const MAX_DEPTH = 5;
  const VIEWPORT_AREA_LIMIT = 0.72;
  const LEAF_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'small', 'code', 'mark', 'abbr', 'label']);
  const STRUCTURAL_TAGS = new Set(['article', 'section', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'li', 'fieldset', 'figure', 'table', 'tr', 'td', 'th']);
  const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'textarea', 'select', 'option']);
  const SEMANTIC_ROLES = new Set(['button', 'link', 'listitem', 'menuitem', 'option', 'tab', 'dialog', 'article', 'region', 'navigation', 'main', 'complementary']);
  const STRONG_CONTAINER_WORDS = /(?:card|panel|tile|modal|dialog|sidebar)/i;
  const CONTAINER_WORDS = /(?:item|row|container|wrapper|section|menu|list|content|group|box)/i;

  let originalStart = null;
  let originalStop = null;
  let active = false;
  let syntheticClick = false;
  let current = null;

  function isElement(value) {
    return value instanceof Element;
  }

  function isBlocked(element) {
    return !isElement(element) || element.closest(UI_SELECTOR) || element.id === 'pb-pixelate-svg';
  }

  function viewportArea(element) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return 0;
    return Math.max(0, rect.width * rect.height);
  }

  function semanticScore(element) {
    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const className = typeof element.className === 'string' ? element.className : '';
    const id = element.id || '';

    let score = 0;
    if (STRUCTURAL_TAGS.has(tag)) score += 3;
    if (INTERACTIVE_TAGS.has(tag)) score += 4;
    if (SEMANTIC_ROLES.has(role)) score += 4;
    if (STRONG_CONTAINER_WORDS.test(className)) score += 4;
    else if (CONTAINER_WORDS.test(className)) score += 1.5;
    if (element.hasAttribute('data-testid') || element.hasAttribute('data-test')) score += 1;
    if (STRONG_CONTAINER_WORDS.test(id)) score += 3;
    else if (/(?:item|row|container|section|menu|list|content|group|box)/i.test(id)) score += 1.5;
    return score;
  }

  function candidateScore(element, origin, depth) {
    const tag = element.tagName.toLowerCase();
    const rect = element.getBoundingClientRect();
    const area = viewportArea(element);
    const viewportAreaTotal = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = area / viewportAreaTotal;
    const originArea = Math.max(1, viewportArea(origin));
    const growth = Math.min(4, Math.log2(Math.max(1, area / originArea)));

    let score = semanticScore(element);

    // Expansion is useful, but should not by itself cause a large page wrapper
    // to beat a nearby card. Moderate growth is the sweet spot.
    if (growth > 0) score += Math.min(2.8, growth * 0.9);
    if (growth > 3) score -= (growth - 3) * 1.8;

    // Prefer nearby ancestors when scores are otherwise similar.
    score -= Math.max(0, depth - 1) * 0.45;

    if (LEAF_TAGS.has(tag)) score -= 4;
    if (tag === 'div') score += 0.25;
    if (tag === 'p') score -= 0.75;

    // A table cell/row is often just an intermediate wrapper. Keep structural
    // semantics, but make it harder for generic table nodes to win over a card.
    if (tag === 'table' || tag === 'tr' || tag === 'td' || tag === 'th') score -= 1;

    // Penalize oversized candidates progressively rather than using only a hard
    // cutoff. This prevents generic app/page containers from winning by area.
    if (areaRatio > 0.35) score -= (areaRatio - 0.35) * 12;
    if (areaRatio > VIEWPORT_AREA_LIMIT) score -= 7;
    if (rect.width > window.innerWidth * 0.95 && rect.height > window.innerHeight * 0.95) score -= 8;
    if (element.hasAttribute(RULE_ATTR)) score -= 6;

    return score;
  }

  function chooseTarget(eventTarget) {
    if (isBlocked(eventTarget)) return null;

    const origin = eventTarget;
    const originTag = origin.tagName.toLowerCase();
    if (INTERACTIVE_TAGS.has(originTag) || origin.hasAttribute('contenteditable')) return origin;

    let best = origin;
    let bestScore = candidateScore(origin, origin, 0);
    let candidate = origin.parentElement;

    for (let depth = 1; candidate && depth <= MAX_DEPTH; depth += 1) {
      if (isBlocked(candidate)) break;
      const tag = candidate.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body' || tag === 'head') break;

      const score = candidateScore(candidate, origin, depth);
      if (score > bestScore + 0.35) {
        best = candidate;
        bestScore = score;
      }
      candidate = candidate.parentElement;
    }

    return best;
  }

  function setHighlight(element) {
    if (current === element) return;
    if (current) current.classList.remove(HIGHLIGHT);
    current = element;
    if (current) current.classList.add(HIGHLIGHT);
  }

  function clearHighlight() {
    if (current) current.classList.remove(HIGHLIGHT);
    current = null;
  }

  function handleMouseMove(event) {
    if (!active || syntheticClick) return;
    const target = chooseTarget(event.target);
    if (!target) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    setHighlight(target);
  }

  function handleClick(event) {
    if (!active || syntheticClick) return;
    const target = chooseTarget(event.target);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    syntheticClick = true;
    try {
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      });
      target.dispatchEvent(click);
    } finally {
      syntheticClick = false;
      setTimeout(stop, 0);
    }
  }

  function handleKeyDown(event) {
    if (!active || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    stop();
  }

  function start() {
    if (active) stop();
    active = true;
    clearHighlight();

    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
    originalStart();
  }

  function stop() {
    active = false;
    window.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('click', handleClick, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    clearHighlight();
    if (originalStop) originalStop();
  }

  function install() {
    if (typeof globalThis.__progettoBlurStartSelection !== 'function') return;
    if (globalThis.__stayBlurSelectionEnhancerInstalled) return;

    originalStart = globalThis.__progettoBlurStartSelection;
    originalStop = globalThis.__progettoBlurStopSelection;
    globalThis.__progettoBlurStartSelection = start;
    globalThis.__progettoBlurStopSelection = stop;
    globalThis.__stayBlurSelectionEnhancerInstalled = true;
  }

  install();
})();
