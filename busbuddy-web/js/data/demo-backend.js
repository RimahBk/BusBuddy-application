// =====================================================================
// DemoBackend – the same data functions as SupabaseBackend, answered
// offline from the sample data in js/demo/ (saved in this browser).
//
// Why it extends SupabaseBackend: the demo client (js/demo/demo-client.js)
// understands exactly the same calls as supabase-js – from(), rpc(), auth –
// and copies every rule of schema.sql (same checks, same error messages).
// So each api function is written ONCE, and the demo and the real database
// can never drift apart in what the pages see.
//
// What the demo adds on top:
//   1. Moving buses: while a demo trip runs and no phone is sending real GPS,
//      a new position is made up along the route's road on every poll, from
//      the minutes since departure (minus any reported delay). So the map is
//      alive in a presentation even with no driver and no internet.
//   2. Admin actions that need the Vercel server function explain that they
//      only work after deployment.
// =====================================================================
import { SupabaseBackend } from "./supabase-backend.js";
import { RouteTrack } from "../core/route-track.js";

const RUNNING = ["active", "delayed"];
const REAL_GPS_MS = 60000;   // a real (not made-up) position younger than this = a phone is sharing: don't simulate
const MIN_STEP_MS = 2000;    // several pages may poll at once: move each bus at most every 2 seconds
const KEEP_SIMULATED = 20;   // made-up positions kept per trip (keeps the browser storage small)

export class DemoBackend extends SupabaseBackend {
  #tracks = {};              // route_id → RouteTrack (built once per route)

  // In demo mode the "reset password" link is not real: the page just shows the form
  checkRecoveryLink() {
    return Promise.resolve(true);
  }

  // Live positions: move the demo buses first, then answer like the database
  async getLiveBuses() {
    this.#moveDemoBuses();
    return super.getLiveBuses();
  }

  async adminFleet() {
    this.#moveDemoBuses();
    return super.adminFleet();
  }

  // These need the secret key, which only the Vercel function api/admin.js holds
  async adminCreateDriverAccount() { throw new Error("Available after deployment."); }
  async adminDeactivateUser() { throw new Error("Available after deployment."); }
  async adminActivateUser() { throw new Error("Available after deployment."); }
  async adminListStatus() { throw new Error("Available after deployment."); }

  // ---------------------------------------------------------------
  // Moving demo buses
  // ---------------------------------------------------------------
  #moveDemoBuses() {
    const s = this.client.store, now = Date.now();
    let changed = false;
    s.tables.trips.filter((t) => RUNNING.includes(t.status)).forEach((t) => {
      const last = s.lastLoc(t.trip_id);
      const age = last.time ? now - new Date(last.time).getTime() : Infinity;
      if (last.time && !last.simulated && age < REAL_GPS_MS) return;   // a real driver is sharing: leave the bus alone
      if (last.simulated && age < MIN_STEP_MS) return;                 // moved a moment ago
      const track = this.#track(t.route_id);
      if (!track) return;
      // Where should the bus be now? Minutes since departure, minus any reported delay
      const delay = s.openDelay(t.trip_id).delay_time || 0;
      const minutes = (now - new Date(t.departure_time).getTime()) / 60000 - delay;
      const [latitude, longitude] = track.pointAt(track.kmAt(minutes));
      s.tables.updated_locations.push({ location_id: s.newId(), trip_id: t.trip_id, latitude, longitude,
        speed: track.speedAt(minutes), time: new Date(now).toISOString(), simulated: true });
      changed = true;
    });
    if (!changed) return;
    // Keep only the newest made-up positions of each trip; real ones are always kept
    const count = {};
    s.tables.updated_locations = s.tables.updated_locations.slice().reverse().filter((l) => {
      if (!l.simulated) return true;
      count[l.trip_id] = (count[l.trip_id] || 0) + 1;
      return count[l.trip_id] <= KEEP_SIMULATED;
    }).reverse();
    s.save();
  }

  #track(routeId) {
    if (this.#tracks[routeId]) return this.#tracks[routeId];
    const s = this.client.store;
    const stops = s.tables.stops.filter((x) => x.route_id === routeId).sort((a, b) => a.stop_order - b.stop_order);
    if (stops.length < 2) return null;
    const route = s.route(routeId) || {};
    return (this.#tracks[routeId] = new RouteTrack(stops, route.path));
  }
}

