// =====================================================================
// Poller – calls a function now and then every N seconds.
// Pauses while the browser tab is hidden. Used instead of Supabase Realtime.
// =====================================================================
export class Poller {
  #fn;
  #seconds;
  #timer = null;
  #stopped = false;

  constructor(fn, seconds) {
    this.#fn = fn;
    this.#seconds = seconds;
  }

  start() {
    this.#tick();
    return this;
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
  }

  async #tick() {
    if (this.#stopped) return;
    if (!document.hidden) { try { await this.#fn(); } catch (e) { console.error(e); } }
    this.#timer = setTimeout(() => this.#tick(), this.#seconds * 1000);
  }
}
