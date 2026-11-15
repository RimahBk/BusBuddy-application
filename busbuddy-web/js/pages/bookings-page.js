// =====================================================================
// bookings.html – passenger: my bookings, cancel, call / message driver
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

class BookingsPage extends Page {
  static RUNNING = ["scheduled", "active", "delayed"];
  user = null;
  bookings = [];

  async init() {
    await BB.renderNav("bookings.html");
    if (!BB.db) {                                          // setup not done yet (banner explains)
      BB.$("#upcoming").innerHTML = `<p class="muted">Your bookings will appear here once the site is connected.</p>`;
      BB.$("#past-wrap").classList.add("hidden");
      return;
    }
    this.user = await BB.requireRole(["passenger"]);      // only passengers have bookings
    if (!this.user) return;

    this.bindButtons();

    // 6. Start
    await this.loadBookings();
  }

  // -----------------------------------------------------------------
  // 1. Load my bookings (UC-10) and split them into two groups
  //    Upcoming = still booked AND the trip has not finished / been cancelled
  // -----------------------------------------------------------------
  async loadBookings() {
    const { data, error } = await BB.db.rpc("get_my_bookings");
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    this.bookings = data || [];
    this.render();
  }

  static isUpcoming(b) {
    return b.booking_status === "booked" && BookingsPage.RUNNING.includes(b.trip_status);
  }

  // -----------------------------------------------------------------
  // 2. Draw the cards
  // -----------------------------------------------------------------
  render() {
    const isUpcoming = BookingsPage.isUpcoming;
    // Upcoming: soonest trip first. Past: newest first (as the database returns them).
    const upcoming = this.bookings.filter(isUpcoming)
      .sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time));
    const past = this.bookings.filter((b) => !isUpcoming(b));

    BB.$("#upcoming").innerHTML = upcoming.length
      ? upcoming.map((b) => this.upcomingCard(b)).join("")
      : `<div class="card empty">
           <p>You have no upcoming bookings.</p>
           <a class="btn" href="schedules.html">See schedules and book a seat</a>
         </div>`;

    BB.$("#past-count").textContent = past.length;
    BB.$("#past").innerHTML = past.length
      ? past.map((b) => BookingsPage.pastCard(b)).join("")
      : `<p class="muted">Nothing here yet.</p>`;
  }

  // One upcoming booking with its action buttons
  upcomingCard(b) {
    const live = b.trip_status === "active" || b.trip_status === "delayed";
    const canCancel = b.trip_status === "scheduled" && new Date(b.departure_time) > new Date();
    return `<div class="card" data-booking="${b.booking_id}" data-trip="${b.trip_id}" data-dep="${BB.esc(b.departure_time)}">
      <div class="row-between">
        <div class="card-title">${BB.esc(b.route_name)}</div>
        ${BB.badge(b.trip_status)}
      </div>
      <div class="booking-meta">
        <div><b>${BB.esc(BB.fmtDateTime(b.departure_time))}</b></div>
        <div class="muted">${b.nb_of_seats} seat${b.nb_of_seats > 1 ? "s" : ""} booked · Bus ${BB.esc(b.plate_number)} · Driver ${BB.esc(b.driver_name)}</div>
      </div>
      <div class="row booking-actions">
        ${live ? `<a class="btn" href="map.html?trip=${b.trip_id}">Track my bus</a>` : ""}
        <button class="btn btn-outline" data-action="call">📞 Call driver</button>
        <a class="btn btn-outline" href="messages.html?trip=${b.trip_id}&passenger=${encodeURIComponent(this.user.id)}">💬 Message driver</a>
        ${canCancel ? `<button class="btn btn-danger" data-action="cancel">Cancel booking</button>` : ""}
      </div>
      <div class="phone-line hidden"></div>
    </div>`;
  }

  // One past or cancelled booking (muted, no actions)
  static pastCard(b) {
    const status = b.booking_status === "cancelled" ? "cancelled" : b.trip_status;
    return `<div class="card past">
      <div class="row-between">
        <div class="card-title">${BB.esc(b.route_name)}</div>
        ${BB.badge(status)}
      </div>
      <div class="booking-meta">
        <div>${BB.esc(BB.fmtDateTime(b.departure_time))}</div>
        <div class="muted">${b.nb_of_seats} seat${b.nb_of_seats > 1 ? "s" : ""} · Bus ${BB.esc(b.plate_number)} · Driver ${BB.esc(b.driver_name)}</div>
      </div>
      ${b.trip_status === "cancelled" ? `<div class="note">This trip was cancelled</div>` : ""}
    </div>`;
  }

  // -----------------------------------------------------------------
  // 3. Button clicks (one listener for all cards)
  // -----------------------------------------------------------------
  bindButtons() {
    BB.$("#upcoming").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const card = btn.closest(".card");
      if (btn.dataset.action === "call") this.callDriver(card, btn);
      if (btn.dataset.action === "cancel") this.cancelBooking(card, btn);
    });
  }

  // -----------------------------------------------------------------
  // 4. Call driver (UC-12 → UC-03). The database gives the number only
  //    when this passenger has a booking on the trip. Contact is by phone
  //    call or in-app message only.
  // -----------------------------------------------------------------
  async callDriver(card, btn) {
    BB.busy(btn, true, "Getting number…");
    const { data: phone, error } = await BB.db.rpc("get_contact_phone", {
      p_trip_id: Number(card.dataset.trip), p_passenger_id: this.user.id
    });
    BB.busy(btn, false);
    if (error) { BB.toast(BB.errText(error), "error"); return; }
    if (!phone) { BB.toast("The driver's number is not available for this trip.", "error"); return; }

    const clean = String(phone).replace(/[^+\d]/g, "");
    // Show the number too: a laptop cannot place a phone call
    const line = card.querySelector(".phone-line");
    line.innerHTML = `Driver's number: <a href="tel:${BB.esc(clean)}">${BB.esc(phone)}</a>`;
    line.classList.remove("hidden");
    location.href = "tel:" + clean;          // opens the phone dialer on a phone
  }

  // -----------------------------------------------------------------
  // 5. Cancel booking (UC-11): ask first, then the database checks it is
  //    my booking and that the bus has not left yet.
  // -----------------------------------------------------------------
  async cancelBooking(card, btn) {
    const time = BB.fmtTime(card.dataset.dep);
    const sure = await BB.confirmBox(`Cancel your booking on the ${time} trip?`, "Cancel booking");
    if (!sure) return;
    BB.busy(btn, true, "Cancelling…");
    const { error } = await BB.db.rpc("cancel_booking", { p_booking_id: Number(card.dataset.booking) });
    if (error) { BB.busy(btn, false); BB.toast(BB.errText(error), "error"); return; }
    BB.toast("Your booking was cancelled.", "ok");
    await this.loadBookings();
  }
}

BookingsPage.mount();
