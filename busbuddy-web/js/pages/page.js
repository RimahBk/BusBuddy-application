// =====================================================================
// Page – base class of every page controller in js/pages/.
// A page file defines `class XxxPage extends Page { async init() { … } }`
// and ends with `XxxPage.mount();`, which runs init() once the page has loaded.
// =====================================================================
import { BB } from "../core/bb.js";

export class Page {
  // Create the page object and run its init() through BB.ready (errors become a toast)
  static mount() {
    BB.ready(async () => { await new this().init(); });
  }

  // Overridden by each page
  async init() {}
}
