// =====================================================================
// driver.html – driver: trips, start/end, share location, delay, walk-ons
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

// ---------------------------------------------------------------
// Geo – location helpers (browser Geolocation API)
// ---------------------------------------------------------------
class Geo {
  // The browser only gives the location on a secure page (https or localhost)
  static problem() {
    if (!navigator.geolocation) return "This browser cannot share its location. Please use an up-to-date browser or the BusBuddy app.";
    const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (location.protocol !== "https:" && !local) return "Location only works on a secure page. Open BusBuddy with its https:// address, then try again.";
    return null;
  }

  static errorText(err) {
    if (err.code === 1) return "Location is needed to start the trip. Allow location for this site in your browser (or app) settings, then try again.";
    if (err.code === 3) return "Getting your position took too long. Check that GPS is on, then try again.";
    return "Your position is not available. Turn on GPS / location on the phone, then try again.";
  }

  // Ask the browser for the position once (shows the permission question the first time)
  static getPosition() {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  }

  static toFix(pos) {
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed, t: pos.timestamp || Date.now() };
  }

  static clock(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
}

class DriverPage extends Page {
  // ---------------------------------------------------------------
  // 1. Page state
  // ---------------------------------------------------------------
  SHARE_SECONDS = BB.config.SHARE_SECONDS || 10;
  trips = [];            // rows from get_driver_trips()
  running = null;        // the trip that is active or delayed (at most one)
  stopsByRoute = {};     // { route_id: [stops] } for the small map
  upcomingKey = "";      // to re-draw the upcoming list only when something changed
  openLists = new Set(); // upcoming trips whose passenger list is open
  autoResumed = false;   // resume sharing once after a page reload
  map = null; mapLayer = null; mapTripId = null; busMarker = null;
  delayReason = "";

  // Everything about location sharing (UC-15) is kept in this one object
  share = {
    tripId: null,     // trip we are sharing for (null = not sharing)
    watchId: null,    // id from geolocation.watchPosition
    timer: null,      // id from setInterval (sends every SHARE_SECONDS)
    wakeLock: null,   // keeps the phone screen on
    lastFix: null,    // newest GPS position { lat, lng, speed, t }
    lastSent: null,   // the position we sent last time
    lastSentAt: null, // when it was sent
    problem: null     // { type: "error"|"warn", text, from }
  };

  async init() {
    await BB.renderNav("driver.html");
    if (!BB.db) return;                                   // setup not done yet
    const user = await BB.requireRole(["driver"]);        // drivers only
    if (!user) return;

    try { this.stopsByRoute = await BB.loadStopsByRoute(); } catch (e) { BB.toast(BB.errText(e), "error"); }

    this.bindPageLifecycle();
    this.bindStartButtons();
    this.bindRunningButtons();

    // 8. Refresh trips and seats every 30 s so new bookings appear
    BB.poll(() => this.loadTrips(), 30);
  }

  // Speed in km/h: from the GPS if it gives one (m/s × 3.6),
  // otherwise distance ÷ time since the position we sent last time, otherwise unknown
  speedKmh(fix) {
    if (fix.speed != null && !isNaN(fix.speed)) return Math.round(fix.speed * 3.6 * 10) / 10;
    const prev = this.share.lastSent;
    if (prev && fix.t > prev.t) {
      const hours = (fix.t - prev.t) / 3600000;
      return Math.round(BB.distanceKm(prev.lat, prev.lng, fix.lat, fix.lng) / hours * 10) / 10;
    }
    return null;
  }

  // ---------------------------------------------------------------
  // 3. Location sharing: watch the GPS, send every SHARE_SECONDS
  // ---------------------------------------------------------------
  startSharing(tripId, firstFix) {
    const share = this.share;
    this.stopSharing();
    share.tripId = tripId; share.lastFix = firstFix; share.problem = null;
    // watchPosition keeps the newest position in share.lastFix
    share.watchId = navigator.geolocation.watchPosition((pos) => this.onFix(pos), (err) => this.onGeoError(err), { enableHighAccuracy: true, maximumAge: 5000 });
    // setInterval and NOT BB.poll: BB.poll pauses when the tab is hidden, but sharing must go on.
    // Note: browsers may still slow down timers in background tabs, so the Android app
    // should keep the screen on (we also ask for a Wake Lock below).
    share.timer = setInterval(() => this.sendPosition(), this.SHARE_SECONDS * 1000);
    this.keepScreenOn();
    this.sendPosition();                         // send the first position immediately
  }

