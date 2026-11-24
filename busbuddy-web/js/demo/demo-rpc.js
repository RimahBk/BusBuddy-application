// =====================================================================
// DemoRpc – a JavaScript copy of every SQL function in supabase/schema.sql
// that the pages call with db.rpc("name", { … }).
// One method per SQL function, with the SAME name, the same columns and
// the SAME error messages, so a page behaves the same in demo mode and online.
// When you change a function in schema.sql, change it here too.
//
// Each method receives (args, me) where `me` is the logged-in demo user (or null).
// It returns the data, or { error: "message" } to simulate a database error.
// Helper methods must NOT live in this class (every method is callable as an RPC);
// they belong in DemoStore.
// =====================================================================
const iso = (ms) => new Date(ms).toISOString();
const RUNNING = ["active", "delayed"];
const OPEN = ["scheduled", "active", "delayed"];
const byTime = (key, desc) => (a, b) => (new Date(a[key]) - new Date(b[key])) * (desc ? -1 : 1);

export class DemoRpc {
  #s;

  constructor(store) {
    this.#s = store;
  }

  // Is `name` one of the functions below?
  static has(name) {
    return name !== "constructor" && Object.prototype.hasOwnProperty.call(DemoRpc.prototype, name)
        && typeof DemoRpc.prototype[name] === "function";
  }

  // ---------------- 4.1 – 4.4  Public map + schedules ----------------
  get_live_buses() {
    const s = this.#s;
    return s.tables.trips.filter((t) => RUNNING.includes(t.status)).map((t) => {
      const l = s.lastLoc(t.trip_id), d = s.openDelay(t.trip_id);
      return { trip_id: t.trip_id, route_id: t.route_id, route_name: s.route(t.route_id).name, plate_number: s.bus(t.bus_id).plate_number,
               status: t.status, departure_time: t.departure_time, latitude: l.latitude, longitude: l.longitude, speed: l.speed,
               last_update: l.time, delay_minutes: d.delay_time || null, delay_reason: d.reason || null, available_seats: s.avail(t.trip_id) };
    });
  }

  // Trips still to come (and ones that left less than 3 hours ago), soonest first
  get_upcoming_trips(a) {
    const s = this.#s, since = Date.now() - 3 * 3600000;
    return s.tables.trips
      .filter((t) => OPEN.includes(t.status) && new Date(t.departure_time) > since && (!a || !a.p_route_id || t.route_id === a.p_route_id))
      .sort(byTime("departure_time"))
      .map((t) => {
        const r = s.route(t.route_id), b = s.bus(t.bus_id);
        return { trip_id: t.trip_id, route_id: r.route_id, route_name: r.name, origin: r.origin, destination: r.destination,
                 departure_time: t.departure_time, status: t.status, plate_number: b.plate_number, capacity: b.capacity,
                 available_seats: s.avail(t.trip_id) };
      });
  }

  available_seats(a) {
    return this.#s.avail(a.p_trip_id);
  }

