// =====================================================================
// admin.html – admin: buses, routes & stops, trips, accounts
// One class per tab; they share the base data in AdminData.
// =====================================================================
import { BB } from "../core/bb.js";
import { Page } from "./page.js";

const db = BB.db, $ = BB.$, esc = BB.esc;

// ---------------------------------------------------------------
// 0. Shared data (users, drivers, buses, routes) and small helpers
// ---------------------------------------------------------------
class AdminData {
  users = []; drivers = []; buses = []; routes = [];

  async load() {
    const res = await Promise.all([
      db.from("users").select("*").order("full_name"),
      db.from("drivers").select("*"),
      db.from("buses").select("*").order("plate_number"),
      db.from("routes").select("*").order("route_id")
    ]);
    const err = res.find((r) => r.error);
    if (err) { BB.toast(BB.errText(err.error), "error"); return; }
    [this.users, this.drivers, this.buses, this.routes] = res.map((r) => r.data || []);
  }

  userName(id) { return (this.users.find((u) => u.user_id === id) || {}).full_name || "–"; }
  routeName(id) { return (this.routes.find((r) => r.route_id === id) || {}).name || "–"; }
  busPlate(id) { return (this.buses.find((b) => b.bus_id === id) || {}).plate_number || "–"; }

  // <option> list from [[value, text], …]
  static options(list, placeholder) {
    return (placeholder ? `<option value="">${placeholder}</option>` : "") +
      list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
  }

  // Turn a Postgres error into a sentence the admin understands
  static dbErr(error, what) {
    const m = error.message || "", c = error.code;
    if (c === "23505" || /duplicate key/i.test(m)) {
      if (/owner/i.test(m)) return "This driver already owns a bus.";
      if (what === "bus") return "A bus with this plate already exists.";
      if (what === "stop") return "Another stop on this route already has this order number.";
      return "This value already exists.";
    }
    if (c === "23503" || /foreign key/i.test(m)) {
      if (what === "bus") return "This bus is used by trips. Cancel or reassign them first.";
      return "This item is still used elsewhere.";
    }
    if (c === "23514" || /check constraint/i.test(m)) return "A value is outside the allowed range.";
    return BB.errText(error);
  }
}

// Calls our Vercel server function api/admin.js (it holds the secret key, the browser never does)
class AdminApi {
  static UNREACHABLE = "The admin server function is not reachable. Deploy to Vercel (see README) to create driver accounts.";

  static async call(body) {
    const { data } = await db.auth.getSession();
    try {
      const res = await fetch("api/admin", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session ? data.session.access_token : "") },
        body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!json) return { unreachable: true, error: AdminApi.UNREACHABLE };
      return res.ok ? json : { error: json.error || "Request failed." };
    } catch (err) {
      return { unreachable: true, error: AdminApi.UNREACHABLE };
    }
  }
}

// ---------------------------------------------------------------
// 2. BUSES – list, add, edit, delete
// ---------------------------------------------------------------
class BusesTab {
  constructor(data) { this.D = data; }

  async load() {
    const D = this.D;
    await D.load();
    const list = $("#bus-list");
    list.innerHTML = !D.buses.length ? '<div class="empty">No buses yet.</div>' :
      `<div class="table-wrap"><table><thead><tr><th>Plate</th><th>Capacity</th><th>Owner driver</th><th></th></tr></thead><tbody>
      ${D.buses.map((b) => `<tr><td>${esc(b.plate_number)}</td><td>${b.capacity}</td><td>${b.owner_id ? esc(D.userName(b.owner_id)) : '<span class="muted">No owner</span>'}</td>
        <td class="actions"><button class="btn btn-outline btn-small" data-edit-bus="${b.bus_id}">Edit</button><button class="btn btn-danger btn-small" data-del-bus="${b.bus_id}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>`;
    this.resetForm();
  }

  // Owner list = drivers without a bus (plus the current owner when editing)
  fillOwnerSelect(currentOwner) {
    const D = this.D;
    const owned = D.buses.map((b) => b.owner_id).filter(Boolean);
    const free = D.drivers.filter((d) => !owned.includes(d.user_id) || d.user_id === currentOwner);
    $("#bus-owner").innerHTML = AdminData.options(free.map((d) => [d.user_id, D.userName(d.user_id)]), "No owner");
    $("#bus-owner").value = currentOwner || "";
  }

