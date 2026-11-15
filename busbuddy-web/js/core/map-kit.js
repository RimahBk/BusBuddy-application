// =====================================================================
// MapKit – Leaflet 1.9.4 + OpenStreetMap helpers shared by the map pages.
// `L` is the global from js/vendor/leaflet/leaflet.js (loaded only on map pages).
// =====================================================================
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

  static busIcon(status) {
    return L.divIcon({
      className: "", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
      html: `<div class="bus-marker ${status === "delayed" ? "delayed" : ""}">🚌</div>`
    });
  }

  static stopIcon() {
    return L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="stop-marker"></div>' });
  }

  // Load the stops of every route once:  { route_id: [stops sorted by stop_order] }
  async loadStopsByRoute() {
    const out = {};
    if (!this.#db) return out;
    const { data, error } = await this.#db.from("stops").select("*").order("route_id").order("stop_order");
    if (error) throw error;
    (data || []).forEach((s) => { (out[s.route_id] = out[s.route_id] || []).push(s); });
    return out;
  }
}
