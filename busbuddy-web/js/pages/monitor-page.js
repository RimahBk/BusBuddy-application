// =====================================================================
// monitor.html – admin: live fleet monitor
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class MonitorPage extends Page {
  STALE = BB.config.STALE_MINUTES || 3;
  map = null;
  markers = {};   // trip_id → Leaflet marker of that bus
  trips = [];     // last result of admin_fleet()

  async init() {
    await BB.renderNav("monitor.html");
    if (!BB.db) return;                                   // setup not done yet
    const user = await BB.requireRole(["admin"]);         // administrators only (UC-19)
    if (!user) return;

    BB.$("#stale-min").textContent = this.STALE;

    await this.drawRoutes();
    this.bindTable();

    // 4. Polling: refresh every POLL_SECONDS, stop when leaving the page
    const stop = BB.poll(() => this.refresh(), BB.config.POLL_SECONDS);
    window.addEventListener("pagehide", stop);
  }

  // ---------------------------------------------------------------
  // 1. Map with every route drawn as a line through its stops
  // ---------------------------------------------------------------
  async drawRoutes() {
    this.map = BB.makeMap("fleet-map");
    const stopsByRoute = await BB.loadStopsByRoute();
    const allStops = [];
    Object.values(stopsByRoute).forEach((stops) => {
      const line = BB.routeLine(stops);           // road shape if the route has one, else stop to stop
      L.polyline(line, { color: "#534AB7", weight: 4, opacity: 0.6 }).addTo(this.map);
      stops.forEach((s) => {
        L.marker([s.latitude, s.longitude], { icon: BB.stopIcon() }).addTo(this.map).bindTooltip(BB.esc(s.address));
        allStops.push([s.latitude, s.longitude]);
      });
    });
    if (allStops.length) this.map.fitBounds(allStops, { padding: [30, 30] });
  }

  // Is this bus's last position too old (or missing)?
  isStale(t) {
    return !t.last_update || BB.minutesAgo(t.last_update) > this.STALE;
  }

  // Text shown in the Last update column / popup
  static lastText(t) {
    if (!t.last_update) return "never";
    const m = BB.minutesAgo(t.last_update);
    return m < 1 ? "just now" : m + " min ago";
  }

  static delayText(t) {
    return t.delay_minutes ? `${t.delay_minutes} min – ${t.delay_reason || ""}` : "–";
  }

  // ---------------------------------------------------------------
  // 2. Load running trips and redraw the numbers, markers and table
  // ---------------------------------------------------------------
  async refresh() {
    const { data, error } = await BB.db.rpc("admin_fleet");
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    this.trips = data || [];
    BB.$("#updated-at").textContent = "Updated " + BB.fmtTime(new Date().toISOString());
    this.drawStats();
    this.drawMarkers();
    this.drawTable();
  }

  drawStats() {
    const trips = this.trips;
    const seats = trips.reduce((s, t) => s + (t.seats_taken || 0), 0);
    const cap = trips.reduce((s, t) => s + (t.capacity || 0), 0);
    BB.$("#stat-running").textContent = trips.length;
    BB.$("#stat-delayed").textContent = trips.filter((t) => t.status === "delayed").length;
    BB.$("#stat-seats").textContent = seats + " / " + cap;
  }

  drawMarkers() {
    const { lastText, delayText } = MonitorPage;
    const markers = this.markers;
    const seen = {};
    this.trips.forEach((t) => {
      if (t.latitude == null) return;                      // no position yet
      seen[t.trip_id] = true;
      const popup = `<b>${BB.esc(t.route_name)}</b><br>Bus ${BB.esc(t.plate_number)}<br>
        Driver: ${BB.esc(t.driver_name)}<br>Seats: ${t.seats_taken} / ${t.capacity}<br>
        Last update: ${lastText(t)}<br>Delay: ${BB.esc(delayText(t))}`;
      if (markers[t.trip_id]) {                            // move the existing marker
        markers[t.trip_id].setLatLng([t.latitude, t.longitude]).setIcon(BB.busIcon(t.status)).setPopupContent(popup);
      } else {                                             // first time: create it
        markers[t.trip_id] = L.marker([t.latitude, t.longitude], { icon: BB.busIcon(t.status) }).addTo(this.map).bindPopup(popup);
      }
    });
    // remove buses whose trip is no longer running
    Object.keys(markers).forEach((id) => { if (!seen[id]) { this.map.removeLayer(markers[id]); delete markers[id]; } });
  }

  drawTable() {
    const { lastText, delayText } = MonitorPage;
    const box = BB.$("#fleet-box");
    if (!this.trips.length) { box.innerHTML = '<div class="empty">No buses are running right now.</div>'; return; }
    box.innerHTML = `<div class="table-wrap"><table id="fleet-table">
      <thead><tr><th>Route</th><th>Bus</th><th>Driver</th><th>Status</th><th>Seats</th><th>Last update</th><th>Delay</th><th></th></tr></thead>
      <tbody>${this.trips.map((t) => `
        <tr data-trip="${t.trip_id}" class="${this.isStale(t) ? "warn" : ""}">
          <td>${BB.esc(t.route_name)}</td>
          <td>${BB.esc(t.plate_number)}</td>
          <td>${BB.esc(t.driver_name)}<br>${BB.telLink(t.driver_phone, "Call")}</td>
          <td>${BB.badge(t.status)}</td>
          <td>${t.seats_taken} / ${t.capacity}</td>
          <td>${lastText(t)}${this.isStale(t) ? '<span class="no-signal">No signal</span>' : ""}</td>
          <td>${BB.esc(delayText(t))}</td>
          <td><button class="btn btn-danger btn-small" data-end="${t.trip_id}">End trip</button></td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------
  // 3. Table clicks: "End trip" button, or a row → pan the map to that bus
  // ---------------------------------------------------------------
  bindTable() {
    BB.$("#fleet-box").addEventListener("click", async (e) => {
      if (e.target.closest("a")) return;                   // the Call link works on its own
      const endBtn = e.target.closest("[data-end]");
      if (endBtn) {
        const t = this.trips.find((x) => String(x.trip_id) === endBtn.dataset.end);
        const ok = await BB.confirmBox(`End the trip of bus ${t ? t.plate_number : ""} now? It will disappear from the live map.`, "End trip");
        if (!ok) return;
        BB.busy(endBtn, true, "Ending…");
        const { error } = await BB.db.rpc("end_trip", { p_trip_id: Number(endBtn.dataset.end) });
        if (error) { BB.busy(endBtn, false); BB.toast(BB.errText(error), "error"); return; }
        BB.toast("Trip ended.", "ok");
        await this.refresh();
        return;
      }
      const row = e.target.closest("tr[data-trip]");
      if (!row) return;
      const m = this.markers[row.dataset.trip];
      if (!m) { BB.toast("This bus has not sent a position yet."); return; }
      this.map.setView(m.getLatLng(), 14);
      m.openPopup();
      BB.$("#fleet-map").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

MonitorPage.mount();
