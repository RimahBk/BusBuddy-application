// =====================================================================
// BusBuddy DEMO MODE – sample data that lets every page work OFFLINE,
// without Supabase or Vercel. Used only when DEMO_MODE is true in js/config.js.
// It copies the calls the pages make to Supabase (tables + database functions)
// and answers them from the sample data below, saved in this browser.
// Demo accounts (any password works):
//   rami@busbuddy.test   – passenger      driver@busbuddy.test – driver
//   admin@busbuddy.test  – administrator
// =====================================================================
(function () {
  if (!window.BB_CONFIG || !window.BB_CONFIG.DEMO_MODE) return;   // real mode: do nothing
  const STORE = "bb_demo_db";
  const now = Date.now(), min = 60000;
  const iso = (ms) => new Date(ms).toISOString();
  const U = {
    admin: { user_id: "a-1", full_name: "Maya Admin", email: "admin@busbuddy.test", phone_no: "+96170000001", type: "admin" },
    driver: { user_id: "d-1", full_name: "Hadi Khoury", email: "driver@busbuddy.test", phone_no: "+96170111222", type: "driver" },
    driver2: { user_id: "d-2", full_name: "Sami Haddad", email: "driver2@busbuddy.test", phone_no: "+96170333444", type: "driver" },
    passenger: { user_id: "p-1", full_name: "Rami Nassar", email: "rami@busbuddy.test", phone_no: "+96171000001", type: "passenger" },
    passenger2: { user_id: "p-2", full_name: "Lea Saab", email: "lea@busbuddy.test", phone_no: "+96171000002", type: "passenger" }
  };
  const fixtures = () => ({
    users: Object.values(U),
    drivers: [{ user_id: "d-1", license_number: "LB-55821" }, { user_id: "d-2", license_number: "LB-60277" }],
    buses: [{ bus_id: 1, plate_number: "G 123456", capacity: 24, owner_id: "d-1" }, { bus_id: 2, plate_number: "M 654321", capacity: 14, owner_id: "d-2" }],
    routes: [{ route_id: 1, name: "Chouf – LIU Cola", origin: "Beiteddine", destination: "LIU Cola" }],
    stops: [
      { stop_id: 1, route_id: 1, address: "Beiteddine", latitude: 33.6953, longitude: 35.5786, stop_order: 1, minutes_from_start: 0 },
      { stop_id: 2, route_id: 1, address: "Deir el Qamar", latitude: 33.6967, longitude: 35.5617, stop_order: 2, minutes_from_start: 8 },
      { stop_id: 3, route_id: 1, address: "Damour", latitude: 33.7303, longitude: 35.4553, stop_order: 3, minutes_from_start: 30 },
      { stop_id: 4, route_id: 1, address: "Khaldeh", latitude: 33.7795, longitude: 35.4810, stop_order: 4, minutes_from_start: 42 },
      { stop_id: 5, route_id: 1, address: "LIU Cola", latitude: 33.8770, longitude: 35.4930, stop_order: 5, minutes_from_start: 60 }
    ],
    trips: [
      { trip_id: 1, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now - 25 * min), status: "active" },
      { trip_id: 2, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now - 40 * min), status: "delayed" },
      { trip_id: 3, route_id: 1, bus_id: 1, driver_id: "d-1", departure_time: iso(now + 180 * min), status: "scheduled" },
      { trip_id: 4, route_id: 1, bus_id: 2, driver_id: "d-2", departure_time: iso(now + 300 * min), status: "scheduled" }
    ],
    bookings: [
      { booking_id: 1, passenger_id: "p-1", trip_id: 3, nb_of_seats: 2, status: "booked", booking_time: iso(now - 600 * min) },
      { booking_id: 2, passenger_id: "p-2", trip_id: 3, nb_of_seats: 1, status: "booked", booking_time: iso(now - 500 * min) },
      { booking_id: 3, passenger_id: "p-1", trip_id: 1, nb_of_seats: 1, status: "booked", booking_time: iso(now - 900 * min) },
      { booking_id: 4, passenger_id: null, trip_id: 1, nb_of_seats: 2, status: "walk_on", booking_time: iso(now - 10 * min) }
    ],
    messages: [
      { message_id: 1, trip_id: 1, passenger_id: "p-1", driver_id: "d-1", content: "Hi, I'm waiting at Damour by the pharmacy.", status: "read", date_time: iso(now - 12 * min), sent_by: "passenger" },
      { message_id: 2, trip_id: 1, passenger_id: "p-1", driver_id: "d-1", content: "OK, I'll be there in about 5 minutes.", status: "sent", date_time: iso(now - 10 * min), sent_by: "driver" }
    ],
    delay_reports: [{ report_id: 1, trip_id: 2, reason: "Traffic", delay_time: 15, status: "open", time_of_report: iso(now - 8 * min) }],
    updated_locations: [
      { location_id: 1, trip_id: 1, latitude: 33.722, longitude: 35.470, time: iso(now - 20000), speed: 42 },
      { location_id: 2, trip_id: 2, latitude: 33.790, longitude: 35.484, time: iso(now - 5 * min), speed: 0 }
    ]
  });
  // Load the saved demo data (so a booking made on one page is still there on the next page)
  let T, nextId = 100;
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      // keep saved data for 6 hours, then start fresh so the trip times stay realistic
      if (s && s.T && Date.now() - s.savedAt < 6 * 3600000) { T = s.T; nextId = s.nextId; load.savedAt = s.savedAt; return; }
    } catch (e) {}
    T = fixtures(); nextId = 100; load.savedAt = Date.now();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ T, nextId, savedAt: load.savedAt })); } catch (e) {} }
  load();
  const pk = { users: "user_id", drivers: "user_id", buses: "bus_id", routes: "route_id", stops: "stop_id", trips: "trip_id", bookings: "booking_id", messages: "message_id", delay_reports: "report_id", updated_locations: "location_id" };
  const byId = (tbl, k, v) => T[tbl].find((r) => r[k] === v);
  const route = (id) => byId("routes", "route_id", id), bus = (id) => byId("buses", "bus_id", id), user = (id) => byId("users", "user_id", id);
  const seatsTaken = (tid) => T.bookings.filter((b) => b.trip_id === tid && ["booked", "walk_on"].includes(b.status)).reduce((s, b) => s + b.nb_of_seats, 0);
  const avail = (tid) => { const t = byId("trips", "trip_id", tid); return bus(t.bus_id).capacity - seatsTaken(tid); };
  const lastLoc = (tid) => T.updated_locations.filter((l) => l.trip_id === tid).slice(-1)[0] || {};
  const openDelay = (tid) => T.delay_reports.filter((d) => d.trip_id === tid && d.status === "open").slice(-1)[0] || {};

  function sessionUser() { try { const id = localStorage.getItem("mock_user"); return id ? user(id) : null; } catch (e) { return null; } }
  const ok = (data) => Promise.resolve({ data, error: null });
  const fail = (message) => Promise.resolve({ data: null, error: { message } });

  const RPC = {
    get_live_buses: () => T.trips.filter((t) => ["active", "delayed"].includes(t.status)).map((t) => {
      const l = lastLoc(t.trip_id), d = openDelay(t.trip_id);
      return { trip_id: t.trip_id, route_id: t.route_id, route_name: route(t.route_id).name, plate_number: bus(t.bus_id).plate_number, status: t.status, departure_time: t.departure_time, latitude: l.latitude, longitude: l.longitude, speed: l.speed, last_update: l.time, delay_minutes: d.delay_time || null, delay_reason: d.reason || null, available_seats: avail(t.trip_id) };
    }),
    get_upcoming_trips: (a) => T.trips.filter((t) => ["scheduled", "active", "delayed"].includes(t.status) && (!a || !a.p_route_id || t.route_id === a.p_route_id)).map((t) => { const r = route(t.route_id), b = bus(t.bus_id); return { trip_id: t.trip_id, route_id: r.route_id, route_name: r.name, origin: r.origin, destination: r.destination, departure_time: t.departure_time, status: t.status, plate_number: b.plate_number, capacity: b.capacity, available_seats: avail(t.trip_id) }; }),
    book_seat: (a, me) => {
      if (!me) return { error: "Please log in to book a seat." };
      const t = byId("trips", "trip_id", a.p_trip_id);
      if (t.status !== "scheduled") return { error: "This trip has already left or is not open for booking." };
      if (T.bookings.some((b) => b.trip_id === t.trip_id && b.passenger_id === me.user_id && b.status === "booked")) return { error: "You already have a booking on this trip." };
      if (avail(t.trip_id) < (a.p_seats || 1)) return { error: "FULL: Not enough free seats on this trip." };
      const id = nextId++; T.bookings.push({ booking_id: id, passenger_id: me.user_id, trip_id: t.trip_id, nb_of_seats: a.p_seats || 1, status: "booked", booking_time: iso(Date.now()) }); return id;
    },
    next_available_trip: (a) => { const t = byId("trips", "trip_id", a.p_trip_id); const n = T.trips.filter((x) => x.route_id === t.route_id && x.status === "scheduled" && x.departure_time > t.departure_time && avail(x.trip_id) >= (a.p_seats || 1))[0]; return n ? [{ trip_id: n.trip_id, departure_time: n.departure_time, available_seats: avail(n.trip_id) }] : []; },
    get_my_bookings: (a, me) => T.bookings.filter((b) => me && b.passenger_id === me.user_id).map((b) => { const t = byId("trips", "trip_id", b.trip_id); return { booking_id: b.booking_id, trip_id: t.trip_id, nb_of_seats: b.nb_of_seats, booking_status: b.status, booking_time: b.booking_time, departure_time: t.departure_time, trip_status: t.status, route_name: route(t.route_id).name, plate_number: bus(t.bus_id).plate_number, driver_id: t.driver_id, driver_name: user(t.driver_id).full_name }; }),
    cancel_booking: (a) => { const b = byId("bookings", "booking_id", a.p_booking_id); const t = byId("trips", "trip_id", b.trip_id); if (new Date(t.departure_time) <= new Date()) return { error: "The bus has already left, so this booking cannot be cancelled." }; b.status = "cancelled"; return null; },
    get_driver_trips: (a, me) => T.trips.filter((t) => me && t.driver_id === me.user_id).map((t) => { const b = bus(t.bus_id); return { trip_id: t.trip_id, route_id: t.route_id, route_name: route(t.route_id).name, plate_number: b.plate_number, departure_time: t.departure_time, status: t.status, seats_taken: seatsTaken(t.trip_id), capacity: b.capacity }; }),
    get_trip_passengers: (a) => T.bookings.filter((b) => b.trip_id === a.p_trip_id && ["booked", "walk_on"].includes(b.status)).map((b) => { const u = b.passenger_id ? user(b.passenger_id) : null; return { passenger_id: b.passenger_id, full_name: u ? u.full_name : "Roadside passenger", phone_no: u ? u.phone_no : null, nb_of_seats: b.nb_of_seats, status: b.status }; }),
    start_trip: (a, me) => { if (T.trips.some((t) => t.driver_id === me.user_id && ["active", "delayed"].includes(t.status))) return { error: "You already have a running trip. End it first." }; byId("trips", "trip_id", a.p_trip_id).status = "active"; return null; },
    end_trip: (a) => { byId("trips", "trip_id", a.p_trip_id).status = "completed"; return null; },
    share_location: (a) => { T.updated_locations.push({ location_id: nextId++, trip_id: a.p_trip_id, latitude: a.p_lat, longitude: a.p_lng, speed: a.p_speed, time: iso(Date.now()) }); return null; },
    report_delay: (a) => { byId("trips", "trip_id", a.p_trip_id).status = "delayed"; T.delay_reports.push({ report_id: nextId++, trip_id: a.p_trip_id, reason: a.p_reason, delay_time: a.p_minutes, status: "open", time_of_report: iso(Date.now()) }); return null; },
    record_walk_on: (a) => { if (avail(a.p_trip_id) < (a.p_seats || 1)) return { error: "The bus is full." }; T.bookings.push({ booking_id: nextId++, passenger_id: null, trip_id: a.p_trip_id, nb_of_seats: a.p_seats || 1, status: "walk_on", booking_time: iso(Date.now()) }); return null; },
    send_message: (a, me) => { const t = byId("trips", "trip_id", a.p_trip_id); T.messages.push({ message_id: nextId++, trip_id: a.p_trip_id, passenger_id: a.p_passenger_id, driver_id: t.driver_id, content: a.p_content, status: "sent", date_time: iso(Date.now()), sent_by: me.type === "driver" ? "driver" : "passenger" }); return null; },
    mark_read: () => null,
    get_conversations: (a, me) => {
      const seen = {}; const out = [];
      T.bookings.filter((b) => b.status === "booked" && b.passenger_id).forEach((b) => {
        const t = byId("trips", "trip_id", b.trip_id); if (!(b.passenger_id === me.user_id || t.driver_id === me.user_id)) return;
        const k = b.trip_id + "|" + b.passenger_id; if (seen[k]) return; seen[k] = 1;
        const ms = T.messages.filter((m) => m.trip_id === b.trip_id && m.passenger_id === b.passenger_id); const last = ms.slice(-1)[0] || {};
        const iAmP = b.passenger_id === me.user_id;
        out.push({ trip_id: b.trip_id, passenger_id: b.passenger_id, other_name: iAmP ? user(t.driver_id).full_name : user(b.passenger_id).full_name, route_name: route(t.route_id).name, departure_time: t.departure_time, last_message: last.content || null, last_time: last.date_time || null, unread: ms.filter((m) => m.status === "sent" && m.sent_by === (iAmP ? "driver" : "passenger")).length });
      }); return out;
    },
    get_contact_phone: (a, me) => { const t = byId("trips", "trip_id", a.p_trip_id); return me.user_id === a.p_passenger_id ? user(t.driver_id).phone_no : user(a.p_passenger_id).phone_no; },
    admin_fleet: () => T.trips.filter((t) => ["active", "delayed"].includes(t.status)).map((t) => { const l = lastLoc(t.trip_id), d = openDelay(t.trip_id), b = bus(t.bus_id), u = user(t.driver_id); return { trip_id: t.trip_id, route_name: route(t.route_id).name, plate_number: b.plate_number, driver_name: u.full_name, driver_phone: u.phone_no, status: t.status, departure_time: t.departure_time, seats_taken: seatsTaken(t.trip_id), capacity: b.capacity, latitude: l.latitude, longitude: l.longitude, last_update: l.time, delay_minutes: d.delay_time || null, delay_reason: d.reason || null }; }),
    admin_set_role: (a) => { const u = user(a.p_user_id); u.type = a.p_type; if (a.p_type === "driver" && !byId("drivers", "user_id", u.user_id)) T.drivers.push({ user_id: u.user_id, license_number: a.p_license }); return null; },
    admin_cancel_trip: (a) => { byId("trips", "trip_id", a.p_trip_id).status = "cancelled"; return null; },
    available_seats: (a) => avail(a.p_trip_id)
  };

  class Query {
    constructor(table) { this.t = table; this.filters = []; this.op = "select"; this.orders = []; }
    select() { if (this.op === "select") this.op = "select"; this.wantRows = true; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
    lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
    order(c, o) { this.orders.push([c, !(o && o.ascending === false)]); return this; }
    limit(n) { this.lim = n; return this; }
    insert(v) { this.op = "insert"; this.val = Array.isArray(v) ? v : [v]; return this; }
    update(v) { this.op = "update"; this.val = v; return this; }
    delete() { this.op = "delete"; return this; }
    upsert(v) { return this.insert(v); }
    maybeSingle() { this.one = "maybe"; return this; }
    single() { this.one = "single"; return this; }
    run() {
      const rows = T[this.t]; if (!rows) return { data: null, error: { message: "table " + this.t + " not found" } };
      if (this.op === "insert") {
        const added = this.val.map((v) => { const r = { ...v }; if (r[pk[this.t]] == null) r[pk[this.t]] = nextId++; if (this.t === "trips" && !r.status) r.status = "scheduled"; rows.push(r); return r; });
        return { data: this.one ? added[0] : added, error: null };
      }
      let out = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "update") { out.forEach((r) => Object.assign(r, this.val)); return { data: out, error: null }; }
      if (this.op === "delete") { T[this.t] = rows.filter((r) => !out.includes(r)); return { data: out, error: null }; }
      this.orders.forEach(([c, asc]) => out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
      if (this.lim) out = out.slice(0, this.lim);
      out = out.map((r) => ({ ...r }));
      if (this.one) return { data: out[0] || null, error: this.one === "single" && !out[0] ? { message: "No rows" } : null };
      return { data: out, error: null };
    }
    then(res, rej) { return new Promise((r) => setTimeout(() => { const out = this.run(); if (this.op !== "select") save(); r(out); }, 30)).then(res, rej); }
  }

  window.BBDemo = {
    // Start again from the original sample data (used by the "Reset demo" link)
    reset: () => { try { localStorage.removeItem(STORE); localStorage.removeItem("mock_user"); } catch (e) {} },
    createClient: () => ({
      from: (t) => new Query(t),
      rpc: (name, args) => {
        const fn = RPC[name]; if (!fn) return fail("Unknown function " + name);
        const me = sessionUser();
        const out = fn(args || {}, me);
        save();
        if (out && out.error) return fail(out.error);
        return new Promise((r) => setTimeout(() => r({ data: out, error: null }), 30));
      },
      auth: {
        getSession: () => { const u = sessionUser(); return ok({ session: u ? { user: { id: u.user_id, email: u.email }, access_token: "mock-token" } : null }); },
        getUser: () => { const u = sessionUser(); return ok({ user: u ? { id: u.user_id, email: u.email } : null }); },
        signInWithPassword: ({ email }) => { const u = T.users.find((x) => x.email === email); if (!u) return fail("Invalid login credentials"); localStorage.setItem("mock_user", u.user_id); return ok({ user: { id: u.user_id, email }, session: { access_token: "mock-token" } }); },
        signUp: ({ email, options }) => { if (T.users.some((x) => x.email === email)) return fail("User already registered"); const id = "p-" + nextId++; const d = (options && options.data) || {}; T.users.push({ user_id: id, full_name: d.full_name || email, email, phone_no: d.phone_no || null, type: "passenger" }); save(); localStorage.setItem("mock_user", id); return ok({ user: { id, email }, session: { access_token: "mock-token" } }); },
        signOut: () => { localStorage.removeItem("mock_user"); return ok({}); },
        resetPasswordForEmail: () => ok({}),
        updateUser: () => ok({ user: {} }),
        onAuthStateChange: (cb) => { setTimeout(() => cb("PASSWORD_RECOVERY", null), 50); return { data: { subscription: { unsubscribe() {} } } }; }
      }
    })
  };
})();
