// =====================================================================
// DemoStore – the demo "database": the tables, saved in this browser's
// localStorage so a booking made on one page is still there on the next page.
// Saved data is kept for 6 hours, then the sample data starts fresh
// (so the trip times stay realistic).
// =====================================================================
import { createFixtures } from "./demo-fixtures.js";

export class DemoStore {
  static STORAGE_KEY = "bb_demo_db_v4";  // v4: five routes from data/BusRoutes_edited.geojson (new key = old saved data is not reused)
  static SESSION_KEY = "mock_user";       // user_id of the logged-in demo user
  static MAX_AGE_MS = 6 * 3600000;
  static FIRST_ID = 100;

  tables;
  nextId = DemoStore.FIRST_ID;
  savedAt;

  constructor() {
    this.load();
  }

  // Start again from the original sample data (used by the "Reset demo" button)
  static reset() {
    try { localStorage.removeItem(DemoStore.STORAGE_KEY); localStorage.removeItem(DemoStore.SESSION_KEY); } catch (e) {}
  }

  load() {
    try {
      const s = JSON.parse(localStorage.getItem(DemoStore.STORAGE_KEY));
      if (s && s.T && Date.now() - s.savedAt < DemoStore.MAX_AGE_MS) { this.tables = s.T; this.nextId = s.nextId; this.savedAt = s.savedAt; return; }
    } catch (e) {}
    this.tables = createFixtures(Date.now()); this.nextId = DemoStore.FIRST_ID; this.savedAt = Date.now();
  }

  save() {
    try { localStorage.setItem(DemoStore.STORAGE_KEY, JSON.stringify({ T: this.tables, nextId: this.nextId, savedAt: this.savedAt })); } catch (e) {}
  }

  newId() {
    return this.nextId++;
  }

  // ---- Logged-in demo user ----
  sessionUser() {
    try { const id = localStorage.getItem(DemoStore.SESSION_KEY); return id ? this.user(id) : null; } catch (e) { return null; }
  }
  setSessionUser(id) { localStorage.setItem(DemoStore.SESSION_KEY, id); }
  clearSessionUser() { localStorage.removeItem(DemoStore.SESSION_KEY); }

  // ---- Lookups (the same answers the SQL functions would compute) ----
  byId(tbl, k, v) { return this.tables[tbl].find((r) => r[k] === v); }
  route(id) { return this.byId("routes", "route_id", id); }
  bus(id) { return this.byId("buses", "bus_id", id); }
  user(id) { return this.byId("users", "user_id", id); }
  seatsTaken(tid) {
    return this.tables.bookings.filter((b) => b.trip_id === tid && ["booked", "walk_on"].includes(b.status)).reduce((s, b) => s + b.nb_of_seats, 0);
  }
  avail(tid) { const t = this.byId("trips", "trip_id", tid); return this.bus(t.bus_id).capacity - this.seatsTaken(tid); }
  lastLoc(tid) { return this.tables.updated_locations.filter((l) => l.trip_id === tid).slice(-1)[0] || {}; }
  openDelay(tid) { return this.tables.delay_reports.filter((d) => d.trip_id === tid && d.status === "open").slice(-1)[0] || {}; }
}
