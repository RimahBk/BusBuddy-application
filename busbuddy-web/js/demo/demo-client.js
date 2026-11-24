// =====================================================================
// DemoClient – an offline stand-in for the supabase-js client.
// It offers the same three parts the pages use – from(), rpc() and auth –
// and answers them from sample data saved in this browser (DemoStore).
// Used only when DEMO_MODE is true in js/config.js (see core/connection.js).
// =====================================================================
import { DemoStore } from "./demo-store.js";
import { DemoQuery } from "./demo-query.js";
import { DemoRpc } from "./demo-rpc.js";

const ok = (data) => Promise.resolve({ data, error: null });
// Like supabase-js: { message } plus the Postgres error code when there is one (e.g. "23505" = duplicate)
const fail = (message, code) => Promise.resolve({ data: null, error: code ? { message, code } : { message } });

// db.auth.* – log in / sign up / log out with the demo accounts (any password works)
class DemoAuth {
  #store;

  constructor(store) {
    this.#store = store;
  }

  getSession() {
    const u = this.#store.sessionUser();
    return ok({ session: u ? { user: { id: u.user_id, email: u.email }, access_token: "mock-token" } : null });
  }

  getUser() {
    const u = this.#store.sessionUser();
    return ok({ user: u ? { id: u.user_id, email: u.email } : null });
  }

  signInWithPassword({ email }) {
    const wanted = String(email || "").trim().toLowerCase();       // Supabase ignores upper/lower case in emails
    const u = this.#store.tables.users.find((x) => x.email.toLowerCase() === wanted);
    if (!u) return fail("Invalid login credentials");
    this.#store.setSessionUser(u.user_id);
    return ok({ user: { id: u.user_id, email }, session: { access_token: "mock-token" } });
  }

  signUp({ email, options }) {
    const s = this.#store;
    if (s.tables.users.some((x) => x.email === email)) return fail("User already registered");
    const id = "p-" + s.newId();
    const d = (options && options.data) || {};
    s.tables.users.push({ user_id: id, full_name: d.full_name || email, email, phone_no: d.phone_no || null, type: "passenger" });
    s.save();
    s.setSessionUser(id);
    return ok({ user: { id, email }, session: { access_token: "mock-token" } });
  }

  signOut() {
    this.#store.clearSessionUser();
    return ok({});
  }

  resetPasswordForEmail() {
    return ok({});
  }

  updateUser() {
    return ok({ user: {} });
  }

  onAuthStateChange(cb) {
    setTimeout(() => cb("PASSWORD_RECOVERY", null), 50);
    return { data: { subscription: { unsubscribe() {} } } };
  }
}

export class DemoClient {
  #store;
  #rpc;

  constructor() {
    this.#store = new DemoStore();
    this.#rpc = new DemoRpc(this.#store);
    this.auth = new DemoAuth(this.#store);
  }

  // The demo "database" itself. Only js/data/demo-backend.js uses it (to move the demo buses).
  get store() {
    return this.#store;
  }

  from(table) {
    return new DemoQuery(this.#store, table);
  }

  rpc(name, args) {
    if (!DemoRpc.has(name)) return fail("Unknown function " + name);
    const me = this.#store.sessionUser();
    const out = this.#rpc[name](args || {}, me);
    this.#store.save();
    if (out && out.error) return fail(out.error, out.code);
    return new Promise((r) => setTimeout(() => r({ data: out, error: null }), 30));
  }
}