  resetForm() {
    $("#bus-form").reset(); $("#bus-id").value = "";
    $("#bus-form-title").textContent = "Add bus"; $("#bus-cancel").classList.add("hidden");
    this.fillOwnerSelect(null);
  }

  bind() {
    $("#bus-cancel").addEventListener("click", () => this.resetForm());
    $("#bus-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = { plate_number: $("#bus-plate").value.trim().toUpperCase(), capacity: Number($("#bus-cap").value), owner_id: $("#bus-owner").value || null };
      if (!row.plate_number) return BB.toast("Enter the plate number.", "error");
      if (!Number.isInteger(row.capacity) || row.capacity < 1 || row.capacity > 60) return BB.toast("Capacity must be between 1 and 60.", "error");
      const id = $("#bus-id").value;
      BB.busy($("#bus-save"), true, "Saving…");
      const { error } = id ? await db.from("buses").update(row).eq("bus_id", Number(id)) : await db.from("buses").insert(row);
      BB.busy($("#bus-save"), false);
      if (error) return BB.toast(AdminData.dbErr(error, "bus"), "error");
      BB.toast(id ? "Bus updated." : "Bus added.", "ok");
      await this.load();
    });
    $("#bus-list").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit-bus]"), del = e.target.closest("[data-del-bus]");
      if (ed) {
        const b = this.D.buses.find((x) => String(x.bus_id) === ed.dataset.editBus);
        $("#bus-id").value = b.bus_id; $("#bus-plate").value = b.plate_number; $("#bus-cap").value = b.capacity;
        this.fillOwnerSelect(b.owner_id);
        $("#bus-form-title").textContent = "Edit bus " + b.plate_number; $("#bus-cancel").classList.remove("hidden");
        $("#bus-form").scrollIntoView({ behavior: "smooth" });
      }
      if (del) {
        if (!(await BB.confirmBox("Delete this bus? This cannot be undone.", "Delete"))) return;
        const { error } = await db.from("buses").delete().eq("bus_id", Number(del.dataset.delBus));
        if (error) return BB.toast(AdminData.dbErr(error, "bus"), "error");
        BB.toast("Bus deleted.", "ok");
        await this.load();
      }
    });
  }
}

// ---------------------------------------------------------------
// 3. ROUTES & STOPS – pick a route, click the map to place stops
// ---------------------------------------------------------------
class RoutesTab {
  map; stopLayer; tempMarker; stops = [];

  constructor(data) { this.D = data; }

  async load() {
    const D = this.D;
    await D.load();
    if (!this.map) {                                          // create the map the first time the tab opens
      this.map = BB.makeMap("route-map");
      this.stopLayer = L.layerGroup().addTo(this.map);
      this.map.on("click", (e) => this.placeTemp(e.latlng.lat, e.latlng.lng, true));
    }
    setTimeout(() => this.map.invalidateSize(), 50);          // the map was hidden, so let Leaflet re-measure it
    const sel = $("#route-select"), keep = sel.value;
    sel.innerHTML = D.routes.length ? AdminData.options(D.routes.map((r) => [r.route_id, r.name])) : '<option value="">No routes yet – create one</option>';
    if (keep && D.routes.some((r) => String(r.route_id) === keep)) sel.value = keep;
    await this.loadStops();
  }

  // Show a red circle where the new stop will go; optionally copy the position into the form
  placeTemp(lat, lng, fill) {
    if (this.tempMarker) this.map.removeLayer(this.tempMarker);
    this.tempMarker = L.circleMarker([lat, lng], { radius: 9, color: "#A32D2D", weight: 3, fillOpacity: 0.4 }).addTo(this.map);
    if (fill) { $("#stop-lat").value = lat.toFixed(6); $("#stop-lng").value = lng.toFixed(6); }
  }

