// =====================================================================
// schedules.html – routes, timetable, reserve a seat
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class SchedulesPage extends Page {
  user = null;
  canBook = false;
  routes = [];
  route = null;          // the route being shown
  stopsByRoute = {};
  trips = [];

  async init() {
    await BB.renderNav("schedules.html");
    if (!BB.db) { BB.$(".sched-layout").classList.add("hidden"); return; }   // setup not done yet: the banner explains

    // ---------------------------------------------------------------
    // 1. Who is looking? Guests and passengers see Reserve buttons
    //    (guests are sent to log in); drivers and admins do not.
    // ---------------------------------------------------------------
    this.user = await BB.getUser();
    this.canBook = !this.user || this.user.type === "passenger";
    if (!this.canBook) BB.$("#role-note").classList.remove("hidden");

    // ---------------------------------------------------------------
    // 2. Load the routes and all stops (stops are grouped by route)
    // ---------------------------------------------------------------
    const { data: routes, error } = await BB.db.from("routes").select("*").order("route_id");
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    if (!routes || !routes.length) {
      BB.$("#timeline").innerHTML = "";
      BB.$("#trips").innerHTML = `<div class="card empty">No routes have been added yet.</div>`;
      return;
    }
    this.routes = routes;
    try { this.stopsByRoute = await BB.loadStopsByRoute(); } catch (e) { BB.toast(BB.errText(e), "error"); }

    this.setupRoutePicker();

    // ---------------------------------------------------------------
    // 6. Start: show the route; if we came back from login (?trip=<id>),
    //    scroll to that trip and highlight it
    // ---------------------------------------------------------------
    await this.showRoute();
    const back = BB.param("trip");
    const card = back && BB.$("#trip-" + Number(back));
    if (card) {
      card.classList.add("highlight");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Route chooser: only shown when there is more than one route (?route=<id> picks one)
  setupRoutePicker() {
    const routes = this.routes;
    const sel = BB.$("#route-select");
    sel.innerHTML = routes.map((r) => `<option value="${r.route_id}">${BB.esc(r.name)}</option>`).join("");
    const wanted = routes.find((r) => String(r.route_id) === BB.param("route"));
    this.route = wanted || routes[0];
    sel.value = this.route.route_id;
    if (routes.length > 1) BB.$("#route-pick").classList.remove("hidden");
    sel.addEventListener("change", () => {
      this.route = routes.find((r) => String(r.route_id) === sel.value);
      history.replaceState(null, "", "schedules.html?route=" + this.route.route_id);
      BB.show("#book-result", "");
      this.showRoute();
    });
  }

  // ---------------------------------------------------------------
  // 3. Route timeline: every stop in order with "+N min"
  // ---------------------------------------------------------------
  async showRoute() {
    const route = this.route;
    BB.$("#route-info").textContent = `${route.name}: ${route.origin} → ${route.destination}`;
    const stops = this.stopsByRoute[route.route_id] || [];
    BB.$("#timeline").innerHTML = stops.length
      ? stops.map((s) => `<li><b>${BB.esc(s.address)}</b><br><span class="muted">+${s.minutes_from_start} min</span></li>`).join("")
      : `<li class="muted">No stops on this route yet.</li>`;
    await this.loadTrips();
  }

  // ---------------------------------------------------------------
  // 4. Upcoming trips of the chosen route, one card each
  // ---------------------------------------------------------------
  async loadTrips() {
    const { data, error } = await BB.db.rpc("get_upcoming_trips", { p_route_id: this.route.route_id });
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    this.trips = (data || []).sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
    const box = BB.$("#trips");
    if (!this.trips.length) { box.innerHTML = `<div class="card empty">No upcoming trips on this route.</div>`; return; }
    box.innerHTML = this.trips.map((t) => this.tripCardHtml(t)).join("");

    // Buttons inside the cards
    BB.$$("[data-reserve]", box).forEach((b) => b.addEventListener("click", () => {
      const t = this.trips.find((x) => x.trip_id === Number(b.dataset.reserve));
      const seats = Number(BB.$("#seats-" + t.trip_id).value);
      this.reserve(t.trip_id, seats, t.departure_time, b);
    }));
    BB.$$("[data-findnext]", box).forEach((b) => b.addEventListener("click", () =>
      this.showNext(Number(b.dataset.findnext), 1)));
    BB.$$("[data-times]", box).forEach((b) => b.addEventListener("click", () => {
      const list = BB.$("#times-" + b.dataset.times);
      list.classList.toggle("hidden");
      b.textContent = list.classList.contains("hidden") ? "Times at stops" : "Hide times";
    }));
  }

  tripCardHtml(t) {
    const free = t.available_seats;
    const stops = this.stopsByRoute[t.route_id] || [];
    const dep = new Date(t.departure_time).getTime();
    const times = stops.map((s) =>
      `<li>${BB.esc(s.address)} – ${BB.fmtTime(new Date(dep + s.minutes_from_start * 60000).toISOString())}</li>`).join("");

    // What the passenger can do on this trip
    let action = "";
    if (t.status !== "scheduled") {
      action = `<a class="btn btn-outline btn-small" href="map.html?trip=${t.trip_id}">On the road – track it</a>`;
    } else if (this.canBook && free > 0) {
      const options = Array.from({ length: Math.min(4, free) }, (_, i) =>
        `<option value="${i + 1}">${i + 1} seat${i ? "s" : ""}</option>`).join("");
      action = `<select id="seats-${t.trip_id}" aria-label="Number of seats">${options}</select>
                <button class="btn" data-reserve="${t.trip_id}">Reserve</button>`;
    } else if (this.canBook) {
      action = `<button class="btn btn-amber" data-findnext="${t.trip_id}">Find the next bus</button>`;
    }

    return `<div class="card trip-card" id="trip-${t.trip_id}">
        <div class="row-between">
          <div class="card-title">${BB.fmtDate(t.departure_time)} · ${BB.fmtTime(t.departure_time)}</div>
          ${BB.badge(t.status)}
        </div>
        <p class="muted">Bus ${BB.esc(t.plate_number)}</p>
        <p class="${free === 0 ? "full" : ""}">${free} of ${t.capacity} seats free</p>
        <div class="row">${action}
          <button class="btn btn-outline btn-small" data-times="${t.trip_id}">Times at stops</button>
        </div>
        <ul id="times-${t.trip_id}" class="stop-times hidden">${times || "<li>No stops.</li>"}</ul>
        <div class="trip-msg" id="msg-${t.trip_id}"></div>
      </div>`;
  }

  // ---------------------------------------------------------------
  // 5. Reserve seats (UC-08). Guests go to the login page first.
  //    If the bus is full, offer the next bus with enough seats (UC-09).
  // ---------------------------------------------------------------
  async reserve(tripId, seats, departure, btn) {
    if (!this.user) {
      location.href = "login.html?next=" + encodeURIComponent("schedules.html?trip=" + tripId);
      return;
    }
    const ok = await BB.confirmBox(`Reserve ${seats} seat(s) on the ${BB.fmtTime(departure)} trip?`, "Reserve");
    if (!ok) return;
    BB.busy(btn, true, "Reserving…");
    const { error } = await BB.db.rpc("book_seat", { p_trip_id: tripId, p_seats: seats });
    BB.busy(btn, false);

    if (!error) {
      BB.toast("Seat reserved!", "ok");
      const box = BB.$("#book-result");
      box.className = "alert alert-ok";
      box.innerHTML = `Reserved ${seats} seat(s) on the ${BB.esc(BB.fmtDateTime(departure))} trip.
                       <a href="bookings.html">See my bookings</a>`;
      await this.loadTrips();
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // "FULL:" is checked on the raw message, before BB.errText removes it
    if ((error.message || "").includes("FULL")) { await this.showNext(tripId, seats); return; }
    BB.toast(BB.errText(error), "error");
  }

  // Show the next trip with enough free seats inside the card of the full trip
  async showNext(tripId, seats) {
    const msg = BB.$("#msg-" + tripId);
    const { data, error } = await BB.db.rpc("next_available_trip", { p_trip_id: tripId, p_seats: seats });
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    const next = (data || [])[0];
    if (!next) {
      msg.innerHTML = `<div class="alert alert-warn">This bus is full and there is no later bus with free seats today.</div>`;
      return;
    }
    msg.innerHTML = `<div class="alert alert-warn">This bus is full. The next bus with ${next.available_seats} free seats
        leaves at ${BB.fmtTime(next.departure_time)} (${BB.esc(BB.fmtDate(next.departure_time))}).
        <div style="margin-top:8px"><button class="btn btn-small">Reserve that one</button></div></div>`;
    const b = BB.$("button", msg);
    b.addEventListener("click", () => this.reserve(next.trip_id, seats, next.departure_time, b));
  }
}

SchedulesPage.mount();
