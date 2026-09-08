export { esc, fmtPct, fmtInt } from '../util/format.js';

/**
 * Base class for gsm.dash light-DOM components: assign `.store` (a
 * PortfolioStore) and the element renders now and on every store 'change'.
 * Light DOM keeps styling in the page stylesheet and plays well with
 * htmlwidget embedding and print.
 */
export class StoreElement extends HTMLElement {
  #store = null;
  #onChange = () => this.render();

  set store(store) {
    if (this.#store) this.#store.removeEventListener('change', this.#onChange);
    this.#store = store;
    if (store) {
      store.addEventListener('change', this.#onChange);
      if (this.isConnected) this.render();
    }
  }

  get store() {
    return this.#store;
  }

  connectedCallback() {
    if (this.#store) this.render();
  }

  disconnectedCallback() {
    if (this.#store) this.#store.removeEventListener('change', this.#onChange);
  }

  render() {}
}