  async loadStops() {
    const routeId = Number($("#route-select").value);
    this.stops = [];
    if (routeId) {
      const { data, error } = await db.from("stops").select("*").eq("route_id", routeId).order("stop_order");
      if (error) return BB.toast(BB.errText(error), "error");
      this.stops = data || [];
    }
    const stops = this.stops;
    // Draw numbered stops and the line between them
    this.stopLayer.clearLayers();
    const line = stops.map((s) => [s.latitude, s.longitude]);
    if (line.length > 1) L.polyline(line, { color: "#534AB7", weight: 4, opacity: 0.6 }).addTo(this.stopLayer);
    stops.forEach((s) => L.marker([s.latitude, s.longitude], { icon: BB.stopIcon() }).addTo(this.stopLayer)
      .bindTooltip(String(s.stop_order), { permanent: true, direction: "top", offset: [0, -6], className: "num-tip" })
      .bindPopup(`${s.stop_order}. ${esc(s.address)}<br>${s.minutes_from_start} min from start`));
    if (line.length) this.map.fitBounds(line, { padding: [30, 30], maxZoom: 14 });
    // Table of stops
    $("#stop-list").innerHTML = !routeId ? '<div class="empty">Create a route first.</div>' : !stops.length ? '<div class="empty">This route has no stops yet.</div>' :
      `<div class="table-wrap"><table><thead><tr><th>#</th><th>Address</th><th>Position</th><th>Minutes</th><th></th></tr></thead><tbody>
      ${stops.map((s) => `<tr><td>${s.stop_order}</td><td>${esc(s.address)}</td><td class="muted">${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}</td><td>${s.minutes_from_start}</td>
        <td class="actions"><button class="btn btn-outline btn-small" data-edit-stop="${s.stop_id}">Edit</button><button class="btn btn-danger btn-small" data-del-stop="${s.stop_id}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>`;
    this.resetStopForm();
  }

  resetStopForm() {
    const stops = this.stops;
    $("#stop-form").reset(); $("#stop-id").value = "";
    $("#stop-order").value = stops.length ? stops[stops.length - 1].stop_order + 1 : 1;   // default = last + 1
    $("#stop-form-title").textContent = "Add stop"; $("#stop-cancel").classList.add("hidden");
    if (this.tempMarker) { this.map.removeLayer(this.tempMarker); this.tempMarker = null; }
  }

  bind() {
    $("#route-select").addEventListener("change", () => this.loadStops());
    $("#stop-cancel").addEventListener("click", () => this.resetStopForm());
    $("#route-new-btn").addEventListener("click", () => $("#route-form").classList.toggle("hidden"));
    $("#route-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = { name: $("#route-name").value.trim(), origin: $("#route-origin").value.trim(), destination: $("#route-dest").value.trim() };
      if (!row.name || !row.origin || !row.destination) return BB.toast("Fill in name, origin and destination.", "error");
      const { data, error } = await db.from("routes").insert(row).select().single();
      if (error) return BB.toast(AdminData.dbErr(error, "route"), "error");
      BB.toast("Route created. Now click the map to add its stops.", "ok");
      $("#route-form").reset(); $("#route-form").classList.add("hidden");
      $("#route-select").value = "";
      await this.load();
      $("#route-select").value = data.route_id; await this.loadStops();
    });
    $("#stop-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const routeId = Number($("#route-select").value);
      if (!routeId) return BB.toast("Create or choose a route first.", "error");
      const row = { route_id: routeId, address: $("#stop-address").value.trim(), latitude: Number($("#stop-lat").value), longitude: Number($("#stop-lng").value),
                    stop_order: Number($("#stop-order").value), minutes_from_start: Number($("#stop-min").value) };
      if (!row.address) return BB.toast("Enter the stop's address.", "error");
      if (!$("#stop-lat").value || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180) return BB.toast("Click the map to set the position.", "error");
      if (!Number.isInteger(row.stop_order) || row.stop_order < 1 || row.minutes_from_start < 0) return BB.toast("Check the order and minutes.", "error");
      const id = $("#stop-id").value;
      BB.busy($("#stop-save"), true, "Saving…");
      const { error } = id ? await db.from("stops").update(row).eq("stop_id", Number(id)) : await db.from("stops").insert(row);
      BB.busy($("#stop-save"), false);
      if (error) return BB.toast(AdminData.dbErr(error, "stop"), "error");
      BB.toast(id ? "Stop updated." : "Stop added.", "ok");
      await this.loadStops();
    });
    $("#stop-list").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-edit-stop]"), del = e.target.closest("[data-del-stop]");
      if (ed) {
        const s = this.stops.find((x) => String(x.stop_id) === ed.dataset.editStop);
        $("#stop-id").value = s.stop_id; $("#stop-address").value = s.address; $("#stop-lat").value = s.latitude; $("#stop-lng").value = s.longitude;
        $("#stop-order").value = s.stop_order; $("#stop-min").value = s.minutes_from_start;
        $("#stop-form-title").textContent = "Edit stop " + s.stop_order; $("#stop-cancel").classList.remove("hidden");
        this.placeTemp(s.latitude, s.longitude, false); this.map.setView([s.latitude, s.longitude], 14);
        $("#route-map").scrollIntoView({ behavior: "smooth" });
      }
      if (del) {
        if (!(await BB.confirmBox("Delete this stop?", "Delete"))) return;
        const { error } = await db.from("stops").delete().eq("stop_id", Number(del.dataset.delStop));
        if (error) return BB.toast(AdminData.dbErr(error, "stop"), "error");
        BB.toast("Stop deleted.", "ok");
        await this.loadStops();
      }
    });
  }
}

