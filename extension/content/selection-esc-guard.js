(() => {
  'use strict';
  const ATTR = 'data-progettoblur-rule-id';
  const CLASSES = ['pb-effect-base','pb-effect-blur','pb-effect-strongBlur','pb-effect-pixelate','pb-effect-blackout','pb-effect-hide'];
  const STYLE_PROPS = ['--pb-blur','--pb-strong-blur','filter','visibility','color','text-shadow'];
  let restoring = false;
  const snapshot = () => [...document.querySelectorAll(`[${ATTR}]`)].map((el) => ({
    el,
    ruleId: el.getAttribute(ATTR),
    classes: CLASSES.filter((c) => el.classList.contains(c)),
    styles: Object.fromEntries(STYLE_PROPS.map((p) => [p, el.style.getPropertyValue(p)]))
  }));
  const restore = (items) => {
    for (const item of items) {
      const el = item.el;
      if (!el || !el.isConnected) continue;
      if (!el.getAttribute(ATTR)) el.setAttribute(ATTR, item.ruleId);
      for (const c of CLASSES) el.classList.remove(c);
      for (const c of item.classes) el.classList.add(c);
      for (const p of STYLE_PROPS) {
        const v = item.styles[p];
        if (v) el.style.setProperty(p, v); else el.style.removeProperty(p);
      }
    }
  };
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || restoring) return;
    const items = snapshot();
    if (!items.length) return;
    restoring = true;
    let frames = 0;
    const tick = () => {
      restore(items);
      frames += 1;
      if (frames < 12) requestAnimationFrame(tick); else restoring = false;
    };
    requestAnimationFrame(tick);
  }, true);
})();