  stopSharing() {
    const share = this.share;
    if (share.watchId != null) navigator.geolocation.clearWatch(share.watchId);
    clearInterval(share.timer);
    if (share.wakeLock) { share.wakeLock.release().catch(() => {}); }
    Object.assign(share, { tripId: null, watchId: null, timer: null, wakeLock: null, lastFix: null, lastSent: null, lastSentAt: null });
  }

  onFix(pos) {                                   // a new GPS position arrived
    this.share.lastFix = Geo.toFix(pos);
    if (this.share.problem && this.share.problem.from === "gps") this.share.problem = null;
    this.moveBus(); this.renderShareStatus();
  }

  onGeoError(err) {                              // GPS problem while sharing
    if (err.code === 1) { this.stopSharing(); this.share.problem = { type: "error", text: Geo.errorText(err), from: "denied" }; }
    else this.share.problem = { type: "warn", text: "GPS signal lost. Still trying…", from: "gps" };
    this.renderShareStatus();
  }

  async sendPosition() {
    const share = this.share;
    const fix = share.lastFix;
    if (!share.tripId || !fix) return;
    // Same position as last time (bus waiting at a stop): resend it once a minute,
    // so the admin monitor doesn't mark the bus as "No signal".
    const same = fix === share.lastSent;
    if (same && share.lastSentAt && Date.now() - share.lastSentAt.getTime() < 60000) return;
    const { error } = await BB.db.rpc("share_location",
      { p_trip_id: share.tripId, p_lat: fix.lat, p_lng: fix.lng, p_speed: same ? 0 : this.speedKmh(fix) });
    if (error) {
      share.problem = { type: "warn", text: "Last send failed: " + BB.errText(error) + " Trying again in " + this.SHARE_SECONDS + " s.", from: "send" };
      this.renderShareStatus();
      if (/not running/i.test(error.message || "")) { this.stopSharing(); this.loadTrips(); }  // e.g. admin ended the trip
      return;
    }
    share.lastSent = fix; share.lastSentAt = new Date();
    if (share.problem && share.problem.from === "send") share.problem = null;
    this.renderShareStatus();
  }

  // Screen Wake Lock: stop the phone screen from turning off while the trip runs
  async keepScreenOn() {
    const share = this.share;
    if (!("wakeLock" in navigator) || share.wakeLock || document.hidden) return;
    try {
      share.wakeLock = await navigator.wakeLock.request("screen");
      share.wakeLock.addEventListener("release", () => { share.wakeLock = null; });
    } catch (e) { /* not supported or refused – sharing still works */ }
  }

  bindPageLifecycle() {
    // The lock is dropped when the page is hidden, so ask again when it comes back
    document.addEventListener("visibilitychange", () => { if (!document.hidden && this.share.tripId) this.keepScreenOn(); });
    // Leaving the page: stop the GPS, the timer and the wake lock
    window.addEventListener("pagehide", () => this.stopSharing());
    window.addEventListener("pageshow", (e) => { if (e.persisted && this.running) this.resumeSharing(this.running); });
  }

  // After a reload (or "Turn on location sharing"): ask for the location again, then share
  async resumeSharing(trip) {
    const problem = Geo.problem();
    if (problem) { this.share.problem = { type: "error", text: problem, from: "denied" }; return this.renderShareStatus(); }
    BB.show("#shareStatus", "Getting your location…", "info");
    try { this.startSharing(trip.trip_id, Geo.toFix(await Geo.getPosition())); }
    catch (err) { this.share.problem = { type: "error", text: Geo.errorText(err), from: "denied" }; }
    this.renderShareStatus(); this.moveBus();
  }