// ---------------------------------------------------------------
// 4. TRIPS – create a trip, list upcoming/running ones, cancel
// ---------------------------------------------------------------
class TripsTab {
  trips = [];

  constructor(data) { this.D = data; }

  async load() {
    const D = this.D;
    await D.load();
    $("#trip-route").innerHTML = AdminData.options(D.routes.map((r) => [r.route_id, r.name]), "Choose a route");
    $("#trip-bus").innerHTML = AdminData.options(D.buses.map((b) => [b.bus_id, `${b.plate_number} (${b.capacity} seats)`]), "Choose a bus");
    $("#trip-driver").innerHTML = AdminData.options(D.drivers.map((d) => [d.user_id, D.userName(d.user_id)]), "Choose a driver");
    const [t, s] = await Promise.all([
      db.from("trips").select("*").in("status", ["scheduled", "active", "delayed"]).order("departure_time"),
      db.rpc("get_upcoming_trips")                      // gives the free seats of each trip
    ]);
    if (t.error) return BB.toast(BB.errText(t.error), "error");
    this.trips = t.data || [];
    const seats = {}; (s.data || []).forEach((x) => { seats[x.trip_id] = x; });
    $("#trip-list").innerHTML = !this.trips.length ? '<div class="empty">No upcoming trips.</div>' :
      `<div class="table-wrap"><table><thead><tr><th>Departure</th><th>Route</th><th>Bus</th><th>Driver</th><th>Status</th><th>Seats taken</th><th></th></tr></thead><tbody>
      ${this.trips.map((x) => { const k = seats[x.trip_id]; return `<tr><td>${BB.fmtDateTime(x.departure_time)}</td><td>${esc(D.routeName(x.route_id))}</td>
        <td>${esc(D.busPlate(x.bus_id))}</td><td>${esc(D.userName(x.driver_id))}</td><td>${BB.badge(x.status)}</td>
        <td>${k ? (k.capacity - k.available_seats) + " / " + k.capacity : "–"}</td>
        <td>${x.status === "scheduled" ? `<button class="btn btn-danger btn-small" data-cancel-trip="${x.trip_id}">Cancel trip</button>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`;
  }

  bind() {
    // Choosing a bus pre-selects its owner as the driver
    $("#trip-bus").addEventListener("change", () => {
      const b = this.D.buses.find((x) => String(x.bus_id) === $("#trip-bus").value);
      if (b && b.owner_id) $("#trip-driver").value = b.owner_id;
    });
    $("#trip-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const dep = $("#trip-dep").value;
      if (!$("#trip-route").value || !$("#trip-bus").value || !$("#trip-driver").value || !dep) return BB.toast("Fill in every field.", "error");
      if (new Date(dep) <= new Date()) return BB.toast("The departure must be in the future.", "error");
      const row = { route_id: Number($("#trip-route").value), bus_id: Number($("#trip-bus").value), driver_id: $("#trip-driver").value,
                    departure_time: new Date(dep).toISOString() };    // datetime-local is local time → ISO (UTC)
      BB.busy($("#trip-save"), true, "Creating…");
      const { error } = await db.from("trips").insert(row);           // status defaults to "scheduled"
      BB.busy($("#trip-save"), false);
      if (error) return BB.toast(AdminData.dbErr(error, "trip"), "error");
      BB.toast("Trip created.", "ok");
      $("#trip-form").reset();
      await this.load();
    });
    $("#trip-list").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cancel-trip]");
      if (!b) return;
      if (!(await BB.confirmBox("Cancel this trip? All seat reservations on it will be cancelled too.", "Cancel trip"))) return;
      const { error } = await db.rpc("admin_cancel_trip", { p_trip_id: Number(b.dataset.cancelTrip) });
      if (error) return BB.toast(BB.errText(error), "error");
      BB.toast("Trip and its bookings cancelled.", "ok");
      await this.load();
    });
  }
}

