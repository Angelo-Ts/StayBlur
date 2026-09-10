(() => {
  'use strict';

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
    if (growth > 0) score += Math.min(2.8, growth * 0.9);
    if (growth > 3) score -= (growth - 3) * 1.8;
    score -= Math.max(0, depth - 1) * 0.45;
    if (LEAF_TAGS.has(tag)) score -= 4;
    if (tag === 'div') score += 0.25;
    if (tag === 'p') score -= 0.75;
    if (tag === 'table' || tag === 'tr' || tag === 'td' || tag === 'th') score -= 1;
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

  globalThis.__stayBlurChooseTarget = chooseTarget;
})();
