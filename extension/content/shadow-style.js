(() => {
  'use strict';

  const STYLE_ID = 'pb-rule-style';
  const CSS = `.pb-effect-base{transition:filter 120ms ease}.pb-effect-blur{filter:blur(var(--pb-blur,6px))!important}.pb-effect-strongBlur{filter:blur(var(--pb-strong-blur,16px))!important}.pb-effect-pixelate{filter:blur(8px) contrast(1.8)!important}.pb-effect-blackout{filter:brightness(0)!important;color:transparent!important;text-shadow:none!important}.pb-effect-hide{visibility:hidden!important}`;

  function install(root) {
    if (!root || typeof root.querySelector !== 'function') return;
    if (root.querySelector(`#${STYLE_ID}`)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    root.appendChild(style);
  }

  function scan(root) {
    install(root);
    for (const host of root.querySelectorAll('*')) {
      if (host.shadowRoot) scan(host.shadowRoot);
    }
  }

  scan(document);

  const observer = new MutationObserver(() => scan(document));
  observer.observe(document.documentElement, { subtree: true, childList: true });
})();
