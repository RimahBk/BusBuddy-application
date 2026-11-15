// =====================================================================
// Dom – tiny helpers for finding elements, reading the URL and escaping text.
// Every method is static and does not use `this`, so it can be passed around
// on its own (for example `const $ = BB.$`).
// =====================================================================
export class Dom {
  // First element matching a CSS selector (inside `root`, or the whole page)
  static $(sel, root) {
    return (root || document).querySelector(sel);
  }

  // All matching elements, as a normal array
  static $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  // A value from the address bar: ?trip=3 → Dom.param("trip") === "3"
  static param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  // Escape text before putting it inside innerHTML (prevents broken pages / HTML injection)
  static esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
}