  // UC-08 Reserve seats – same checks, in the same order, as book_seat() in SQL
  book_seat(a, me) {
    const s = this.#s, seats = a.p_seats == null ? 1 : a.p_seats;
    if (!me) return { error: "Please log in to book a seat." };
    if (seats < 1 || seats > 4) return { error: "You can book 1 to 4 seats." };
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t) return { error: "Trip not found." };
    if (t.status !== "scheduled" || new Date(t.departure_time) <= new Date()) return { error: "This trip has already left or is not open for booking." };
    if (s.tables.bookings.some((b) => b.trip_id === t.trip_id && b.passenger_id === me.user_id && b.status === "booked")) return { error: "You already have a booking on this trip." };
    if (s.avail(t.trip_id) < seats) return { error: "FULL: Not enough free seats on this trip." };
    const id = s.newId();
    s.tables.bookings.push({ booking_id: id, passenger_id: me.user_id, trip_id: t.trip_id, nb_of_seats: seats, status: "booked", booking_time: iso(Date.now()) });
    return id;
  }

  // UC-09 The next departure on the same route (after this one and after now) with enough seats
  next_available_trip(a) {
    const s = this.#s, seats = a.p_seats == null ? 1 : a.p_seats;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t) return [];
    const after = Math.max(new Date(t.departure_time).getTime(), Date.now());
    const n = s.tables.trips
      .filter((x) => x.route_id === t.route_id && x.status === "scheduled" && new Date(x.departure_time) > after && s.avail(x.trip_id) >= seats)
      .sort(byTime("departure_time"))[0];
    return n ? [{ trip_id: n.trip_id, departure_time: n.departure_time, available_seats: s.avail(n.trip_id) }] : [];
  }

  // ---------------- 4.5 – 4.6  Passenger bookings ----------------
  get_my_bookings(a, me) {
    const s = this.#s;
    if (!me) return [];
    return s.tables.bookings.filter((b) => b.passenger_id === me.user_id).map((b) => {
      const t = s.byId("trips", "trip_id", b.trip_id);
      return { booking_id: b.booking_id, trip_id: t.trip_id, nb_of_seats: b.nb_of_seats, booking_status: b.status, booking_time: b.booking_time,
               departure_time: t.departure_time, trip_status: t.status, route_name: s.route(t.route_id).name,
               plate_number: s.bus(t.bus_id).plate_number, driver_id: t.driver_id, driver_name: s.user(t.driver_id).full_name };
    }).sort(byTime("departure_time", true));
  }

  // UC-11 Only your own booking, only before departure
  cancel_booking(a, me) {
    const s = this.#s;
    const b = s.tables.bookings.find((x) => x.booking_id === a.p_booking_id && me && x.passenger_id === me.user_id && x.status === "booked");
    if (!b) return { error: "Booking not found." };
    const t = s.byId("trips", "trip_id", b.trip_id);
    if (new Date(t.departure_time) <= new Date()) return { error: "The bus has already left, so this booking cannot be cancelled." };
    b.status = "cancelled";
    return null;
  }

  // ---------------- 4.7 – 4.13  Driver ----------------
  // My trips: anything still open, plus finished ones from the last day
  get_driver_trips(a, me) {
    const s = this.#s, dayAgo = Date.now() - 24 * 3600000;
    if (!me) return [];
    return s.tables.trips
      .filter((t) => t.driver_id === me.user_id && (OPEN.includes(t.status) || new Date(t.departure_time) > dayAgo))
      .sort(byTime("departure_time"))
      .map((t) => {
        const b = s.bus(t.bus_id);
        return { trip_id: t.trip_id, route_id: t.route_id, route_name: s.route(t.route_id).name, plate_number: b.plate_number,
                 departure_time: t.departure_time, status: t.status, seats_taken: s.seatsTaken(t.trip_id), capacity: b.capacity };
      });
  }

  get_trip_passengers(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !(s.isDriverOf(me, t) || s.isAdmin(me))) return { error: "Not your trip." };
    return s.tables.bookings.filter((b) => b.trip_id === a.p_trip_id && ["booked", "walk_on"].includes(b.status))
      .sort(byTime("booking_time"))
      .map((b) => {
        const u = b.passenger_id ? s.user(b.passenger_id) : null;
        return { passenger_id: b.passenger_id, full_name: u ? u.full_name : "Roadside passenger", phone_no: u ? u.phone_no : null,
                 nb_of_seats: b.nb_of_seats, status: b.status };
      });
  }

  // UC-14 Start: one running trip per driver, and only your own scheduled trip
  start_trip(a, me) {
    const s = this.#s;
    if (me && s.tables.trips.some((t) => t.driver_id === me.user_id && RUNNING.includes(t.status))) return { error: "You already have a running trip. End it first." };
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !s.isDriverOf(me, t) || t.status !== "scheduled") return { error: "This trip cannot be started." };
    t.status = "active";
    return null;
  }

  // UC-14 / UC-19 End: by its driver or by the admin; closes the open delay reports
  end_trip(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !RUNNING.includes(t.status) || !(s.isDriverOf(me, t) || s.isAdmin(me))) return { error: "This trip is not running." };
    t.status = "completed";
    s.tables.delay_reports.filter((d) => d.trip_id === t.trip_id).forEach((d) => { d.status = "resolved"; });
    return null;
  }

  // UC-15 Share location: only the driver of a running trip
  share_location(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !s.isDriverOf(me, t) || !RUNNING.includes(t.status)) return { error: "Trip is not running." };
    s.tables.updated_locations.push({ location_id: s.newId(), trip_id: t.trip_id, latitude: a.p_lat, longitude: a.p_lng,
                                      speed: a.p_speed == null ? null : a.p_speed, time: iso(Date.now()) });
    return null;
  }

  // UC-16 Report delay: the trip stays running, marked delayed; only the newest report is open
  report_delay(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !s.isDriverOf(me, t) || !RUNNING.includes(t.status)) return { error: "You can only report a delay on a running trip." };
    if (!(a.p_minutes > 0)) return { error: 'new row for relation "delay_reports" violates check constraint "delay_reports_delay_time_check"' };
    t.status = "delayed";
    s.tables.delay_reports.filter((d) => d.trip_id === t.trip_id && d.status === "open").forEach((d) => { d.status = "resolved"; });
    s.tables.delay_reports.push({ report_id: s.newId(), trip_id: t.trip_id, reason: a.p_reason, delay_time: a.p_minutes, status: "open", time_of_report: iso(Date.now()) });
    return null;
  }

  // Roadside pickup: a booking with no passenger, so the free seats stay correct
  record_walk_on(a, me) {
    const s = this.#s, seats = a.p_seats == null ? 1 : a.p_seats;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || !s.isDriverOf(me, t) || !RUNNING.includes(t.status)) return { error: "Start the trip first." };
    if (s.avail(t.trip_id) < seats) return { error: "The bus is full." };
    s.tables.bookings.push({ booking_id: s.newId(), passenger_id: null, trip_id: t.trip_id, nb_of_seats: seats, status: "walk_on", booking_time: iso(Date.now()) });
    return null;
  }

  // ---------------- 4.14 – 4.17  Messages and calls ----------------
  // Only between a passenger and the driver of a trip that passenger booked, while the trip is not over
  send_message(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || ["completed", "cancelled"].includes(t.status)) return { error: "This trip has ended." };
    let sender;
    if (me && me.user_id === a.p_passenger_id) sender = "passenger";
    else if (s.isDriverOf(me, t)) sender = "driver";
    else return { error: "You are not part of this conversation." };
    if (!s.hasBooking(t.trip_id, a.p_passenger_id)) return { error: "Messaging needs an active booking on this trip." };
    const content = String(a.p_content == null ? "" : a.p_content).trim();
    if (content.length < 1 || content.length > 500) return { error: 'new row for relation "messages" violates check constraint "messages_content_check"' };
    s.tables.messages.push({ message_id: s.newId(), trip_id: t.trip_id, passenger_id: a.p_passenger_id, driver_id: t.driver_id,
                             content, status: "sent", date_time: iso(Date.now()), sent_by: sender });
    return null;
  }

  // Mark the OTHER side's messages in this conversation as read
  mark_read(a, me) {
    const s = this.#s;
    if (!me) return null;
    s.tables.messages.filter((m) => m.trip_id === a.p_trip_id && m.passenger_id === a.p_passenger_id && m.status === "sent"
        && ((me.user_id === m.passenger_id && m.sent_by === "driver") || (me.user_id === m.driver_id && m.sent_by === "passenger")))
      .forEach((m) => { m.status = "read"; });
    return null;
  }

  // One row per (trip, passenger) where I am the passenger or the driver; newest activity first
  get_conversations(a, me) {
    const s = this.#s;
    if (!me) return [];
    const seen = {}, out = [];
    s.tables.bookings.filter((b) => b.status === "booked" && b.passenger_id).forEach((b) => {
      const t = s.byId("trips", "trip_id", b.trip_id);
      if (!(b.passenger_id === me.user_id || t.driver_id === me.user_id)) return;
      const k = b.trip_id + "|" + b.passenger_id;
      if (seen[k]) return;
      seen[k] = 1;
      const ms = s.tables.messages.filter((m) => m.trip_id === b.trip_id && m.passenger_id === b.passenger_id).sort(byTime("date_time"));
      const last = ms[ms.length - 1] || {};
      const iAmP = b.passenger_id === me.user_id;
      out.push({ trip_id: b.trip_id, passenger_id: b.passenger_id, other_name: iAmP ? s.user(t.driver_id).full_name : s.user(b.passenger_id).full_name,
                 route_name: s.route(t.route_id).name, departure_time: t.departure_time, last_message: last.content || null,
                 last_time: last.date_time || null, unread: ms.filter((m) => m.status === "sent" && m.sent_by === (iAmP ? "driver" : "passenger")).length });
    });
    return out.sort((x, y) => new Date(y.last_time || y.departure_time) - new Date(x.last_time || x.departure_time));
  }

  // UC-03 The other person's number – only when a booking links the two of them
  get_contact_phone(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || ["completed", "cancelled"].includes(t.status) || !me) return null;
    if (!s.hasBooking(t.trip_id, a.p_passenger_id)) return null;
    if (me.user_id === a.p_passenger_id) return s.user(t.driver_id).phone_no || null;
    if (me.user_id === t.driver_id) return (s.user(a.p_passenger_id) || {}).phone_no || null;
    return null;
  }

  // ---------------- 4.18 – 4.20  Administrator ----------------
  admin_fleet(a, me) {
    const s = this.#s;
    if (!s.isAdmin(me)) return { error: "Administrators only." };
    return s.tables.trips.filter((t) => RUNNING.includes(t.status)).sort(byTime("departure_time")).map((t) => {
      const l = s.lastLoc(t.trip_id), d = s.openDelay(t.trip_id), b = s.bus(t.bus_id), u = s.user(t.driver_id);
      return { trip_id: t.trip_id, route_name: s.route(t.route_id).name, plate_number: b.plate_number, driver_name: u.full_name,
               driver_phone: u.phone_no, status: t.status, departure_time: t.departure_time, seats_taken: s.seatsTaken(t.trip_id),
               capacity: b.capacity, latitude: l.latitude, longitude: l.longitude, last_update: l.time,
               delay_minutes: d.delay_time || null, delay_reason: d.reason || null };
    });
  }

  // Change a user's role. Making someone a driver needs a licence number.
  admin_set_role(a, me) {
    const s = this.#s;
    if (!s.isAdmin(me)) return { error: "Administrators only." };
    if (!["passenger", "driver", "admin"].includes(a.p_type)) return { error: "Unknown role." };
    const u = s.user(a.p_user_id);
    if (!u) return null;                                     // SQL: the update simply changes no row
    if (a.p_type === "driver") {
      const lic = String(a.p_license || "").trim();
      if (!lic) return { error: "A licence number is required for drivers." };
      if (s.tables.drivers.some((d) => d.license_number === lic && d.user_id !== u.user_id)) {
        return { error: 'duplicate key value violates unique constraint "drivers_license_number_key"', code: "23505" };
      }
      const row = s.byId("drivers", "user_id", u.user_id);
      if (row) row.license_number = lic; else s.tables.drivers.push({ user_id: u.user_id, license_number: lic });
    } else if (s.tables.trips.some((t) => t.driver_id === u.user_id && OPEN.includes(t.status))) {
      return { error: "This driver still has trips. Reassign or cancel them first." };
    } else if (s.byId("drivers", "user_id", u.user_id)) {
      // Like the database: past trips still point to this driver, so the driver row cannot be removed
      if (s.tables.trips.some((t) => t.driver_id === u.user_id)) {
        return { error: 'update or delete on table "drivers" violates foreign key constraint "trips_driver_id_fkey" on table "trips"', code: "23503" };
      }
      s.tables.drivers = s.tables.drivers.filter((d) => d.user_id !== u.user_id);
      s.tables.buses.forEach((b) => { if (b.owner_id === u.user_id) b.owner_id = null; });   // on delete set null
    }
    u.type = a.p_type;
    return null;
  }

  // Cancel a scheduled trip and every seat reservation on it
  admin_cancel_trip(a, me) {
    const s = this.#s;
    if (!s.isAdmin(me)) return { error: "Administrators only." };
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (!t || t.status !== "scheduled") return { error: "Only a scheduled trip can be cancelled." };
    t.status = "cancelled";
    s.tables.bookings.filter((b) => b.trip_id === t.trip_id && b.status === "booked").forEach((b) => { b.status = "cancelled"; });
    return null;
  }
}