  // The coloured status line under the running trip
  renderShareStatus() {
    const share = this.share;
    if (!this.running) return;
    const on = share.tripId === this.running.trip_id;
    BB.$("#resumeBtn").classList.toggle("hidden", on);
    if (share.problem) return BB.show("#shareStatus", share.problem.text, share.problem.type);
    if (!on) return BB.show("#shareStatus", "Location sharing is off. Passengers cannot see the bus.", "warn");
    if (!share.lastSentAt) return BB.show("#shareStatus", "Waiting for GPS…", "info");
    BB.show("#shareStatus", `Sharing your location every ${this.SHARE_SECONDS} s · last sent ${Geo.clock(share.lastSentAt)}`, "ok");
  }

  // ---------------------------------------------------------------
  // 4. Small map: route stops + line + the bus following the GPS
  // ---------------------------------------------------------------
  drawMap(trip) {
    if (!window.L) return;
    if (!this.map) { this.map = BB.makeMap("driverMap"); this.mapLayer = L.layerGroup().addTo(this.map); }
    else this.map.invalidateSize();
    if (this.mapTripId !== trip.trip_id) {          // new trip: draw its route once
      this.mapTripId = trip.trip_id; this.mapLayer.clearLayers(); this.busMarker = null;
      const stops = this.stopsByRoute[trip.route_id] || [];
      const line = BB.routeLine(stops);         // road shape if the route has one, else stop to stop
      stops.forEach((s) => L.marker([s.latitude, s.longitude], { icon: BB.stopIcon() }).bindPopup(BB.esc(s.address)).addTo(this.mapLayer));
      if (line.length > 1) L.polyline(line, { color: "#534AB7", weight: 4, opacity: 0.7 }).addTo(this.mapLayer);
      if (line.length) this.map.fitBounds(line, { padding: [20, 20] });
    }
    this.moveBus();
  }

  moveBus() {
    if (!this.map || !this.running || !this.share.lastFix) return;
    const ll = [this.share.lastFix.lat, this.share.lastFix.lng];
    if (!this.busMarker) this.busMarker = L.marker(ll, { icon: BB.busIcon(this.running.status), zIndexOffset: 1000 }).addTo(this.mapLayer);
    else { this.busMarker.setLatLng(ll); this.busMarker.setIcon(BB.busIcon(this.running.status)); }
  }

  // ---------------------------------------------------------------
  // 5. Load my trips (UC-13) and draw the three parts of the page
  // ---------------------------------------------------------------
  async loadTrips() {
    const { data, error } = await BB.db.rpc("get_driver_trips");
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    this.trips = data || [];
    this.running = this.trips.find((t) => t.status === "active" || t.status === "delayed") || null;
    BB.$("#emptyState").classList.toggle("hidden", this.trips.length > 0);
    if (!this.running && this.share.tripId) this.stopSharing();             // trip was ended (e.g. by the admin)
    this.renderUpcoming(); this.renderEarlier();
    await this.renderRunning();
    if (this.running && this.share.tripId !== this.running.trip_id && !this.autoResumed) {   // page reloaded mid-trip
      this.autoResumed = true; this.resumeSharing(this.running);
    }
  }

  // Passenger list (shared by the running card and the upcoming trips) – UC-17
  async passengersHtml(tripId) {
    const { data, error } = await BB.db.rpc("get_trip_passengers", { p_trip_id: tripId });
    if (error) return `<div class="alert alert-error">${BB.esc(BB.errText(error))}</div>`;
    if (!data || !data.length) return '<p class="muted">No passengers yet.</p>';
    return data.map((p) => {
      const booked = p.status === "booked" && p.passenger_id;
      const contact = booked ? BB.telLink(p.phone_no, "Call") +   // phone call …
        `<a class="btn btn-purple btn-small" href="messages.html?trip=${encodeURIComponent(tripId)}&passenger=${encodeURIComponent(p.passenger_id)}">Message</a>` : "";  // … or in-app message
      return `<div class="pass-row">
          <div><b>${BB.esc(booked ? p.full_name : "Roadside passenger")}</b>
            <div class="row muted">${p.nb_of_seats} seat${p.nb_of_seats > 1 ? "s" : ""} ${BB.badge(p.status)}</div></div>
          <div class="row">${contact}</div></div>`;
    }).join("");
  }

