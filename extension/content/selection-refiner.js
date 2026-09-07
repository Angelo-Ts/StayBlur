(() => {
  'use strict';

  // The main content script owns rule creation, fingerprinting and rendering.
  // This layer only improves the manual pick target before the main handler
  // receives the selection event.
  const SELECT_EVENT = 'progettoBlur:select-element';
  let selecting = false;
  let hover = null;
  const HIGHLIGHT = 'pb-selection-refined-highlight';
  const UI_SELECTOR = '[data-progettoblur-ui="true"]';
  const OWN_STYLE_ID = 'pb-selection-refiner-style';
  const MEDIA = new Set(['IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG', 'IFRAME']);
  const CONTROLS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'A', 'SUMMARY']);
  const SEMANTIC = new Set(['ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL']);
  const INLINE_WRAPPERS = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'U', 'S', 'SMALL', 'MARK', 'CODE', 'SUB', 'SUP', 'TIME']);

  function ensureStyle() {
    if (document.getElementById(OWN_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = OWN_STYLE_ID;
    style.textContent = `.${HIGHLIGHT}{outline:2px solid #00a3ff!important;outline-offset:1px!important;cursor:crosshair!important}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function valid(el) {
    return el instanceof Element && el.id !== OWN_STYLE_ID && !el.closest(UI_SELECTOR);
  }

  function hasOwnSemantics(el) {
    return !!(el.id || el.getAttribute('role') || el.getAttribute('data-progettoblur-rule-id') || el.hasAttribute('contenteditable') || el.hasAttribute('aria-label'));
  }

  function isInteractive(el) {
    return CONTROLS.has(el.tagName) || el.hasAttribute('onclick') || el.hasAttribute('tabindex') || el.getAttribute('role')?.match(/^(button|link|checkbox|combobox|dialog|menuitem|option|radio|slider|switch|tab|textbox)$/i);
  }

  function isContentBlock(el) {
    if (SEMANTIC.has(el.tagName)) return true;
    if (hasOwnSemantics(el) || isInteractive(el) || MEDIA.has(el.tagName)) return true;
    const style = getComputedStyle(el);
    return /^(block|flex|grid|table|list-item|flow-root|inline-block)$/.test(style.display);
  }

  function refinedTarget(input) {
    if (!valid(input)) return null;
    if (MEDIA.has(input.tagName) || isInteractive(input)) return input;

    let current = input;
    while (INLINE_WRAPPERS.has(current.tagName) && current.parentElement && !hasOwnSemantics(current)) {
      current = current.parentElement;
      if (!valid(current)) return input;
      if (isContentBlock(current)) return current;
    }

    if (!isContentBlock(current) && current.parentElement) {
      let parent = current.parentElement;
      while (parent && !isContentBlock(parent) && parent.parentElement) parent = parent.parentElement;
      if (parent && valid(parent)) return parent;
    }
    return current;
  }

  function setHover(next) {
    if (hover === next) return;
    if (hover) hover.classList.remove(HIGHLIGHT);
    hover = next;
    if (hover) {
      ensureStyle();
      hover.classList.add(HIGHLIGHT);
    }
  }

  function stopLocalSelection() {
    selecting = false;
    setHover(null);
  }

  function onMove(event) {
    if (!selecting) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setHover(refinedTarget(event.target));
  }

  function onClick(event) {
    if (!selecting) return;
    const target = refinedTarget(event.target);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    stopLocalSelection();

    // Do not synthesize another click: dispatch a private DOM event so the
    // main content script can create the rule without re-entering page clicks.
    document.dispatchEvent(new CustomEvent(SELECT_EVENT, {
      bubbles: false,
      detail: { element: target }
    }));
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'BG_ENTER_SELECTION') {
      selecting = true;
      ensureStyle();
    } else if (message?.type === 'BG_EXIT_SELECTION') {
      stopLocalSelection();
    }
  });

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
})();