// ---------------------------------------------------------------
// 5. ACCOUNTS – roles, create driver, activate / deactivate
// ---------------------------------------------------------------
class AccountsTab {
  banned = null;                                    // user_id → true when deactivated (null = unknown)

  constructor(data, me) { this.D = data; this.me = me; }

  async load() {
    const D = this.D, me = this.me;
    await D.load();
    const st = await AdminApi.call({ action: "list_status" });
    this.banned = st.banned || null;
    const banned = this.banned;
    BB.show("#acc-note", banned ? "" : "Account status (active / deactivated) is unknown because the admin server function is not reachable.", "warn");
    const lic = (id) => (D.drivers.find((d) => d.user_id === id) || {}).license_number || "";
    $("#acc-list").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Change role</th><th>Access</th></tr></thead><tbody>
      ${D.users.map((u) => { const self = u.user_id === me.id; return `<tr data-user="${esc(u.user_id)}" data-search="${esc((u.full_name + " " + u.email + " " + (u.phone_no || "")).toLowerCase())}">
        <td>${esc(u.full_name)}${self ? ' <span class="muted">(you)</span>' : ""}${banned && banned[u.user_id] ? ' <span class="badge badge-cancelled">deactivated</span>' : ""}</td>
        <td>${esc(u.email)}</td><td>${esc(u.phone_no || "–")}</td><td>${BB.badge(u.type)}</td>
        <td>${self ? '<span class="muted">You cannot change your own role.</span>' : `<div class="row" style="flex-wrap:nowrap">
            <select data-role>${["passenger", "driver", "admin"].map((t) => `<option ${t === u.type ? "selected" : ""}>${t}</option>`).join("")}</select>
            <button class="btn btn-small" data-save-role>Save</button></div>
          <input class="lic ${u.type === "driver" ? "" : "hidden"}" data-lic placeholder="Licence number" value="${esc(lic(u.user_id))}">`}</td>
        <td>${self ? "" : !banned ? '<button class="btn btn-outline btn-small" data-active="false">Deactivate</button> <button class="btn btn-outline btn-small" data-active="true">Activate</button>'
          : banned[u.user_id] ? '<button class="btn btn-small" data-active="true">Activate</button>' : '<button class="btn btn-outline btn-small" data-active="false">Deactivate</button>'}</td>
      </tr>`; }).join("")}</tbody></table></div>`;
    this.filter();
  }

  // Search box filters the rows already on the page
  filter() {
    const q = $("#acc-search").value.trim().toLowerCase();
    BB.$$("#acc-list tr[data-user]").forEach((tr) => tr.classList.toggle("hidden", !!q && !tr.dataset.search.includes(q)));
  }

  bind() {
    const me = this.me;
    $("#acc-search").addEventListener("input", () => this.filter());
    // Choosing "driver" shows the licence box
    $("#acc-list").addEventListener("change", (e) => {
      if (!e.target.matches("[data-role]")) return;
      $("[data-lic]", e.target.closest("tr")).classList.toggle("hidden", e.target.value !== "driver");
    });
    $("#acc-list").addEventListener("click", async (e) => {
      const tr = e.target.closest("tr[data-user]");
      if (!tr) return;
      const userId = tr.dataset.user, u = this.D.users.find((x) => x.user_id === userId);
      // Save a role change
      if (e.target.matches("[data-save-role]")) {
        const type = $("[data-role]", tr).value, licence = $("[data-lic]", tr).value.trim();
        if (userId === me.id && type !== "admin") return BB.toast("You cannot remove your own admin role.", "error");
        if (type === "driver" && !licence) { $("[data-lic]", tr).focus(); return BB.toast("Enter the licence number for a driver.", "error"); }
        BB.busy(e.target, true, "…");
        const { error } = await db.rpc("admin_set_role", { p_user_id: userId, p_type: type, p_license: type === "driver" ? licence : null });
        BB.busy(e.target, false);
        if (error) return BB.toast(BB.errText(error), "error");
        BB.toast(`${u.full_name} is now ${type === "admin" ? "an" : "a"} ${type}.`, "ok");
        await this.load();
      }
      // Activate / deactivate the login
      const act = e.target.closest("[data-active]");
      if (act) {
        const active = act.dataset.active === "true";
        if (!(await BB.confirmBox(active ? `Allow ${u.full_name} to log in again?` : `Deactivate ${u.full_name}? They will not be able to log in.`, active ? "Activate" : "Deactivate"))) return;
        const res = await AdminApi.call({ action: "set_active", user_id: userId, active });
        if (res.error) return BB.toast(res.error, "error");
        BB.toast(active ? "Account activated." : "Account deactivated.", "ok");
        await this.load();
      }
    });
    // Create a driver account (needs the server function: only it may create logins for others)
    $("#driver-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { action: "create_driver", full_name: $("#dr-name").value.trim(), email: $("#dr-email").value.trim(),
                     phone_no: $("#dr-phone").value.replace(/\s/g, ""), password: $("#dr-pass").value, license_number: $("#dr-lic").value.trim() };
      if (!/^\+961\d{7,8}$/.test(body.phone_no)) return BB.show("#driver-msg", "Phone must look like +96170123456.", "error");
      if (body.password.length < 8) return BB.show("#driver-msg", "The temporary password needs at least 8 characters.", "error");
      BB.busy($("#dr-save"), true, "Creating…");
      const res = await AdminApi.call(body);
      BB.busy($("#dr-save"), false);
      if (res.error) return BB.show("#driver-msg", res.error, res.unreachable ? "warn" : "error");
      BB.show("#driver-msg", `Driver account created for ${body.email}. Give them the temporary password.`, "ok");
      $("#driver-form").reset();
      await this.load();
    });
  }
}

// ---------------------------------------------------------------
// The page: tabs – the open tab is remembered in the address (#buses, #routes, …)
// ---------------------------------------------------------------
class AdminPage extends Page {
  static TABS = ["buses", "routes", "trips", "accounts"];
  tabs = {};                                   // tab name → object with load() that (re)draws it

  async init() {
    await BB.renderNav("admin.html");
    if (!BB.db) return;                                   // setup not done yet
    const me = await BB.requireRole(["admin"]);           // administrators only (UC-18)
    if (!me) return;

    const data = new AdminData();
    this.tabs = { buses: new BusesTab(data), routes: new RoutesTab(data), trips: new TripsTab(data), accounts: new AccountsTab(data, me) };

    BB.$$(".tab").forEach((b) => b.addEventListener("click", () => this.openTab(b.dataset.tab)));
    window.addEventListener("hashchange", () => this.openTab(location.hash.slice(1)));
    Object.values(this.tabs).forEach((tab) => tab.bind());

    // 6. Start on the tab named in the address, or Buses
    await this.openTab(location.hash.slice(1) || "buses");
  }

  async openTab(name) {
    const TABS = AdminPage.TABS;
    if (!TABS.includes(name)) name = "buses";
    BB.$$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    TABS.forEach((t) => $("#panel-" + t).classList.toggle("hidden", t !== name));
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    await this.tabs[name].load();
  }
}

AdminPage.mount();