  // A. Running trip card
  async renderRunning() {
    BB.$("#running").classList.toggle("hidden", !this.running);
    if (!this.running) return;
    const t = this.running;
    BB.$("#runRoute").textContent = t.route_name;
    BB.$("#runInfo").innerHTML = `${BB.badge(t.status)} <span>${BB.esc(t.plate_number)}</span>
      <span class="muted">Departure ${BB.fmtTime(t.departure_time)}</span>`;
    BB.$("#runSeats").textContent = `${t.seats_taken} / ${t.capacity}`;
    BB.$("#walkOnBtn").disabled = t.seats_taken >= t.capacity;       // bus is full
    this.renderShareStatus();
    this.drawMap(t);
    BB.$("#runPassengers").innerHTML = await this.passengersHtml(t.trip_id);
  }

  // B. Upcoming (scheduled) trips
  renderUpcoming() {
    const running = this.running;
    const list = this.trips.filter((t) => t.status === "scheduled");
    BB.$("#upcomingWrap").classList.toggle("hidden", !list.length);
    const key = JSON.stringify(list) + !!running;
    if (key === this.upcomingKey) return;             // nothing changed: keep open lists as they are
    this.upcomingKey = key;
    BB.$("#upcoming").innerHTML = list.map((t) => `
      <div class="card" data-id="${t.trip_id}">
        <div class="row-between"><div class="card-title">${BB.esc(t.route_name)}</div>${BB.badge(t.status)}</div>
        <div><b>${BB.fmtDateTime(t.departure_time)}</b> · ${BB.esc(t.plate_number)} · Seats ${t.seats_taken} / ${t.capacity}</div>
        <div class="actions-2">
          <button class="btn btn-outline" data-act="pass">Passengers</button>
          <button class="btn" data-act="start" ${running ? "disabled" : ""}>Start trip</button>
        </div>
        ${running ? '<p class="muted" style="margin:8px 0 0">End your running trip first.</p>' : ""}
        <div class="pass-list hidden" style="margin-top:10px"></div>
      </div>`).join("");
    this.openLists.forEach((id) => {                  // re-open the lists that were open
      const c = BB.$(`#upcoming [data-id="${id}"]`);
      if (c) this.togglePassengers(c, true); else this.openLists.delete(id);
    });
  }

  async togglePassengers(c, forceOpen) {
    const box = BB.$(".pass-list", c), id = c.dataset.id;
    const open = forceOpen || box.classList.contains("hidden");
    box.classList.toggle("hidden", !open);
    BB.$('[data-act="pass"]', c).textContent = open ? "Hide passengers" : "Passengers";
    if (!open) { this.openLists.delete(id); return; }
    this.openLists.add(id);
    if (!box.innerHTML) box.innerHTML = '<p class="muted">Loading…</p>';
    box.innerHTML = await this.passengersHtml(Number(id));
  }

  // C. Completed / cancelled trips of today
  renderEarlier() {
    const today = new Date().toDateString();
    const list = this.trips.filter((t) => ["completed", "cancelled"].includes(t.status)
                                  && new Date(t.departure_time).toDateString() === today);
    BB.$("#earlierWrap").classList.toggle("hidden", !list.length);
    BB.$("#earlierTitle").textContent = `Earlier today (${list.length})`;
    BB.$("#earlier").innerHTML = list.map((t) => `
      <div class="card"><div class="row-between"><b>${BB.esc(t.route_name)}</b>${BB.badge(t.status)}</div>
        <div class="muted">${BB.fmtTime(t.departure_time)} · ${BB.esc(t.plate_number)} · Seats ${t.seats_taken} / ${t.capacity}</div></div>`).join("");
  }

