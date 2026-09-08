(() => {
  'use strict';
  const STYLE_ID = 'pb-selection-style';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '.pb-selection-highlight{outline:2px solid #1e6eff!important;outline-offset:2px!important;box-shadow:0 0 0 3px rgba(30,110,255,.18)!important;cursor:crosshair!important}.pb-rule-focus{outline:3px solid #1769d1!important;outline-offset:3px!important;box-shadow:0 0 0 5px rgba(23,105,209,.22)!important}';
  (document.head || document.documentElement).appendChild(style);
})();
