// =====================================================================
// DemoQuery – copies the supabase-js table query builder:
//   db.from("buses").select("*").eq("bus_id", 1).order("plate_number")
// and answers it from the DemoStore. Like supabase-js it is "thenable",
// so pages can `await` it.
// =====================================================================
import { PRIMARY_KEYS } from "./demo-fixtures.js";

export class DemoQuery {
  #store;

  constructor(store, table) {
    this.#store = store;
    this.t = table; this.filters = []; this.op = "select"; this.orders = [];
  }

  select() { if (this.op === "select") this.op = "select"; this.wantRows = true; return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
  order(c, o) { this.orders.push([c, !(o && o.ascending === false)]); return this; }
  limit(n) { this.lim = n; return this; }
  insert(v) { this.op = "insert"; this.val = Array.isArray(v) ? v : [v]; return this; }
  update(v) { this.op = "update"; this.val = v; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(v) { return this.insert(v); }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }

  run() {
    const T = this.#store.tables;
    const rows = T[this.t]; if (!rows) return { data: null, error: { message: "table " + this.t + " not found" } };
    if (this.op === "insert") {
      const pk = PRIMARY_KEYS[this.t];
      const added = this.val.map((v) => { const r = { ...v }; if (r[pk] == null) r[pk] = this.#store.newId(); if (this.t === "trips" && !r.status) r.status = "scheduled"; rows.push(r); return r; });
      return { data: this.one ? added[0] : added, error: null };
    }
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") { out.forEach((r) => Object.assign(r, this.val)); return { data: out, error: null }; }
    if (this.op === "delete") { T[this.t] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
    this.orders.forEach(([c, asc]) => out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
    if (this.lim) out = out.slice(0, this.lim);
    out = out.map((r) => ({ ...r }));
    if (this.one) return { data: out[0] || null, error: this.one === "single" && !out[0] ? { message: "No rows" } : null };
    return { data: out, error: null };
  }

  then(res, rej) {
    return new Promise((r) => setTimeout(() => { const out = this.run(); if (this.op !== "select") this.#store.save(); r(out); }, 30)).then(res, rej);
  }
}
