// =====================================================================
// MapKit – Leaflet 1.9.4 + OpenStreetMap helpers shared by the map pages.
// `L` is the global from js/vendor/leaflet/leaflet.js (loaded only on map pages).
// =====================================================================
import { Dom } from "./dom.js";

// Users who ask their system for less motion get markers that jump instead of slide
const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class MapKit {
  #cfg;
  #db;

  constructor(cfg, db) {
    this.#cfg = cfg;
    this.#db = db;
  }

  makeMap(elementId) {
    const map = L.map(elementId).setView(this.#cfg.MAP_CENTER || [33.78, 35.5], this.#cfg.MAP_ZOOM || 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return map;
  }

  // Bus marker: a circle in the route's colour with an arrow that shows the direction.
  // Without a colour it keeps the old look (green, amber when delayed) – used by the monitor and driver pages.
  static busIcon(status, color, heading) {
    const delayed = status === "delayed";
    const bg = color || (delayed ? "var(--amber)" : "var(--green)");
    const arrow = heading == null || isNaN(heading) ? `<span class="bus-arrow"></span>`
      : `<span class="bus-arrow on" style="transform:rotate(${Number(heading)}deg)"></span>`;
    return L.divIcon({
      className: "", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
      html: `<div class="bus-marker ${delayed ? "delayed" : ""}" style="--route:${Dom.esc(bg)}">${arrow}<span class="bus-glyph">🚌</span></div>`
    });
  }

  static stopIcon(color) {
    return L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7],
      html: `<div class="stop-marker"${color ? ` style="border-color:${Dom.esc(color)}"` : ""}></div>` });
  }

  // Turn a bus marker's arrow. The angle is kept continuous (350° → 10° turns 20°, not back 340°).
  static setBusHeading(marker, deg) {
    if (deg == null || isNaN(deg)) return;
    marker.bb = marker.bb || {};
    const prev = marker.bb.heading;
    marker.bb.heading = prev == null ? deg : prev + ((((deg - prev) % 360) + 540) % 360 - 180);
    MapKit.applyBusHeading(marker);
  }

  static applyBusHeading(marker) {
    const el = marker.getElement && marker.getElement();
    const arrow = el && el.querySelector(".bus-arrow");
    if (!arrow || !marker.bb || marker.bb.heading == null) return;
    arrow.style.transform = `rotate(${marker.bb.heading}deg)`;
    arrow.classList.add("on");
  }

  // Move a marker smoothly to its new position instead of jumping.
  // Jumps straight there when the tab is hidden, the move is very long, or the user prefers less motion.
  static slideMarker(marker, to, ms) {
    const target = L.latLng(to), from = marker.getLatLng();
    marker.bb = marker.bb || {};
    cancelAnimationFrame(marker.bb.anim);
    if (reduceMotion || document.hidden || !marker._map || from.equals(target) || from.distanceTo(target) > 3000) {
      marker.setLatLng(target); return;
    }
    const start = performance.now(), dur = ms || 1500;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);   // ease-out
      marker.setLatLng([from.lat + (target.lat - from.lat) * e, from.lng + (target.lng - from.lng) * e]);
      if (t < 1) marker.bb.anim = requestAnimationFrame(step);
    };
    marker.bb.anim = requestAnimationFrame(step);
  }

  // The line to draw for a route: its real road shape if known, otherwise straight lines between its stops
  static routeLine(stops, path) {
    const p = path || (stops && stops.path);
    return Array.isArray(p) && p.length > 1 ? p : (stops || []).map((s) => [s.latitude, s.longitude]);
  }

  // Load the stops of every route once:  { route_id: [stops sorted by stop_order] }
  // Each list also gets .path = the route's road shape ([lat, lng] points) when the route has one.
  async loadStopsByRoute() {
    const out = {};
    if (!this.#db) return out;
    const { data, error } = await this.#db.from("stops").select("*").order("route_id").order("stop_order");
    if (error) throw error;
    (data || []).forEach((s) => { (out[s.route_id] = out[s.route_id] || []).push(s); });
    const { data: routes } = await this.#db.from("routes").select("*");
    (routes || []).forEach((r) => { if (out[r.route_id] && Array.isArray(r.path) && r.path.length > 1) out[r.route_id].path = r.path; });
    return out;
  }
}