  // ---------------------------------------------------------------
  // 6. Start trip (UC-14 + UC-15): location FIRST, then start, then share
  // ---------------------------------------------------------------
  async startTrip(tripId, btn) {
    BB.show("#startMsg", "");
    const problem = Geo.problem();
    if (problem) return BB.show("#startMsg", problem, "error");
    BB.busy(btn, true, "Getting your location…");
    let fix;
    try { fix = Geo.toFix(await Geo.getPosition()); }
    catch (err) { BB.busy(btn, false); return BB.show("#startMsg", Geo.errorText(err), "error"); }  // do NOT start
    const { error } = await BB.db.rpc("start_trip", { p_trip_id: tripId });
    BB.busy(btn, false);
    if (error) return BB.toast(BB.errText(error), "error");
    this.autoResumed = true;
    this.startSharing(tripId, fix);                   // sends the first position right away
    BB.toast("Trip started. Your location is being shared.", "ok");
    await this.loadTrips();
    window.scrollTo(0, 0);
  }

  bindStartButtons() {
    BB.$("#upcoming").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const c = btn.closest("[data-id]");
      if (btn.dataset.act === "pass") this.togglePassengers(c);
      else this.startTrip(Number(c.dataset.id), btn);
    });
    BB.$("#resumeBtn").addEventListener("click", () => { this.share.problem = null; if (this.running) this.resumeSharing(this.running); });
  }

  // ---------------------------------------------------------------
  // 7. Running trip buttons: roadside walk-on, report delay, end trip
  // ---------------------------------------------------------------
  bindRunningButtons() {
    // A passenger got on at the roadside: one more seat taken (free seats update for everyone)
    BB.$("#walkOnBtn").addEventListener("click", async (e) => {
      BB.busy(e.target, true, "Saving…");
      const { error } = await BB.db.rpc("record_walk_on", { p_trip_id: this.running.trip_id, p_seats: 1 });
      BB.busy(e.target, false);
      if (error) return BB.toast(BB.errText(error), "error");
      BB.toast("Roadside passenger added.", "ok");
      await this.loadTrips();
    });

    // Report delay (UC-16): open the form, pick a reason and minutes, submit
    BB.$("#delayBtn").addEventListener("click", () => {
      BB.$("#delayForm").classList.toggle("hidden");
      BB.show("#delayMsg", "");
    });
    BB.$("#delayCancel").addEventListener("click", () => BB.$("#delayForm").classList.add("hidden"));
    BB.$("#reasons").addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) return;
      this.delayReason = b.dataset.r;
      BB.$$("#reasons .tab").forEach((x) => x.classList.toggle("active", x === b));
      BB.$("#otherWrap").classList.toggle("hidden", this.delayReason !== "Other");
      if (this.delayReason === "Other") BB.$("#otherReason").focus();
    });
    BB.$("#delaySubmit").addEventListener("click", async (e) => {
      const reason = this.delayReason === "Other" ? BB.$("#otherReason").value.trim() : this.delayReason;
      if (!reason) return BB.show("#delayMsg", this.delayReason === "Other" ? "Please describe the reason." : "Please choose a reason.", "error");
      BB.busy(e.target, true, "Sending…");
      const { error } = await BB.db.rpc("report_delay",
        { p_trip_id: this.running.trip_id, p_reason: reason, p_minutes: Number(BB.$("#delayMin").value) });
      BB.busy(e.target, false);
      if (error) return BB.show("#delayMsg", BB.errText(error), "error");
      BB.toast("Delay reported. Passengers will see it.", "ok");
      BB.$("#delayForm").classList.add("hidden");   // the trip keeps running and sharing
      await this.loadTrips();
    });

    // End trip (UC-14): confirm, end it in the database, stop sharing
    BB.$("#endBtn").addEventListener("click", async (e) => {
      if (!(await BB.confirmBox("End this trip? Location sharing will stop.", "End trip"))) return;
      BB.busy(e.target, true, "Ending…");
      const { error } = await BB.db.rpc("end_trip", { p_trip_id: this.running.trip_id });
      BB.busy(e.target, false);
      if (error) return BB.toast(BB.errText(error), "error");
      this.stopSharing();
      BB.$("#delayForm").classList.add("hidden");
      BB.toast("Trip ended. Location sharing stopped.", "ok");
      await this.loadTrips();
    });
  }
}

DriverPage.mount();
