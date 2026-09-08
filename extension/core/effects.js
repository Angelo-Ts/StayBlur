const STYLE_ID = 'pb-rule-style';
const SVG_ID = 'pb-pixelate-svg';
const ATTR = 'data-progettoblur-rule-id';
const CLASS_PREFIX = 'pb-effect-';
const EFFECTS = ['blur', 'strongBlur', 'pixelate', 'blackout', 'hide'];

const styleText = `
.pb-effect-base { transition: filter 120ms ease; }
.pb-effect-blur { filter: blur(var(--pb-blur, 6px)) !important; }
.pb-effect-strongBlur { filter: blur(var(--pb-strong-blur, 16px)) !important; }
.pb-effect-pixelate { filter: url(#pb-pixelate-filter) !important; image-rendering: pixelated !important; }
.pb-effect-blackout { filter: brightness(0) !important; color: transparent !important; text-shadow: none !important; }
.pb-effect-hide { visibility: hidden !important; }
.pb-selection-highlight { outline: 2px solid #00a3ff !important; outline-offset: 1px !important; cursor: crosshair !important; }
`;

const ensureStyleNode = (doc = document) => {
  let styleNode = doc.getElementById(STYLE_ID);
  if (!styleNode) {
    styleNode = doc.createElement('style');
    styleNode.id = STYLE_ID;
    styleNode.textContent = styleText;
    (doc.head || doc.documentElement).appendChild(styleNode);
  }
};

const ensurePixelSvgFilter = (doc = document) => {
  let svg = doc.getElementById(SVG_ID);
  if (svg) return;
  svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', SVG_ID);
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.pointerEvents = 'none';
  svg.innerHTML = `<filter id="pb-pixelate-filter"><feMorphology operator="dilate" radius="1" /><feGaussianBlur stdDeviation="0.1" /><feComponentTransfer><feFuncR type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" /><feFuncG type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" /><feFuncB type="discrete" tableValues="0 0.2 0.4 0.6 0.8 1" /></feComponentTransfer></filter>`;
  (doc.body || doc.documentElement).appendChild(svg);
};

export class EffectRenderer {
  constructor(doc = document) {
    this.doc = doc;
    this.state = new WeakMap();
  }

  ensureStyles() { ensureStyleNode(this.doc); ensurePixelSvgFilter(this.doc); }

  remember(element) {
    if (this.state.has(element)) return this.state.get(element);
    const state = {
      className: element.className,
      blur: element.style.getPropertyValue('--pb-blur'),
      blurPriority: element.style.getPropertyPriority('--pb-blur'),
      strongBlur: element.style.getPropertyValue('--pb-strong-blur'),
      strongBlurPriority: element.style.getPropertyPriority('--pb-strong-blur'),
      rules: new Map(),
    };
    this.state.set(element, state);
    return state;
  }

  renderState(element, state) {
    for (const effect of EFFECTS) element.classList.remove(`${CLASS_PREFIX}${effect}`);
    element.classList.remove('pb-effect-base');
    const rules = [...state.rules.values()];
    if (!rules.length) {
      element.className = state.className;
      if (state.blur) element.style.setProperty('--pb-blur', state.blur, state.blurPriority); else element.style.removeProperty('--pb-blur');
      if (state.strongBlur) element.style.setProperty('--pb-strong-blur', state.strongBlur, state.strongBlurPriority); else element.style.removeProperty('--pb-strong-blur');
      element.removeAttribute(ATTR);
      this.state.delete(element);
      return;
    }
    // Deterministic precedence prevents two rules from producing contradictory CSS.
    const rule = rules.sort((a, b) => String(a.ruleId).localeCompare(String(b.ruleId)))[0];
    element.setAttribute(ATTR, rules.map((item) => item.ruleId).join(','));
    element.classList.add('pb-effect-base', `${CLASS_PREFIX}${rule.effect}`);
    const px = Math.max(0, Math.min(100, Number(rule.intensity ?? 60)));
    element.style.setProperty('--pb-blur', `${Math.max(1, Math.round((px / 100) * 12))}px`);
    element.style.setProperty('--pb-strong-blur', `${Math.max(4, Math.round((px / 100) * 28))}px`);
  }

  applyEffect(element, rule) {
    if (!(element instanceof this.doc.defaultView.Element)) return;
    this.ensureStyles();
    const state = this.remember(element);
    state.rules.set(rule.ruleId, { ruleId: rule.ruleId, effect: rule.effect, intensity: rule.intensity });
    this.renderState(element, state);
  }

  removeEffect(element, rule) {
    const state = this.state.get(element);
    if (!state) return;
    state.rules.delete(rule.ruleId);
    this.renderState(element, state);
  }

  removeByRuleId(ruleId, root = this.doc) {
    for (const element of root.querySelectorAll(`[${ATTR}]`)) {
      const ids = (element.getAttribute(ATTR) || '').split(',').map((value) => value.trim()).filter(Boolean);
      if (ids.includes(ruleId)) this.removeEffect(element, { ruleId });
    }
  }

  removeAll(root = this.doc) {
    for (const element of root.querySelectorAll(`[${ATTR}]`)) {
      const state = this.state.get(element);
      if (state) {
        state.rules.clear();
        this.renderState(element, state);
      } else {
        element.removeAttribute(ATTR);
        for (const effect of EFFECTS) element.classList.remove(`${CLASS_PREFIX}${effect}`);
        element.classList.remove('pb-effect-base');
      }
    }
  }
}
