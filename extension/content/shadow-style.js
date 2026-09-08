(() => {
  'use strict';

  const STYLE_ID = 'pb-rule-style';
  const CSS = `.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:blur(8px) contrast(1.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}`;
  const knownRoots = new WeakSet();

  function install(root) {
    if (!root || typeof root.querySelector !== 'function') return;
    if (root.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    root.appendChild(style);
  }

  function registerRoot(root) {
    if (!root || knownRoots.has(root)) return false;
    knownRoots.add(root);
    install(root);
    return true;
  }

  function discoverOpenShadowRoots(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    registerRoot(root);
    for (const host of root.querySelectorAll('*')) {
      if (host.shadowRoot) discoverOpenShadowRoots(host.shadowRoot);
    }
  }

  discoverOpenShadowRoots(document);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.shadowRoot) discoverOpenShadowRoots(node.shadowRoot);
        for (const host of node.querySelectorAll('*')) {
          if (host.shadowRoot) discoverOpenShadowRoots(host.shadowRoot);
        }
      }
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { subtree: true, childList: true });
  }
})();
