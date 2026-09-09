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
  const CONTAINER_WORDS = /(?:card|panel|tile|item|row|container|wrapper|section|sidebar|menu|dialog|modal|list|content|group|box)/i;

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

    let score = 0;
    if (STRUCTURAL_TAGS.has(tag)) score += 3;
    if (INTERACTIVE_TAGS.has(tag)) score += 4;
    if (SEMANTIC_ROLES.has(role)) score += 4;
    if (CONTAINER_WORDS.test(className)) score += 2;
    if (element.hasAttribute('data-testid') || element.hasAttribute('data-test')) score += 1;
    if (element.id && /(?:card|panel|item|container|section|menu|dialog|modal)/i.test(element.id)) score += 2;
    return score;
  }

  function candidateScore(element, origin) {
    const tag = element.tagName.toLowerCase();
    const rect = element.getBoundingClientRect();
    const area = viewportArea(element);
    const viewportAreaTotal = Math.max(1, window.innerWidth * window.innerHeight);
    const areaRatio = area / viewportAreaTotal;
    const originArea = Math.max(1, viewportArea(origin));
    const growth = Math.min(4, Math.log2(Math.max(1, area / originArea)));

    let score = 0;
    score += semanticScore(element);
    score += growth * 1.4;

    if (LEAF_TAGS.has(tag)) score -= 3;
    if (tag === 'div') score += 0.5;
    if (tag === 'p') score -= 0.5;
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
    let bestScore = candidateScore(origin, origin);
    let candidate = origin.parentElement;

    for (let depth = 1; candidate && depth <= MAX_DEPTH; depth += 1) {
      if (isBlocked(candidate)) break;
      const tag = candidate.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body' || tag === 'head') break;

      const score = candidateScore(candidate, origin) + (depth <= 2 ? 0.8 : 0);
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
    originalStart();
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('click', handleClick, true);
    window.addEventListener('keydown', handleKeyDown, true);
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
