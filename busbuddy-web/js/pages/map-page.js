// =====================================================================
// map.html – live bus map + ETA (public)
// Route colours and filter chips, "Locate me" / "Nearest stop",
// bus markers that slide and point the way they are going.
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class MapPage extends Page {
  POLL = BB.config.POLL_SECONDS || 10;
  map = null;
  stopsByRoute = {};
  routes = [];
  routeById = {};
  routeLayers = {};          // route_id → { group, line, points }
  stopMarkers = [];          // [{ stop, marker }] – used by "Nearest stop"
  selected = null;           // route_id shown by the filter (null = all routes)
  buses = [];                // latest result of get_live_buses()
  markers = {};              // trip_id → { marker, status, routeId, last: [lat, lng] }
  me = null; meDot = null; meRing = null; nearestLine = null;   // "Locate me"

  async init() {
    await BB.renderNav("map.html");
    if (!BB.db) {                                          // setup not done yet: the banner explains
      BB.$(".map-layout").classList.add("hidden"); BB.$(".refresh-line").classList.add("hidden"); return;
    }
    BB.$("#poll-sec").textContent = this.POLL;

    await this.drawRoutes();

    // ?route=<id> opens the map on one route; ?trip=<id> is read before the filter rewrites the address
    const wantTrip = Number(BB.param("trip"));
    const wanted = Number(BB.param("route"));
    if (wanted && this.routeById[wanted]) this.selected = wanted;

    this.bindChips();
    this.addMapTools();

    // 7. Start: draw the chips, show the chosen route(s), first refresh,
    //    then ?trip=<id> (from "Track my bus"), then keep polling
    this.setFilter(this.selected, true);
    this.startPolling(wantTrip);
  }

  colorOf(id) { return BB.routeColor(this.routeById[id] || id); }
  visible(routeId) { return this.selected == null || this.selected === routeId; }

  // ---------------------------------------------------------------
  // 1. Create the map and load the routes and their stops (once).
  //    Each route = one layer group (its line + its stops), so the filter can show or hide it.
  // ---------------------------------------------------------------
  async drawRoutes() {
    this.map = BB.makeMap("map");
    try {
      this.stopsByRoute = await BB.loadStopsByRoute();
      const { data, error } = await BB.db.from("routes").select("*").order("route_id");
      if (error) throw error;
      this.routes = data || [];
    } catch (e) { BB.toast(BB.errText(e), "error"); }
    this.routes.forEach((r) => { this.routeById[r.route_id] = r; });

    Object.entries(this.stopsByRoute).forEach(([rid, stops]) => {
      const id = Number(rid), color = this.colorOf(id);
      const group = L.layerGroup().addTo(this.map);
      const lineLatLngs = BB.routeLine(stops);          // road shape if the route has one, else stop to stop
      const line = L.polyline(lineLatLngs, { color, weight: 4, opacity: 0.85 }).addTo(group);
      stops.forEach((s) => {
        // The popup text is built when the stop is clicked, so it uses the latest bus positions
        const marker = L.marker([s.latitude, s.longitude], { icon: BB.stopIcon(color) })
          .bindPopup(() => this.stopPopupHtml(s))
          .addTo(group);
        this.stopMarkers.push({ stop: s, marker });
      });
      this.routeLayers[id] = { group, line, points: lineLatLngs };
    });
  }

  // ---------------------------------------------------------------
  // 2. Route filter (chips)
  // ---------------------------------------------------------------
  renderChips() {
    const box = BB.$("#route-chips");
    if (this.routes.length < 2) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = `<button class="chip" data-route="" aria-pressed="${this.selected == null}">All routes</button>` +
      this.routes.map((r) => `<button class="chip" data-route="${r.route_id}" aria-pressed="${this.selected === r.route_id}">
          ${BB.routeDot(r)}${BB.esc(r.name)}</button>`).join("");
  }

  bindChips() {
    BB.$("#route-chips").addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const id = chip.dataset.route ? Number(chip.dataset.route) : null;
      if (id === this.selected) return;
      this.setFilter(id, true);
    });
  }

  setFilter(routeId, fit) {
    this.selected = routeId;
    history.replaceState(null, "", this.selected == null ? "map.html" : "map.html?route=" + this.selected);
    Object.entries(this.routeLayers).forEach(([id, l]) => {
      if (this.visible(Number(id))) { if (!this.map.hasLayer(l.group)) l.group.addTo(this.map); l.line.bringToFront(); }
      else this.map.removeLayer(l.group);
    });
    Object.values(this.markers).forEach((m) => {
      if (this.visible(m.routeId)) { if (!this.map.hasLayer(m.marker)) m.marker.addTo(this.map); }
      else this.map.removeLayer(m.marker);
    });
    this.clearNearestLine();
    this.renderChips();
    this.renderList();
    if (fit) this.fitVisible();
  }

  fitVisible() {
    const pts = [];
    Object.entries(this.routeLayers).forEach(([id, l]) => { if (this.visible(Number(id))) pts.push(...l.points); });
    if (pts.length) this.map.fitBounds(pts, { padding: [30, 30] });
  }

  // ---------------------------------------------------------------
  // 3. "Locate me" and "Nearest stop" (buttons drawn on the map)
  // ---------------------------------------------------------------
  static locationProblem() {
    if (!navigator.geolocation) return "This browser cannot find your location.";
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (location.protocol !== "https:" && !local) return "Your location only works on a secure (https://) page.";
    return null;
  }

  static geoErrorText(err) {
    if (err.code === 1) return "Location is blocked. Allow location for this site in your browser or app settings.";
    if (err.code === 3) return "Finding your location took too long. Check that GPS is on and try again.";
    return "Your location is not available. Turn on GPS / location and try again.";
  }

  static fmtDistance(km) { return km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`; }
  static walkMinutes(km) { return Math.max(1, Math.round(km * 1.3 / 5 * 60)); }       // ~5 km/h, roads are not straight

  addMapTools() {
    const Tools = L.Control.extend({
      options: { position: "topright" },
      onAdd() {
        const div = L.DomUtil.create("div", "leaflet-bar map-tools");
        div.innerHTML = `<button type="button" id="locate-btn">📍 Locate me</button>
                         <button type="button" id="nearest-btn">🚏 Nearest stop</button>`;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        return div;
      }
    });
    this.map.addControl(new Tools());

    BB.$("#locate-btn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (!(await this.locate(btn))) return;
      this.map.setView(this.me, Math.max(this.map.getZoom(), 14));
      if (window.innerWidth <= 820) BB.$("#map").scrollIntoView({ behavior: "smooth", block: "center" });
    });

    BB.$("#nearest-btn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (!(await this.locate(btn))) return;
      const me = this.me;
      const candidates = this.stopMarkers.filter((x) => this.visible(x.stop.route_id));
      if (!candidates.length) { BB.toast("There are no stops to show."); return; }
      let best = null, bestKm = Infinity;
      candidates.forEach((x) => {
        const km = BB.distanceKm(me.lat, me.lng, x.stop.latitude, x.stop.longitude);
        if (km < bestKm) { bestKm = km; best = x; }
      });
      this.clearNearestLine();
      const stopLL = best.marker.getLatLng();
      this.nearestLine = L.polyline([me, stopLL], { color: "#1A73E8", weight: 3, dashArray: "6 8", interactive: false }).addTo(this.map);
      this.map.fitBounds([me, stopLL], { padding: [60, 60], maxZoom: 16 });
      best.marker.openPopup();
      if (window.innerWidth <= 820) BB.$("#map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Ask for the position once, then draw a blue dot (and how precise it is)
  async locate(btn) {
    const problem = MapPage.locationProblem();
    if (problem) { BB.toast(problem, "error"); return null; }
    BB.busy(btn, true, "Finding you…");
    try {
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }));
      this.me = L.latLng(pos.coords.latitude, pos.coords.longitude);
      const acc = Math.min(pos.coords.accuracy || 0, 2000);
      if (!this.meDot) {
        this.meRing = L.circle(this.me, { radius: acc, color: "#1A73E8", weight: 1, fillOpacity: 0.1, interactive: false }).addTo(this.map);
        this.meDot = L.circleMarker(this.me, { radius: 8, color: "#FFFFFF", weight: 3, fillColor: "#1A73E8", fillOpacity: 1 })
          .bindTooltip("You are here").addTo(this.map);
      } else { this.meRing.setLatLng(this.me).setRadius(acc); this.meDot.setLatLng(this.me); }
      return this.me;
    } catch (err) {
      BB.toast(MapPage.geoErrorText(err), "error");
      return null;
    } finally { BB.busy(btn, false); }
  }

  clearNearestLine() {
    if (this.nearestLine) { this.map.removeLayer(this.nearestLine); this.nearestLine = null; }
  }

  // ---------------------------------------------------------------
  // 4. Popup texts
  // ---------------------------------------------------------------
  static updatedText(iso) {
    const m = BB.minutesAgo(iso);
    if (m == null) return "No position yet";
    return m < 1 ? "Updated just now" : `Updated ${m} min ago`;
  }

  static seatsText(n) {
    return `${n} seat${n === 1 ? "" : "s"} free`;
  }

  // Bus popup: route, plate, status, delay, seats, last update and ETA at each stop ahead
  busPopupHtml(bus) {
    const eta = BB.computeEta(bus, this.stopsByRoute[bus.route_id]);
    const etaHtml = eta.length
      ? `<ul class="eta-list">${eta.map((e) => `<li>${BB.esc(e.stop.address)} – ${e.minutes} min</li>`).join("")}</ul>`
      : `<p class="muted">No more stops ahead.</p>`;
    return `<div class="popup-title">${BB.routeDot(this.routeById[bus.route_id] || bus.route_id)}${BB.esc(bus.route_name)}</div>
      <div>${BB.esc(bus.plate_number)} ${BB.badge(bus.status)}</div>
      ${bus.delay_minutes ? `<div style="color:var(--amber)">Delayed ~${bus.delay_minutes} min – ${BB.esc(bus.delay_reason || "")}</div>` : ""}
      <div>${MapPage.seatsText(bus.available_seats)}</div>
      <div class="muted">${MapPage.updatedText(bus.last_update)}</div>
      <div style="margin-top:6px"><b>Arrival times</b></div>${etaHtml}
      <p style="margin:8px 0 0"><a href="schedules.html?route=${bus.route_id}">Reserve a seat on a later bus</a></p>`;
  }

  // Soonest bus that still has this stop ahead of it
  nextBusAt(stop) {
    let best = null;
    this.buses.filter((b) => b.route_id === stop.route_id && b.latitude != null).forEach((b) => {
      const hit = BB.computeEta(b, this.stopsByRoute[b.route_id]).find((e) => e.stop.stop_id === stop.stop_id);
      if (hit && (!best || hit.minutes < best.minutes)) best = { bus: b, minutes: hit.minutes };
    });
    return best;
  }

  // Stop popup. Several routes often share a stop (e.g. near Cola), so every visible
  // route with a stop within 150 m is listed, each with its own next bus.
  stopPopupHtml(stop) {
    const near = {};
    this.stopMarkers.forEach(({ stop: s }) => {
      if (s.route_id !== stop.route_id && !this.visible(s.route_id)) return;
      const km = BB.distanceKm(stop.latitude, stop.longitude, s.latitude, s.longitude);
      if (km > 0.15) return;
      if (!near[s.route_id] || km < near[s.route_id].km) near[s.route_id] = { stop: s, km };
    });
    const lines = Object.values(near)
      .sort((a, b) => (b.stop.route_id === stop.route_id) - (a.stop.route_id === stop.route_id)   // clicked route first
                      || a.stop.route_id - b.stop.route_id)
      .map(({ stop: s }) => {
        const r = this.routeById[s.route_id], next = this.nextBusAt(s);
        const text = next ? `next bus <b>${next.minutes} min</b> (${BB.esc(next.bus.plate_number)})`
                          : `no bus on the way – <a href="schedules.html?route=${s.route_id}">schedules</a>`;
        return `<div class="stop-route">${BB.routeDot(r || s.route_id)}<span><b>${BB.esc(r ? r.name : "Route " + s.route_id)}</b>: ${text}</span></div>`;
      }).join("");
    let dist = "";
    if (this.me) {
      const km = BB.distanceKm(this.me.lat, this.me.lng, stop.latitude, stop.longitude);
      dist = `<div class="me-dist">${MapPage.fmtDistance(km)} from you${km < 5 ? ` · about ${MapPage.walkMinutes(km)} min walk` : ""}</div>`;
    }
    return `<div class="popup-title">${BB.esc(stop.address)}</div>${lines}${dist}`;
  }

  // ---------------------------------------------------------------
  // 5. Side list of running buses (cards). Clicking one zooms to the bus.
  // ---------------------------------------------------------------
  renderList() {
    const box = BB.$("#bus-list");
    const shown = this.buses.filter((b) => this.visible(b.route_id));
    if (!shown.length) {
      const where = this.selected == null ? "" : ` on ${BB.esc((this.routeById[this.selected] || {}).name || "this route")}`;
      box.innerHTML = `<div class="card empty">No buses are running${where} right now.<br>
        <a href="schedules.html${this.selected == null ? "" : "?route=" + this.selected}">See the schedules</a></div>`;
      return;
    }
    box.innerHTML = shown.map((b) => {
      const next = BB.computeEta(b, this.stopsByRoute[b.route_id])[0];
      const nextText = b.latitude == null ? "Waiting for the first position"
        : next ? `Next: ${BB.esc(next.stop.address)} – ${next.minutes} min` : "Arriving at the last stop";
      return `<button class="card bus-card" data-trip="${b.trip_id}" style="--route:${BB.esc(this.colorOf(b.route_id))}">
          <div class="row-between"><b>${BB.esc(b.route_name)}</b>${BB.badge(b.status)}</div>
          <p class="muted">${BB.esc(b.plate_number)} · ${MapPage.seatsText(b.available_seats)}</p>
          <p class="muted">${nextText}</p>
        </button>`;
    }).join("");
    BB.$$(".bus-card", box).forEach((el) => el.addEventListener("click", () => this.focusBus(Number(el.dataset.trip))));
  }

  focusBus(tripId) {
    const m = this.markers[tripId];
    if (!m) { BB.toast("This bus has not shared its position yet."); return; }
    if (!this.visible(m.routeId)) this.setFilter(null, false);    // the bus is on a hidden route: show all again
    if (window.innerWidth <= 820) BB.$("#map").scrollIntoView({ behavior: "smooth" });
    this.map.setView(m.marker.getLatLng(), Math.max(this.map.getZoom(), 14));
    m.marker.openPopup();
  }

  // ---------------------------------------------------------------
  // 6. Polling: ask for the running buses every POLL seconds and
  //    create / slide / turn / update / remove one marker per trip
  // ---------------------------------------------------------------
  async refresh() {
    const { data, error } = await BB.db.rpc("get_live_buses");
    if (error) { BB.show("#map-msg", BB.errText(error), "error"); return; }
    BB.show("#map-msg", "");
    this.buses = data || [];

    const seen = new Set();
    this.buses.forEach((b) => {
      if (b.latitude == null) return;                    // trip started but no position yet: listed only
      seen.add(b.trip_id);
      const pos = [b.latitude, b.longitude];
      const color = this.colorOf(b.route_id);
      let m = this.markers[b.trip_id];
      if (!m) {
        // First time: point the arrow at the next stop ahead until the bus has moved
        const next = BB.computeEta(b, this.stopsByRoute[b.route_id])[0];
        const heading = next ? BB.bearing(b.latitude, b.longitude, next.stop.latitude, next.stop.longitude) : null;
        const marker = L.marker(pos, { icon: BB.busIcon(b.status, color, heading) }).bindPopup("");
        marker.on("add", () => BB.applyBusHeading(marker));   // re-shown by the filter: keep its direction
        m = this.markers[b.trip_id] = { marker, status: b.status, routeId: b.route_id, last: pos };
        BB.setBusHeading(marker, heading);
        if (this.visible(b.route_id)) marker.addTo(this.map);
      } else {
        // Moved more than ~15 m: turn the arrow toward the way it went, then slide there
        if (BB.distanceKm(m.last[0], m.last[1], pos[0], pos[1]) > 0.015) {
          BB.setBusHeading(m.marker, BB.bearing(m.last[0], m.last[1], pos[0], pos[1]));
        }
        m.last = pos;
        BB.slideMarker(m.marker, pos, Math.min(1500, this.POLL * 500));
        if (m.status !== b.status) {
          m.marker.setIcon(BB.busIcon(b.status, color, m.marker.bb && m.marker.bb.heading));
          m.status = b.status;
        }
      }
      m.marker.setPopupContent(this.busPopupHtml(b));    // stays open if the user opened it
    });
    // Remove markers of trips that ended
    Object.keys(this.markers).forEach((id) => {
      if (!seen.has(Number(id))) { this.map.removeLayer(this.markers[id].marker); delete this.markers[id]; }
    });

    this.renderList();
    BB.$("#last-refresh").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  startPolling(wantTrip) {
    let first = true;
    const stop = BB.poll(async () => {
      await this.refresh();
      if (first) {
        first = false;
        const want = wantTrip;
        if (want) {
          if (this.markers[want]) this.focusBus(want);
          else BB.toast(this.buses.some((b) => b.trip_id === want)
            ? "Your bus has not shared its position yet." : "This trip is not running right now.");
        }
      }
    }, this.POLL);
    window.addEventListener("pagehide", stop);
  }
}

MapPage.mount();
