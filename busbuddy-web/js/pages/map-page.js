// =====================================================================
// map.html – live bus map + ETA (public)
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class MapPage extends Page {
  map = null;
  stopsByRoute = {};
  buses = [];                // latest result of get_live_buses()
  markers = {};              // trip_id → { marker, status }

  async init() {
    await BB.renderNav("map.html");
    if (!BB.db) {                                          // setup not done yet: the banner explains
      BB.$(".map-layout").classList.add("hidden"); BB.$(".refresh-line").classList.add("hidden"); return;
    }

    const POLL = BB.config.POLL_SECONDS || 10;
    BB.$("#poll-sec").textContent = POLL;

    await this.drawRoutes();
    this.startPolling(POLL);
  }

  // ---------------------------------------------------------------
  // 1. Create the map and draw every route with its stops (loaded once)
  // ---------------------------------------------------------------
  async drawRoutes() {
    this.map = BB.makeMap("map");
    try { this.stopsByRoute = await BB.loadStopsByRoute(); }
    catch (e) { BB.toast(BB.errText(e), "error"); }

    const allPoints = [];
    Object.values(this.stopsByRoute).forEach((stops) => {
      const line = stops.map((s) => [s.latitude, s.longitude]);
      allPoints.push(...line);
      L.polyline(line, { color: "#534AB7", weight: 3, opacity: 0.8 }).addTo(this.map);
      stops.forEach((s) => {
        // The popup text is built when the stop is clicked, so it uses the latest bus positions
        L.marker([s.latitude, s.longitude], { icon: BB.stopIcon() })
          .bindPopup(() => this.stopPopupHtml(s))
          .addTo(this.map);
      });
    });
    if (allPoints.length) this.map.fitBounds(allPoints, { padding: [30, 30] });
  }

  // ---------------------------------------------------------------
  // 2. Popup texts
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
    return `<div class="popup-title">${BB.esc(bus.route_name)}</div>
      <div>${BB.esc(bus.plate_number)} ${BB.badge(bus.status)}</div>
      ${bus.delay_minutes ? `<div style="color:var(--amber)">Delayed ~${bus.delay_minutes} min – ${BB.esc(bus.delay_reason || "")}</div>` : ""}
      <div>${MapPage.seatsText(bus.available_seats)}</div>
      <div class="muted">${MapPage.updatedText(bus.last_update)}</div>
      <div style="margin-top:6px"><b>Arrival times</b></div>${etaHtml}
      <p style="margin:8px 0 0"><a href="schedules.html">Reserve a seat on a later bus</a></p>`;
  }

  // Stop popup: address, scheduled offset, and the nearest bus that still has this stop ahead
  stopPopupHtml(stop) {
    let best = null;
    this.buses.filter((b) => b.route_id === stop.route_id && b.latitude != null).forEach((b) => {
      const hit = BB.computeEta(b, this.stopsByRoute[b.route_id]).find((e) => e.stop.stop_id === stop.stop_id);
      if (hit && (!best || hit.minutes < best.minutes)) best = { bus: b, minutes: hit.minutes };
    });
    const next = best
      ? `<div>Next bus: <b>${best.minutes} min</b> (${BB.esc(best.bus.plate_number)})</div>`
      : `<div>No bus on the way right now – <a href="schedules.html">see schedules</a></div>`;
    return `<div class="popup-title">${BB.esc(stop.address)}</div>
      <div class="muted">Scheduled: +${stop.minutes_from_start} min from the start</div>${next}`;
  }

  // ---------------------------------------------------------------
  // 3. Side list of running buses (cards). Clicking one zooms to the bus.
  // ---------------------------------------------------------------
  renderList() {
    const box = BB.$("#bus-list");
    if (!this.buses.length) {
      box.innerHTML = `<div class="card empty">No buses are running right now.<br>
        <a href="schedules.html">See the schedules</a></div>`;
      return;
    }
    box.innerHTML = this.buses.map((b) => {
      const next = BB.computeEta(b, this.stopsByRoute[b.route_id])[0];
      const nextText = b.latitude == null ? "Waiting for the first position"
        : next ? `Next: ${BB.esc(next.stop.address)} – ${next.minutes} min` : "Arriving at the last stop";
      return `<button class="card bus-card" data-trip="${b.trip_id}">
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
    if (window.innerWidth <= 820) BB.$("#map").scrollIntoView({ behavior: "smooth" });
    this.map.setView(m.marker.getLatLng(), Math.max(this.map.getZoom(), 14));
    m.marker.openPopup();
  }

  // ---------------------------------------------------------------
  // 4. Polling: ask for the running buses every POLL seconds and
  //    create / move / update / remove one marker per trip
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
      let m = this.markers[b.trip_id];
      if (!m) {
        m = this.markers[b.trip_id] = { marker: L.marker(pos, { icon: BB.busIcon(b.status) }).bindPopup("").addTo(this.map), status: b.status };
      } else {
        m.marker.setLatLng(pos);
        if (m.status !== b.status) { m.marker.setIcon(BB.busIcon(b.status)); m.status = b.status; }
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

  // ---------------------------------------------------------------
  // 5. Start: first refresh, then ?trip=<id> (from "Track my bus"), then keep polling
  // ---------------------------------------------------------------
  startPolling(seconds) {
    let first = true;
    const stop = BB.poll(async () => {
      await this.refresh();
      if (first) {
        first = false;
        const want = Number(BB.param("trip"));
        if (want) {
          if (this.markers[want]) this.focusBus(want);
          else BB.toast(this.buses.some((b) => b.trip_id === want)
            ? "Your bus has not shared its position yet." : "This trip is not running right now.");
        }
      }
    }, seconds);
    window.addEventListener("pagehide", stop);
  }
}

MapPage.mount();
