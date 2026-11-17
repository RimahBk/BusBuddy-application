// =====================================================================
// schedules.html – route cards, route timeline, trips by day, reserve a seat
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class SchedulesPage extends Page {
  user = null;
  canBook = false;
  routes = [];
  route = null;          // the route being shown
  stopsByRoute = {};
  allTrips = [];         // upcoming trips of every route
  trips = [];            // trips of the chosen route (all days)
  selectedDay = null;    // BB.dayKey of the open day tab

  static isRunning(t) { return t.status === "active" || t.status === "delayed"; }

  // Which day tab a trip belongs to. A bus already on the road counts as today.
  static dayOf(t) { return SchedulesPage.isRunning(t) ? BB.dayKey(new Date()) : BB.dayKey(t.departure_time); }

  // "today", "tomorrow" or "on Thu 19 Nov" – for use inside a sentence
  static whenText(iso) {
    const l = BB.dayLabel(iso);
    return l === "Today" || l === "Tomorrow" ? l.toLowerCase() : "on " + l;
  }

  async init() {
    await BB.renderNav("schedules.html");
    if (!BB.db) { BB.$(".sched-layout").classList.add("hidden"); BB.$("#route-cards").classList.add("hidden"); return; }   // setup not done yet

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
      BB.$("#route-cards").innerHTML = "";
      BB.$("#timeline").innerHTML = "";
      BB.$("#trips").innerHTML = `<div class="card empty">No routes have been added yet.</div>`;
      return;
    }
    this.routes = routes;
    try { this.stopsByRoute = await BB.loadStopsByRoute(); } catch (e) { BB.toast(BB.errText(e), "error"); }

    // 3. All upcoming trips of every route (one request)
    await this.fetchTrips();

    // Chosen route: ?route=<id>, or the route of ?trip=<id> (back from log in), or the first route
    const backTrip = Number(BB.param("trip"));
    const backTripRow = backTrip ? this.allTrips.find((t) => t.trip_id === backTrip) : null;
    this.route = routes.find((r) => String(r.route_id) === BB.param("route"))
             || (backTripRow && routes.find((r) => r.route_id === backTripRow.route_id))
             || routes[0];

    this.bindRouteCards();
    this.bindDayTabs();
    this.bindTripButtons();

    // ---------------------------------------------------------------
    // 8. Start: show the route; if we came back from login (?trip=<id>),
    //    open that trip's day, scroll to it and highlight it
    // ---------------------------------------------------------------
    if (backTripRow) this.selectedDay = SchedulesPage.dayOf(backTripRow);
    this.showRoute();
    const card = backTrip && BB.$("#trip-" + backTrip);
    if (card) {
      card.classList.add("highlight");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // The route cards use every trip for "Next departure"; the list below shows the chosen route
  async fetchTrips() {
    const { data, error } = await BB.db.rpc("get_upcoming_trips");
    if (error) { BB.toast(BB.errText(error), "error"); return false; }
    this.allTrips = (data || []).sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
    return true;
  }

  // Re-load every trip (after booking) and re-draw the cards and the list
  async loadTrips() {
    if (await this.fetchTrips()) { this.renderRouteCards(); this.renderTrips(); }
  }

  // ---------------------------------------------------------------
  // 4. Route cards
  // ---------------------------------------------------------------
  routeCardHtml(r) {
    const list = this.allTrips.filter((t) => t.route_id === r.route_id);
    const live = list.filter(SchedulesPage.isRunning).length;
    const next = list.find((t) => t.status === "scheduled" && new Date(t.departure_time) > new Date());
    const nextText = next ? `Next: <b>${BB.esc(BB.dayLabel(next.departure_time))} ${BB.esc(BB.fmtTime(next.departure_time))}</b>`
                          : `<span class="muted">No departures planned</span>`;
    const liveText = live ? `<span class="rc-live">● ${live} on the road</span> · ` : "";
    return `<button class="route-card" data-route="${r.route_id}" aria-pressed="${r.route_id === this.route.route_id}"
                    style="--route:${BB.esc(BB.routeColor(r))}">
        <span class="rc-name">${BB.routeDot(r)}${BB.esc(r.name)}</span>
        <span class="rc-od">${BB.esc(r.origin)} → ${BB.esc(r.destination)}</span>
        <span class="rc-next">${liveText}${nextText}</span>
      </button>`;
  }

  renderRouteCards() {
    BB.$("#route-cards").innerHTML = this.routes.map((r) => this.routeCardHtml(r)).join("");
  }

  bindRouteCards() {
    BB.$("#route-cards").addEventListener("click", (e) => {
      const card = e.target.closest(".route-card");
      if (!card || Number(card.dataset.route) === this.route.route_id) return;
      this.route = this.routes.find((r) => r.route_id === Number(card.dataset.route));
      history.replaceState(null, "", "schedules.html?route=" + this.route.route_id);
      BB.show("#book-result", "");
      this.selectedDay = null;                                   // pick the best day for the new route
      this.showRoute();
    });
  }

  // ---------------------------------------------------------------
  // 5. Route timeline: every stop in order with "+N min"
  // ---------------------------------------------------------------
  showRoute() {
    const route = this.route;
    this.renderRouteCards();
    const card = BB.$(`.route-card[data-route="${route.route_id}"]`);
    if (card) card.scrollIntoView({ block: "nearest", inline: "nearest" });
    BB.$("#route-info").innerHTML = `${BB.routeDot(route)} ${BB.esc(route.name)}: ${BB.esc(route.origin)} → ${BB.esc(route.destination)}
      · <a href="map.html?route=${route.route_id}">See on the map</a>`;
    const stops = this.stopsByRoute[route.route_id] || [];
    const tl = BB.$("#timeline");
    tl.style.setProperty("--route", BB.routeColor(route));
    tl.innerHTML = stops.length
      ? stops.map((s) => `<li><b>${BB.esc(s.address)}</b><br><span class="muted">+${s.minutes_from_start} min</span></li>`).join("")
      : `<li class="muted">No stops on this route yet.</li>`;
    this.renderTrips();
  }

  // ---------------------------------------------------------------
  // 6. Day tabs (Today / Tomorrow / later days that have trips)
  // ---------------------------------------------------------------
  dayTabs() {
    const now = new Date();
    const days = [now, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)]
      .map((d) => ({ key: BB.dayKey(d), date: d }));
    this.trips.forEach((t) => {
      const key = SchedulesPage.dayOf(t);
      if (!days.some((d) => d.key === key)) days.push({ key, date: new Date(t.departure_time) });
    });
    return days.sort((a, b) => a.date - b.date).map((d) => ({
      ...d, label: BB.dayLabel(d.date.toISOString()), count: this.trips.filter((t) => SchedulesPage.dayOf(t) === d.key).length
    }));
  }

  renderTrips() {
    this.trips = this.allTrips.filter((t) => t.route_id === this.route.route_id);
    const days = this.dayTabs();
    if (!days.some((d) => d.key === this.selectedDay)) this.selectedDay = null;
    if (!this.selectedDay) this.selectedDay = (days.find((d) => d.count) || days[0]).key;
    const selectedDay = this.selectedDay;

    BB.$("#day-tabs").innerHTML = days.map((d) => `<button class="tab ${d.key === selectedDay ? "active" : ""}" role="tab"
        aria-selected="${d.key === selectedDay}" data-day="${d.key}">${BB.esc(d.label)} <span class="count">(${d.count})</span></button>`).join("");

    const box = BB.$("#trips");
    const list = this.trips.filter((t) => SchedulesPage.dayOf(t) === selectedDay);
    if (!list.length) {
      const day = days.find((d) => d.key === selectedDay);
      const other = days.find((d) => d.count && d.key !== selectedDay);
      box.innerHTML = `<div class="card empty">No trips on this route ${BB.esc(SchedulesPage.whenText(day.date.toISOString()))}.
        ${other ? `<div style="margin-top:10px"><button class="btn btn-outline" data-goto-day="${other.key}">See ${BB.esc(other.label)} (${other.count})</button></div>` : ""}</div>`;
      return;
    }
    box.innerHTML = list.map((t) => this.tripCardHtml(t)).join("");
  }

  bindDayTabs() {
    BB.$("#day-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest("[data-day]");
      if (!tab || tab.dataset.day === this.selectedDay) return;
      this.selectedDay = tab.dataset.day;
      this.renderTrips();
    });
  }

  // Buttons inside the trip list (one listener, survives re-drawing)
  bindTripButtons() {
    BB.$("#trips").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.gotoDay) { this.selectedDay = b.dataset.gotoDay; this.renderTrips(); return; }
      if (b.dataset.reserve) {
        const t = this.trips.find((x) => x.trip_id === Number(b.dataset.reserve));
        const seats = Number(BB.$("#seats-" + t.trip_id).value);
        this.reserve(t.trip_id, seats, t.departure_time, b);
      }
      if (b.dataset.findnext) this.showNext(Number(b.dataset.findnext), 1);
      if (b.dataset.times) {
        const list = BB.$("#times-" + b.dataset.times);
        list.classList.toggle("hidden");
        b.textContent = list.classList.contains("hidden") ? "Times at stops" : "Hide times";
      }
    });
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
          <div class="card-title">${BB.fmtTime(t.departure_time)}</div>
          ${BB.badge(t.status)}
        </div>
        <p class="muted">${BB.esc(BB.fmtDate(t.departure_time))} · Bus ${BB.esc(t.plate_number)}</p>
        <p class="${free === 0 ? "full" : ""}">${free} of ${t.capacity} seats free</p>
        <div class="row">${action}
          <button class="btn btn-outline btn-small" data-times="${t.trip_id}">Times at stops</button>
        </div>
        <ul id="times-${t.trip_id}" class="stop-times hidden">${times || "<li>No stops.</li>"}</ul>
        <div class="trip-msg" id="msg-${t.trip_id}"></div>
      </div>`;
  }

  // ---------------------------------------------------------------
  // 7. Reserve seats (UC-08). Guests go to the login page first.
  //    If the bus is full, offer the next bus with enough seats (UC-09).
  // ---------------------------------------------------------------
  async reserve(tripId, seats, departure, btn) {
    if (!this.user) {
      location.href = "login.html?next=" + encodeURIComponent("schedules.html?trip=" + tripId);
      return;
    }
    const ok = await BB.confirmBox(`Reserve ${seats} seat(s) on the ${BB.dayLabel(departure)} ${BB.fmtTime(departure)} trip?`, "Reserve");
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
        leaves ${BB.esc(SchedulesPage.whenText(next.departure_time))} at ${BB.fmtTime(next.departure_time)}.
        <div style="margin-top:8px"><button class="btn btn-small">Reserve that one</button></div></div>`;
    const b = BB.$("button", msg);
    b.addEventListener("click", (e) => { e.stopPropagation(); this.reserve(next.trip_id, seats, next.departure_time, b); });
  }
}

SchedulesPage.mount();
