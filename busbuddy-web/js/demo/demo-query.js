// =====================================================================
// DemoQuery – copies the supabase-js table query builder:
//   db.from("buses").select("*").eq("bus_id", 1).order("plate_number")
// and answers it from the DemoStore. Like supabase-js it is "thenable",
// so pages can `await` it.
//
// It also copies what the real database would do with that query:
//   - row level security (section 3 of schema.sql): who may read or change which rows
//   - unique keys, check constraints and foreign keys, with Postgres' own error text and code
// =====================================================================
import { PRIMARY_KEYS } from "./demo-fixtures.js";

const pgError = (message, code) => ({ data: null, error: { message, code } });

// Unique keys: [table, columns, constraint name] – same names Postgres gives them in schema.sql
const UNIQUE = [
  ["users", ["email"], "users_email_key"],
  ["drivers", ["license_number"], "drivers_license_number_key"],
  ["buses", ["plate_number"], "buses_plate_number_key"],
  ["buses", ["owner_id"], "buses_owner_id_key"],
  ["stops", ["route_id", "stop_order"], "stops_route_id_stop_order_key"]
];
// Foreign keys WITHOUT "on delete cascade": deleting the parent is refused while children exist
const RESTRICT = [
  ["buses", "bus_id", "trips", "trips_bus_id_fkey"],
  ["routes", "route_id", "trips", "trips_route_id_fkey"]
];
// Foreign keys WITH "on delete cascade": the children go too
const CASCADE = [["routes", "route_id", "stops"]];

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
    const s = this.#store, T = s.tables, me = s.sessionUser();
    const rows = T[this.t];
    if (!rows) return { data: null, error: { message: "table " + this.t + " not found" } };

    // Row level security for changes: Postgres refuses an insert, but an update/delete that
    // the policies don't allow just changes no rows (no error) – copied here on purpose.
    if (this.op !== "select" && !this.#mayWrite(me)) {
      if (this.op === "insert") return pgError(`new row violates row-level security policy for table "${this.t}"`, "42501");
      return { data: [], error: null };
    }

    if (this.op === "insert") {
      const pk = PRIMARY_KEYS[this.t];
      const added = [];
      for (const v of this.val) {
        const r = { ...v };
        if (r[pk] == null) r[pk] = s.newId();
        if (this.t === "trips" && !r.status) r.status = "scheduled";
        const bad = this.#violation(r, null);
        if (bad) {                                           // all or nothing, like one SQL statement
          T[this.t] = rows.filter((x) => !added.includes(x));
          return bad;
        }
        rows.push(r); added.push(r);
      }
      return { data: this.one ? { ...added[0] } : added.map((r) => ({ ...r })), error: null };
    }

    let out = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "update") {
      for (const r of out) {
        const bad = this.#violation({ ...r, ...this.val }, r);
        if (bad) return bad;
      }
      out.forEach((r) => Object.assign(r, this.val));
      return { data: out.map((r) => ({ ...r })), error: null };
    }

    if (this.op === "delete") {
      for (const [parent, key, child, name] of RESTRICT) {
        if (parent !== this.t) continue;
        if (out.some((r) => T[child].some((c) => c[key] === r[key]))) {
          return pgError(`update or delete on table "${parent}" violates foreign key constraint "${name}" on table "${child}"`, "23503");
        }
      }
      for (const [parent, key, child] of CASCADE) {
        if (parent === this.t) T[child] = T[child].filter((c) => !out.some((r) => r[key] === c[key]));
      }
      T[this.t] = rows.filter((r) => !out.includes(r));
      return { data: out, error: null };
    }

    // select: row level security decides which rows this user may see
    out = out.filter((r) => this.#mayRead(r, me));
    this.orders.forEach(([c, asc]) => out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
    if (this.lim) out = out.slice(0, this.lim);
    out = out.map((r) => ({ ...r }));
    if (this.one) return { data: out[0] || null, error: this.one === "single" && !out[0] ? { message: "No rows" } : null };
    return { data: out, error: null };
  }

  // "read …" policies of schema.sql (tables not listed here can be read by everyone)
  #mayRead(r, me) {
    const s = this.#store, admin = s.isAdmin(me), uid = me && me.user_id;
    switch (this.t) {
      case "users":
      case "drivers": return admin || r.user_id === uid;
      case "bookings": return admin || r.passenger_id === uid || s.isDriverOf(me, s.byId("trips", "trip_id", r.trip_id));
      case "messages": return admin || r.passenger_id === uid || r.driver_id === uid;
      default: return true;
    }
  }

  // "admin manages …" policies. Bookings, messages, delays and locations change ONLY through
  // the SQL functions (DemoRpc), never through table queries. Users rows are only updated, never inserted.
  #mayWrite(me) {
    const admin = this.#store.isAdmin(me);
    if (["buses", "routes", "stops", "trips", "drivers"].includes(this.t)) return admin;
    if (this.t === "users") return admin && this.op === "update";
    return false;
  }

  // Unique keys and check constraints → Postgres' error, or null when the row is fine.
  // `old` = the row being updated (it may keep its own values), null for an insert.
  #violation(row, old) {
    const T = this.#store.tables;
    for (const [table, cols, name] of UNIQUE) {
      if (table !== this.t || cols.some((c) => row[c] == null)) continue;   // NULLs never clash (owner_id may be empty)
      const clash = T[table].some((x) => x !== old && cols.every((c) => x[c] === row[c]));
      if (clash) return pgError(`duplicate key value violates unique constraint "${name}"`, "23505");
    }
    if (this.t === "buses" && !(row.capacity > 0)) {
      return pgError('new row for relation "buses" violates check constraint "buses_capacity_check"', "23514");
    }
    return null;
  }

  then(res, rej) {
    return new Promise((r) => setTimeout(() => { const out = this.run(); if (this.op !== "select") this.#store.save(); r(out); }, 30)).then(res, rej);
  }
}
