const HIGHLIGHT_CLASS = 'pb-selection-highlight';

export class SelectionController {
  constructor(doc = document) {
    this.doc = doc;
    this.active = false;
    this.currentElement = null;
    this.onSelect = null;

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClickCapture = this.handleClickCapture.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  start(onSelect) {
    if (this.active) this.stop();
    this.active = true;
    this.onSelect = onSelect;
    this.doc.addEventListener('mousemove', this.handleMouseMove, true);
    this.doc.addEventListener('click', this.handleClickCapture, true);
    this.doc.addEventListener('keydown', this.handleKeyDown, true);
  }

  stop() {
    this.active = false;
    this.onSelect = null;
    this.doc.removeEventListener('mousemove', this.handleMouseMove, true);
    this.doc.removeEventListener('click', this.handleClickCapture, true);
    this.doc.removeEventListener('keydown', this.handleKeyDown, true);

    if (this.currentElement) {
      this.currentElement.classList.remove(HIGHLIGHT_CLASS);
      this.currentElement = null;
    }
  }

  setHighlight(element) {
    if (this.currentElement === element) return;
    if (this.currentElement) {
      this.currentElement.classList.remove(HIGHLIGHT_CLASS);
    }
    this.currentElement = element;
    if (this.currentElement) {
      this.currentElement.classList.add(HIGHLIGHT_CLASS);
    }
  }

  resolveSelectableTarget(eventTarget) {
    if (!(eventTarget instanceof Element)) return null;
    if (eventTarget.id === 'pb-pixelate-svg') return null;
    const blocked = eventTarget.closest?.('[data-progettoblur-ui="true"]');
    if (blocked) return null;
    return eventTarget;
  }

  handleMouseMove(event) {
    if (!this.active) return;
    const target = this.resolveSelectableTarget(event.target);
    if (!target) return;
    this.setHighlight(target);
  }

  async handleClickCapture(event) {
    if (!this.active) return;
    const target = this.resolveSelectableTarget(event.target);
    if (!target || !this.onSelect) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    await this.onSelect(target);
    this.stop();
  }

  handleKeyDown(event) {
    if (!this.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.stop();
    }
  }
}
