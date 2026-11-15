// =====================================================================
// Connection – decides which database client the site uses:
//   DEMO_MODE: true  → DemoClient (offline sample data, js/demo/)
//   DEMO_MODE: false → the real Supabase client (js/vendor/supabase.js)
// Pages never need to know which one they got: both answer the same calls.
// =====================================================================
import { DemoClient } from "../demo/demo-client.js";

export class Connection {
  constructor(cfg) {
    this.demo = !!cfg.DEMO_MODE;
    this.configured = this.demo || Connection.#hasRealKeys(cfg);
    this.db = this.demo ? new DemoClient()
            : (this.configured && window.supabase) ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;
  }

  // config.js still holds the placeholder values → not configured yet
  static #hasRealKeys(cfg) {
    return !!cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT-ID")
        && !!cfg.SUPABASE_KEY && !cfg.SUPABASE_KEY.includes("YOUR-PUBLISHABLE-KEY");
  }
}
