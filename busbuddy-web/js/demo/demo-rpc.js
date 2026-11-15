// =====================================================================
// DemoRpc – a JavaScript copy of every SQL function in supabase/schema.sql
// that the pages call with db.rpc("name", { … }).
// One method per SQL function, with the SAME name and the same columns.
// When you change a function in schema.sql, change it here too.
//
// Each method receives (args, me) where `me` is the logged-in demo user.
// It returns the data, or { error: "message" } to simulate a database error.
// Helper methods must NOT live in this class (every method is callable as an RPC);
// they belong in DemoStore.
// =====================================================================
const iso = (ms) => new Date(ms).toISOString();

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

  // ---------------- Public map + schedules ----------------
  get_live_buses() {
    const s = this.#s;
    return s.tables.trips.filter((t) => ["active", "delayed"].includes(t.status)).map((t) => {
      const l = s.lastLoc(t.trip_id), d = s.openDelay(t.trip_id);
      return { trip_id: t.trip_id, route_id: t.route_id, route_name: s.route(t.route_id).name, plate_number: s.bus(t.bus_id).plate_number, status: t.status, departure_time: t.departure_time, latitude: l.latitude, longitude: l.longitude, speed: l.speed, last_update: l.time, delay_minutes: d.delay_time || null, delay_reason: d.reason || null, available_seats: s.avail(t.trip_id) };
    });
  }

  get_upcoming_trips(a) {
    const s = this.#s;
    return s.tables.trips.filter((t) => ["scheduled", "active", "delayed"].includes(t.status) && (!a || !a.p_route_id || t.route_id === a.p_route_id)).map((t) => {
      const r = s.route(t.route_id), b = s.bus(t.bus_id);
      return { trip_id: t.trip_id, route_id: r.route_id, route_name: r.name, origin: r.origin, destination: r.destination, departure_time: t.departure_time, status: t.status, plate_number: b.plate_number, capacity: b.capacity, available_seats: s.avail(t.trip_id) };
    });
  }

  available_seats(a) {
    return this.#s.avail(a.p_trip_id);
  }

  // ---------------- Passenger bookings ----------------
  book_seat(a, me) {
    const s = this.#s;
    if (!me) return { error: "Please log in to book a seat." };
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    if (t.status !== "scheduled") return { error: "This trip has already left or is not open for booking." };
    if (s.tables.bookings.some((b) => b.trip_id === t.trip_id && b.passenger_id === me.user_id && b.status === "booked")) return { error: "You already have a booking on this trip." };
    if (s.avail(t.trip_id) < (a.p_seats || 1)) return { error: "FULL: Not enough free seats on this trip." };
    const id = s.newId();
    s.tables.bookings.push({ booking_id: id, passenger_id: me.user_id, trip_id: t.trip_id, nb_of_seats: a.p_seats || 1, status: "booked", booking_time: iso(Date.now()) });
    return id;
  }

  next_available_trip(a) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    const n = s.tables.trips.filter((x) => x.route_id === t.route_id && x.status === "scheduled" && x.departure_time > t.departure_time && s.avail(x.trip_id) >= (a.p_seats || 1))[0];
    return n ? [{ trip_id: n.trip_id, departure_time: n.departure_time, available_seats: s.avail(n.trip_id) }] : [];
  }

  get_my_bookings(a, me) {
    const s = this.#s;
    return s.tables.bookings.filter((b) => me && b.passenger_id === me.user_id).map((b) => {
      const t = s.byId("trips", "trip_id", b.trip_id);
      return { booking_id: b.booking_id, trip_id: t.trip_id, nb_of_seats: b.nb_of_seats, booking_status: b.status, booking_time: b.booking_time, departure_time: t.departure_time, trip_status: t.status, route_name: s.route(t.route_id).name, plate_number: s.bus(t.bus_id).plate_number, driver_id: t.driver_id, driver_name: s.user(t.driver_id).full_name };
    });
  }

  cancel_booking(a) {
    const s = this.#s;
    const b = s.byId("bookings", "booking_id", a.p_booking_id);
    const t = s.byId("trips", "trip_id", b.trip_id);
    if (new Date(t.departure_time) <= new Date()) return { error: "The bus has already left, so this booking cannot be cancelled." };
    b.status = "cancelled";
    return null;
  }

  // ---------------- Driver ----------------
  get_driver_trips(a, me) {
    const s = this.#s;
    return s.tables.trips.filter((t) => me && t.driver_id === me.user_id).map((t) => {
      const b = s.bus(t.bus_id);
      return { trip_id: t.trip_id, route_id: t.route_id, route_name: s.route(t.route_id).name, plate_number: b.plate_number, departure_time: t.departure_time, status: t.status, seats_taken: s.seatsTaken(t.trip_id), capacity: b.capacity };
    });
  }

  get_trip_passengers(a) {
    const s = this.#s;
    return s.tables.bookings.filter((b) => b.trip_id === a.p_trip_id && ["booked", "walk_on"].includes(b.status)).map((b) => {
      const u = b.passenger_id ? s.user(b.passenger_id) : null;
      return { passenger_id: b.passenger_id, full_name: u ? u.full_name : "Roadside passenger", phone_no: u ? u.phone_no : null, nb_of_seats: b.nb_of_seats, status: b.status };
    });
  }

  start_trip(a, me) {
    const s = this.#s;
    if (s.tables.trips.some((t) => t.driver_id === me.user_id && ["active", "delayed"].includes(t.status))) return { error: "You already have a running trip. End it first." };
    s.byId("trips", "trip_id", a.p_trip_id).status = "active";
    return null;
  }

  end_trip(a) {
    this.#s.byId("trips", "trip_id", a.p_trip_id).status = "completed";
    return null;
  }

  share_location(a) {
    const s = this.#s;
    s.tables.updated_locations.push({ location_id: s.newId(), trip_id: a.p_trip_id, latitude: a.p_lat, longitude: a.p_lng, speed: a.p_speed, time: iso(Date.now()) });
    return null;
  }

  report_delay(a) {
    const s = this.#s;
    s.byId("trips", "trip_id", a.p_trip_id).status = "delayed";
    s.tables.delay_reports.push({ report_id: s.newId(), trip_id: a.p_trip_id, reason: a.p_reason, delay_time: a.p_minutes, status: "open", time_of_report: iso(Date.now()) });
    return null;
  }

  record_walk_on(a) {
    const s = this.#s;
    if (s.avail(a.p_trip_id) < (a.p_seats || 1)) return { error: "The bus is full." };
    s.tables.bookings.push({ booking_id: s.newId(), passenger_id: null, trip_id: a.p_trip_id, nb_of_seats: a.p_seats || 1, status: "walk_on", booking_time: iso(Date.now()) });
    return null;
  }

  // ---------------- Messages and calls ----------------
  send_message(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    s.tables.messages.push({ message_id: s.newId(), trip_id: a.p_trip_id, passenger_id: a.p_passenger_id, driver_id: t.driver_id, content: a.p_content, status: "sent", date_time: iso(Date.now()), sent_by: me.type === "driver" ? "driver" : "passenger" });
    return null;
  }

  mark_read() {
    return null;
  }

  get_conversations(a, me) {
    const s = this.#s;
    const seen = {}; const out = [];
    s.tables.bookings.filter((b) => b.status === "booked" && b.passenger_id).forEach((b) => {
      const t = s.byId("trips", "trip_id", b.trip_id); if (!(b.passenger_id === me.user_id || t.driver_id === me.user_id)) return;
      const k = b.trip_id + "|" + b.passenger_id; if (seen[k]) return; seen[k] = 1;
      const ms = s.tables.messages.filter((m) => m.trip_id === b.trip_id && m.passenger_id === b.passenger_id); const last = ms.slice(-1)[0] || {};
      const iAmP = b.passenger_id === me.user_id;
      out.push({ trip_id: b.trip_id, passenger_id: b.passenger_id, other_name: iAmP ? s.user(t.driver_id).full_name : s.user(b.passenger_id).full_name, route_name: s.route(t.route_id).name, departure_time: t.departure_time, last_message: last.content || null, last_time: last.date_time || null, unread: ms.filter((m) => m.status === "sent" && m.sent_by === (iAmP ? "driver" : "passenger")).length });
    });
    return out;
  }

  get_contact_phone(a, me) {
    const s = this.#s;
    const t = s.byId("trips", "trip_id", a.p_trip_id);
    return me.user_id === a.p_passenger_id ? s.user(t.driver_id).phone_no : s.user(a.p_passenger_id).phone_no;
  }

  // ---------------- Administrator ----------------
  admin_fleet() {
    const s = this.#s;
    return s.tables.trips.filter((t) => ["active", "delayed"].includes(t.status)).map((t) => {
      const l = s.lastLoc(t.trip_id), d = s.openDelay(t.trip_id), b = s.bus(t.bus_id), u = s.user(t.driver_id);
      return { trip_id: t.trip_id, route_name: s.route(t.route_id).name, plate_number: b.plate_number, driver_name: u.full_name, driver_phone: u.phone_no, status: t.status, departure_time: t.departure_time, seats_taken: s.seatsTaken(t.trip_id), capacity: b.capacity, latitude: l.latitude, longitude: l.longitude, last_update: l.time, delay_minutes: d.delay_time || null, delay_reason: d.reason || null };
    });
  }

  admin_set_role(a) {
    const s = this.#s;
    const u = s.user(a.p_user_id); u.type = a.p_type;
    if (a.p_type === "driver" && !s.byId("drivers", "user_id", u.user_id)) s.tables.drivers.push({ user_id: u.user_id, license_number: a.p_license });
    return null;
  }

  admin_cancel_trip(a) {
    this.#s.byId("trips", "trip_id", a.p_trip_id).status = "cancelled";
    return null;
  }
}
