// =====================================================================
// SupabaseBackend – every data function the pages need, written with the
// supabase-js calls of the real database (supabase/schema.sql).
//
// Pages never call this class directly: they use BB.api (see api.js), so the
// same page works online and in demo mode.
//
// The contract (the same for the demo backend):
//   - every function is async and returns plain objects whose field names are
//     the column names of schema.sql (snake_case);
//   - on failure it THROWS new Error(message) with the database's own message
//     (e.g. "FULL: Not enough free seats on this trip."), so a page can simply
//     show err.message (BB.errText(err) removes the "FULL:" prefix).
//
// `client` is a supabase-js client (window.supabase.createClient(...)).
// The demo backend passes its offline stand-in, which answers the same calls.
// =====================================================================
const RUNNING_OR_SCHEDULED = ["scheduled", "active", "delayed"];

export class SupabaseBackend {
  constructor(client) {
    this.client = client;
  }

  // ---------------------------------------------------------------
  // 0. Small helpers: turn { data, error } into "return data / throw Error"
  // ---------------------------------------------------------------
  static #toError(error, friendly) {
    const e = new Error(friendly || error.message || String(error));
    if (error.code) e.code = error.code;          // e.g. "23505" (duplicate), kept for anyone who needs it
    return e;
  }

  async #run(query) {
    const { data, error } = await query;
    if (error) throw SupabaseBackend.#toError(error);
    return data;
  }

  #rpc(name, args) {
    return this.#run(this.client.rpc(name, args));
  }

  // Admin changes to tables: say what went wrong in words the admin understands
  // (unique keys, foreign keys and checks of schema.sql)
  async #adminWrite(query, what) {
    const { data, error } = await query;
    if (!error) return data;
    const m = error.message || "", c = error.code;
    let text = null;
    if (c === "23505" || /duplicate key/i.test(m)) {
      if (/owner/i.test(m)) text = "This driver already owns a bus.";
      else if (what === "bus") text = "A bus with this plate already exists.";
      else if (what === "stop") text = "Another stop on this route already has this order number.";
      else text = "This value already exists.";
    } else if (c === "23503" || /foreign key/i.test(m)) {
      if (what === "bus") text = "This bus is used by trips. Cancel or reassign them first.";
      else if (what === "route") text = "This route is used by trips. Cancel them first.";
      else text = "This item is still used elsewhere.";
    } else if (c === "23514" || /check constraint/i.test(m)) {
      text = "A value is outside the allowed range.";
    } else if (c === "42501" || /row-level security/i.test(m)) {
      text = "Administrators only.";
    }
    throw SupabaseBackend.#toError(error, text);
  }

  // ---------------------------------------------------------------
  // 1. Accounts (Supabase Auth + the public.users row)
  // ---------------------------------------------------------------

  // Register a PASSENGER. The database trigger creates the users row from full_name and phone_no.
  // Returns { user_id, email, needs_confirmation } (true when Supabase sends a confirmation email first).
  async signUp({ full_name, email, phone_no, password }) {
    const { data, error } = await this.client.auth.signUp({
      email, password,
      options: { data: { full_name, phone_no }, emailRedirectTo: new URL("login.html", location.href).href }
    });
    if (error) throw SupabaseBackend.#toError(error);
    // With email confirmation on, Supabase hides an existing email by returning a user with no identities
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error("User already registered");
    }
    return { user_id: data.user && data.user.id, email, needs_confirmation: !data.session };
  }

  // Log in, then read the users row (it holds the type: passenger / driver / admin)
  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw SupabaseBackend.#toError(error);
    const profile = await this.#profile(data.user.id, data.user.email);
    if (!profile) {
      await this.client.auth.signOut();
      throw new Error("Your account has no BusBuddy profile yet. Contact the administrator.");
    }
    return profile;
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  // The logged-in user, or null for a guest.
  // `id` is the same as `user_id` (older page code uses user.id).
  async getCurrentUser() {
    const { data } = await this.client.auth.getSession();
    const session = data && data.session;
    if (!session) return null;
    return this.#profile(session.user.id, session.user.email);
  }

  async #profile(userId, email) {
    const { data: row, error } = await this.client.from("users")
      .select("user_id, full_name, email, phone_no, type").eq("user_id", userId).maybeSingle();
    if (error) throw SupabaseBackend.#toError(error);
    return row ? { id: row.user_id, ...row, email: row.email || email } : null;
  }

  // Email a "reset your password" link that opens reset-password.html
  async requestPasswordReset(email) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("reset-password.html", location.href).href
    });
    if (error) throw SupabaseBackend.#toError(error);
  }

  // On reset-password.html: did the email link give us a recovery session?
  // Resolves true as soon as it is known, false after `waitMs` without one.
  checkRecoveryLink(waitMs = 8000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      this.client.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") finish(true); });
      this.client.auth.getSession().then(({ data }) => { if (data && data.session) finish(true); });
      setTimeout(() => finish(false), waitMs);
    });
  }

  async updatePassword(password) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw SupabaseBackend.#toError(error);
  }

  // ---------------------------------------------------------------
  // 2. Public data: routes, stops, buses, live map, schedules
  // ---------------------------------------------------------------
  getRoutes() {
    return this.#run(this.client.from("routes").select("*").order("route_id"));
  }

  // Stops of one route in order, or of every route when route_id is left out
  getStops(route_id) {
    let q = this.client.from("stops").select("*");
    if (route_id != null) q = q.eq("route_id", route_id);
    return this.#run(q.order("route_id").order("stop_order"));
  }

  getBuses() {
    return this.#run(this.client.from("buses").select("*").order("plate_number"));
  }

  // 4.1 every running trip with its latest position and open delay
  async getLiveBuses() {
    return (await this.#rpc("get_live_buses")) || [];
  }

  // 4.2 upcoming trips with free seats (all routes when route_id is left out)
  async getUpcomingTrips(route_id) {
    return (await this.#rpc("get_upcoming_trips", route_id != null ? { p_route_id: route_id } : {})) || [];
  }

  // ---------------------------------------------------------------
  // 3. Passenger: book, next trip, my bookings, cancel
  // ---------------------------------------------------------------
  bookSeat(trip_id, seats) {
    return this.#rpc("book_seat", { p_trip_id: trip_id, p_seats: seats });
  }

  async nextAvailableTrip(trip_id, seats) {
    const rows = await this.#rpc("next_available_trip", { p_trip_id: trip_id, p_seats: seats });
    return (rows && rows[0]) || null;
  }

  async getMyBookings() {
    return (await this.#rpc("get_my_bookings")) || [];
  }

  async cancelBooking(booking_id) {
    await this.#rpc("cancel_booking", { p_booking_id: booking_id });
  }

  // ---------------------------------------------------------------
  // 4. Driver
  // ---------------------------------------------------------------
  async getDriverTrips() {
    return (await this.#rpc("get_driver_trips")) || [];
  }

  async getTripPassengers(trip_id) {
    return (await this.#rpc("get_trip_passengers", { p_trip_id: trip_id })) || [];
  }

  async startTrip(trip_id) { await this.#rpc("start_trip", { p_trip_id: trip_id }); }
  async endTrip(trip_id) { await this.#rpc("end_trip", { p_trip_id: trip_id }); }

  async shareLocation(trip_id, lat, lng, speed) {
    await this.#rpc("share_location", { p_trip_id: trip_id, p_lat: lat, p_lng: lng, p_speed: speed == null ? null : speed });
  }

  async reportDelay(trip_id, reason, minutes) {
    await this.#rpc("report_delay", { p_trip_id: trip_id, p_reason: reason, p_minutes: minutes });
  }

  async recordWalkOn(trip_id, seats = 1) {
    await this.#rpc("record_walk_on", { p_trip_id: trip_id, p_seats: seats });
  }

  // ---------------------------------------------------------------
  // 5. Messages and calls
  // ---------------------------------------------------------------
  async getConversations() {
    return (await this.#rpc("get_conversations")) || [];
  }

  // One conversation = one trip + one passenger, oldest message first
  getMessages(trip_id, passenger_id) {
    return this.#run(this.client.from("messages").select("*")
      .eq("trip_id", trip_id).eq("passenger_id", passenger_id).order("date_time"));
  }

  async sendMessage(trip_id, passenger_id, content) {
    await this.#rpc("send_message", { p_trip_id: trip_id, p_passenger_id: passenger_id, p_content: content });
  }

  async markRead(trip_id, passenger_id) {
    await this.#rpc("mark_read", { p_trip_id: trip_id, p_passenger_id: passenger_id });
  }

  // The other person's phone number, or null when no booking links the two of you
  async getContactPhone(trip_id, passenger_id) {
    return (await this.#rpc("get_contact_phone", { p_trip_id: trip_id, p_passenger_id: passenger_id })) || null;
  }

  // ---------------------------------------------------------------
  // 6. Administrator
  // ---------------------------------------------------------------
  async adminFleet() {
    return (await this.#rpc("admin_fleet")) || [];
  }

  // Every account, with license_number filled in for drivers
  async adminListUsers() {
    const [users, drivers] = await Promise.all([
      this.#run(this.client.from("users").select("*").order("full_name")),
      this.#run(this.client.from("drivers").select("*"))
    ]);
    const lic = {};
    (drivers || []).forEach((d) => { lic[d.user_id] = d.license_number; });
    return (users || []).map((u) => ({ ...u, license_number: lic[u.user_id] || null }));
  }

  async adminSetRole(user_id, type, license) {
    await this.#rpc("admin_set_role", { p_user_id: user_id, p_type: type, p_license: type === "driver" ? license : null });
  }

  // Buses: a bus WITH bus_id is updated, one without is added
  async adminSaveBus({ bus_id, plate_number, capacity, owner_id }) {
    const row = { plate_number, capacity, owner_id: owner_id || null };
    if (bus_id) await this.#adminWrite(this.client.from("buses").update(row).eq("bus_id", bus_id), "bus");
    else await this.#adminWrite(this.client.from("buses").insert(row), "bus");
  }
  async adminDeleteBus(bus_id) {
    await this.#adminWrite(this.client.from("buses").delete().eq("bus_id", bus_id), "bus");
  }

  // Routes: returns the saved route (with its route_id)
  async adminSaveRoute({ route_id, name, origin, destination, path }) {
    const row = { name, origin, destination };
    if (path !== undefined) row.path = path;
    const q = route_id ? this.client.from("routes").update(row).eq("route_id", route_id).select().single()
                       : this.client.from("routes").insert(row).select().single();
    return this.#adminWrite(q, "route");
  }
  async adminDeleteRoute(route_id) {            // its stops are deleted with it (on delete cascade)
    await this.#adminWrite(this.client.from("routes").delete().eq("route_id", route_id), "route");
  }

  // Stops: a stop WITH stop_id is updated, one without is added
  async adminSaveStop({ stop_id, route_id, address, latitude, longitude, stop_order, minutes_from_start }) {
    const row = { route_id, address, latitude, longitude, stop_order, minutes_from_start };
    if (stop_id) await this.#adminWrite(this.client.from("stops").update(row).eq("stop_id", stop_id), "stop");
    else await this.#adminWrite(this.client.from("stops").insert(row), "stop");
  }
  async adminDeleteStop(stop_id) {
    await this.#adminWrite(this.client.from("stops").delete().eq("stop_id", stop_id), "stop");
  }

  // Trips: scheduled, running and (for the table) everything not finished
  adminListTrips() {
    return this.#run(this.client.from("trips").select("*").in("status", RUNNING_OR_SCHEDULED).order("departure_time"));
  }
  async adminCreateTrip({ route_id, bus_id, driver_id, departure_time }) {
    const row = await this.#adminWrite(this.client.from("trips")
      .insert({ route_id, bus_id, driver_id, departure_time }).select().single(), "trip");   // status defaults to "scheduled"
    return row.trip_id;
  }
  async adminCancelTrip(trip_id) {
    await this.#rpc("admin_cancel_trip", { p_trip_id: trip_id });
  }

  // ---------------------------------------------------------------
  // 7. Admin actions that need the secret key → Vercel function api/admin.js
  // ---------------------------------------------------------------
  async #adminServer(body) {
    const { data } = await this.client.auth.getSession();
    const token = data && data.session ? data.session.access_token : "";
    let res, json;
    try {
      res = await fetch("api/admin", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body) });
      json = await res.json().catch(() => null);
    } catch (e) { json = null; }
    if (!json) throw new Error("The admin server function is not reachable. Deploy to Vercel (see README) to use it.");
    if (!res.ok) throw new Error(json.error || "Request failed.");
    return json;
  }

  async adminCreateDriverAccount({ full_name, email, phone_no, password, license_number }) {
    const json = await this.#adminServer({ action: "create_driver", full_name, email, phone_no, password, license_number });
    return json.user_id;
  }
  async adminDeactivateUser(user_id) { await this.#adminServer({ action: "set_active", user_id, active: false }); }
  async adminActivateUser(user_id) { await this.#adminServer({ action: "set_active", user_id, active: true }); }
  // { user_id: true } for every deactivated account
  async adminListStatus() {
    return (await this.#adminServer({ action: "list_status" })).banned || {};
  }
}
