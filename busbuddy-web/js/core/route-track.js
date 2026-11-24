// =====================================================================
// RouteTrack – a route as a line you can measure along.
// It answers three questions:
//   kmOf(lat, lng)  how far along the road is this point?      (used by the ETA)
//   kmAt(minutes)   how far along should the bus be after N minutes, by the timetable?
//   pointAt(km)     which [lat, lng] point of the road is X km from the start?
//                   (the last two move the demo buses)
// It uses the real road shape (routes.path) when there is one,
// otherwise straight lines between the stops.
// =====================================================================
export class RouteTrack {
  // stops = the route's stops in order; path = [[lat, lng], …] or null
  constructor(stops, path) {
    const pts = Array.isArray(path) && path.length > 1 ? path.slice() : stops.map((x) => [x.latitude, x.longitude]);
    // The road shape must run from the first stop to the last one; turn it round if it is stored the other way
    if (RouteTrack.#nearestIndex(pts, stops[0], 0) > RouteTrack.#nearestIndex(pts, stops[stops.length - 1], 0)) pts.reverse();
    this.pts = pts;
    this.cum = [0];                                   // km from the start to each point of the line
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + RouteTrack.km(pts[i - 1], pts[i]));
    // Each stop's place on the line, searched forward so the stops stay in order
    let from = 0;
    this.marks = stops.map((x) => {
      from = RouteTrack.#nearestIndex(pts, x, from);
      return { stop: x, minute: x.minutes_from_start, km: this.cum[from] };
    });
  }

  // Distance in km between two [lat, lng] points (haversine)
  static km(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Index of the point of `pts` (from index `from` on) closest to the stop
  static #nearestIndex(pts, stop, from) {
    let best = from, bestKm = Infinity;
    for (let i = from; i < pts.length; i++) {
      const d = RouteTrack.km(pts[i], [stop.latitude, stop.longitude]);
      if (d < bestKm) { bestKm = d; best = i; }
    }
    return best;
  }

  // How far along the road (km) is the point [lat, lng]? It is "dropped" onto the nearest
  // piece of road (projection), so the answer is exact even between two shape points.
  kmOf(lat, lng) {
    const { pts, cum } = this;
    const kx = Math.cos(lat * Math.PI / 180);          // a degree of longitude is shorter than a degree of latitude
    let bestD = Infinity, bestKm = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1][1] * kx, ay = pts[i - 1][0], bx = pts[i][1] * kx, by = pts[i][0];
      const px = lng * kx, py = lat;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const qx = ax + t * dx, qy = ay + t * dy;
      const d = (px - qx) ** 2 + (py - qy) ** 2;
      if (d < bestD) { bestD = d; bestKm = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
    }
    return bestKm;
  }

  // Timetable minute at a place along the road (between two stops: shared out by distance)
  minuteAtKm(km) {
    const m = this.marks;
    if (km <= m[0].km) return m[0].minute;
    for (let i = 1; i < m.length; i++) {
      if (km <= m[i].km) {
        const f = (km - m[i - 1].km) / ((m[i].km - m[i - 1].km) || 1);
        return m[i - 1].minute + f * (m[i].minute - m[i - 1].minute);
      }
    }
    return m[m.length - 1].minute;
  }

  // km along the road after `minutes`, following the timetable (minutes_from_start of each stop)
  kmAt(minutes) {
    const m = this.marks;
    if (minutes <= m[0].minute) return m[0].km;
    for (let i = 1; i < m.length; i++) {
      if (minutes <= m[i].minute) {
        const f = (minutes - m[i - 1].minute) / ((m[i].minute - m[i - 1].minute) || 1);
        return m[i - 1].km + f * (m[i].km - m[i - 1].km);
      }
    }
    return m[m.length - 1].km;                        // past the last stop: wait there
  }

  // Speed in km/h at that moment of the timetable (0 before the start and after the end)
  speedAt(minutes) {
    return Math.round((this.kmAt(minutes + 0.5) - this.kmAt(minutes - 0.5)) * 60);
  }

  // The [lat, lng] point `km` along the road
  pointAt(km) {
    const { pts, cum } = this;
    if (km <= 0) return pts[0].slice();
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= km) {
        const f = (km - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      }
    }
    return pts[pts.length - 1].slice();
  }
}
