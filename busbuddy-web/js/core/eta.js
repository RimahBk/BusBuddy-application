// =====================================================================
// Eta (UC-06): arrival times at the stops still ahead of a bus.
//   timetable() – BB.eta: where the bus is on the route + the timetable + any delay
//   compute()   – the older method: haversine distance ÷ recent speed, plus any delay
//                 (falls back to the timetable when the speed is unknown)
// =====================================================================
import { RouteTrack } from "./route-track.js";

export class Eta {
  static EARTH_RADIUS_KM = 6371;
  static ROAD_FACTOR = 1.3;     // roads are not straight
  static MIN_SPEED_KMH = 5;     // slower than this = treated as stopped
  static AT_STOP_KM = 0.3;      // closer than this = the bus is at that stop

  static distanceKm(lat1, lng1, lat2, lng2) {
    const R = Eta.EARTH_RADIUS_KM, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Direction from point 1 to point 2 in degrees (0 = north, 90 = east)
  static bearing(lat1, lng1, lat2, lng2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  // -------------------------------------------------------------------
  // BB.eta(bus, stops, delayMinutes) – arrival times from the TIMETABLE.
  // (This is the method the plan asks for; compute() below is the older
  //  speed-based one, still used by the pages until they move to this one.)
  //
  //   1. Find where the bus is on the route, as a timetable minute
  //      ("the bus is where the timetable puts it 37 minutes after departure").
  //      With the route's road shape (stops.path, added by BB.loadStopsByRoute)
  //      this is measured along the road; without one, between the nearest stops.
  //   2. ETA to each later stop = timetable minutes from "where the bus is"
  //      to that stop + the reported delay.
  //   3. If the bus's last update is older than ETA_STALE_MINUTES, say so.
  //
  // bus = a row from getLiveBuses(); stops = that route's stops in order.
  // Returns { stale, minutesAgo, stops: [{ stop, minutes, at }] } where `at` is the ISO arrival time.
  // -------------------------------------------------------------------
  static #tracks = new WeakMap();      // stops list → its RouteTrack (built once)

  static timetable(bus, stops, delayMinutes) {
    const staleAfter = (window.BB_CONFIG && window.BB_CONFIG.ETA_STALE_MINUTES) || 2;
    const updated = bus && bus.last_update ? new Date(bus.last_update).getTime() : null;
    const minutesAgo = updated == null ? null : Math.max(0, Math.round((Date.now() - updated) / 60000));
    const result = { stale: minutesAgo == null || minutesAgo > staleAfter, minutesAgo, stops: [] };
    if (!bus || bus.latitude == null || !stops || !stops.length) return result;

    const { nowMin, firstAhead } = Array.isArray(stops.path) && stops.path.length > 1 && stops.length > 1
      ? Eta.#placeOnRoad(bus, stops) : Eta.#placeBetweenStops(bus, stops);
    const delay = delayMinutes != null ? delayMinutes : (bus.delay_minutes || 0);
    const base = updated || Date.now();                                     // the moment the bus was at that spot

    result.stops = stops.slice(firstAhead).map((s) => {
      const arrive = base + (s.minutes_from_start - nowMin + delay) * 60000;
      const minutes = Math.max(1, Math.round((arrive - Date.now()) / 60000));   // from NOW, even if the position is old
      return { stop: s, minutes, at: new Date(Math.max(arrive, Date.now() + 60000)).toISOString() };
    });
    return result;
  }

  // With a road shape: how far along the road is the bus? → timetable minute.
  // Stops less than AT_STOP_KM ahead count as reached (the bus is at them).
  static #placeOnRoad(bus, stops) {
    let track = Eta.#tracks.get(stops);
    if (!track) { track = new RouteTrack(stops, stops.path); Eta.#tracks.set(stops, track); }
    const busKm = track.kmOf(bus.latitude, bus.longitude);
    let firstAhead = track.marks.findIndex((m) => m.km > busKm + Eta.AT_STOP_KM);
    if (firstAhead === -1) firstAhead = stops.length;
    return { nowMin: track.minuteAtKm(busKm), firstAhead };
  }

  // Without a road shape: the nearest stop, and whether the bus has already passed it
  static #placeBetweenStops(bus, stops) {
    const here = (s) => Eta.distanceKm(bus.latitude, bus.longitude, s.latitude, s.longitude);
    const gap = (a, b) => Eta.distanceKm(a.latitude, a.longitude, b.latitude, b.longitude) || 0.001;
    let i = 0;
    stops.forEach((s, k) => { if (here(s) < here(stops[i])) i = k; });       // nearest stop

    // Which part of the route is the bus on? [from, to] = the two stops around it
    const atStop = here(stops[i]) < Eta.AT_STOP_KM;
    let from = i, to = i;
    if (!atStop) {
      const next = stops[i + 1], prev = stops[i - 1];
      if (next && here(next) < gap(stops[i], next)) to = i + 1;             // already past stop i, heading to i+1
      else if (prev) from = i - 1;                                          // still coming towards stop i
    }
    // How far between the two stops (0 = at `from`, 1 = at `to`), turned into timetable minutes
    const part = from === to ? 0 : Math.min(1, Math.max(0, 1 - here(stops[to]) / gap(stops[from], stops[to])));
    const nowMin = stops[from].minutes_from_start + part * (stops[to].minutes_from_start - stops[from].minutes_from_start);
    // A stop the bus is AT is not "ahead"; before the first stop, the first stop still is
    const firstAhead = atStop ? i + 1 : from === to ? i : to;
    return { nowMin, firstAhead };
  }

  // bus = a row from get_live_buses(); stops = that route's stops (sorted)
  // returns [{ stop, minutes }] for the stops still ahead of the bus
  static compute(bus, stops) {
    if (!bus || bus.latitude == null || !stops || !stops.length) return [];
    // nearest stop = where the bus is now; the ones after it are still ahead
    let nearest = 0, best = Infinity;
    stops.forEach((s, i) => {
      const d = Eta.distanceKm(bus.latitude, bus.longitude, s.latitude, s.longitude);
      if (d < best) { best = d; nearest = i; }
    });
    const ahead = stops.slice(best < Eta.AT_STOP_KM ? nearest + 1 : nearest);
    const delay = bus.delay_minutes || 0;
    const speed = bus.speed && bus.speed > Eta.MIN_SPEED_KMH ? bus.speed : null;     // km/h
    let travelled = 0, prev = { latitude: bus.latitude, longitude: bus.longitude };
    const baseSched = stops[nearest].minutes_from_start;
    return ahead.map((s) => {
      let minutes;
      if (speed) {
        travelled += Eta.distanceKm(prev.latitude, prev.longitude, s.latitude, s.longitude) * Eta.ROAD_FACTOR;
        prev = s;
        minutes = (travelled / speed) * 60;
      } else {
        minutes = Math.max(0, s.minutes_from_start - baseSched);
      }
      return { stop: s, minutes: Math.max(1, Math.round(minutes + delay)) };
    });
  }
}
