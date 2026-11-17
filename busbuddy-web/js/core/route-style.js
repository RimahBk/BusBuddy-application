// =====================================================================
// RouteStyle – each route gets its own colour on the map, the schedule
// cards and the bus list (a route row may also carry its own `color`).
// =====================================================================
import { Dom } from "./dom.js";

export class RouteStyle {
  static COLORS = ["#534AB7", "#1565C0", "#C2185B", "#00838F", "#6D4C41", "#2E7D32", "#AD1457", "#283593"];

  // route = a routes row, or just a route_id
  static color(route) {
    if (route && typeof route === "object") {
      if (route.color) return route.color;
      route = route.route_id;
    }
    const id = Number(route) || 1;
    return RouteStyle.COLORS[(id - 1) % RouteStyle.COLORS.length];
  }

  // A small coloured circle to put before a route's name
  static dot(route) {
    return `<span class="route-dot" style="background:${Dom.esc(RouteStyle.color(route))}"></span>`;
  }
}
