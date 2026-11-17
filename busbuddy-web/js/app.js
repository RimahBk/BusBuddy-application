// =====================================================================
// BusBuddy – shared code used by every page  (window.BB)
// Load order on every page:
//   supabase-js (CDN) → [leaflet (CDN), map pages only] → js/config.js → js/app.js
// =====================================================================
(function () {
  const cfg = window.BB_CONFIG || {};
  const BB = {};
  window.BB = BB;

  // ---------------------------------------------------------------
  // 1. Supabase connection
  // ---------------------------------------------------------------
  // Demo mode = offline sample data from js/demo-data.js (no Supabase needed)
  BB.demo = !!cfg.DEMO_MODE && !!window.BBDemo;
  BB.configured = BB.demo || (!!cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT-ID")
               && !!cfg.SUPABASE_KEY && !cfg.SUPABASE_KEY.includes("YOUR-PUBLISHABLE-KEY"));
  BB.db = BB.demo ? window.BBDemo.createClient()
        : (BB.configured && window.supabase) ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;

  // Opened inside the Android app? (the app adds "BusBuddyApp" to its WebView user agent)
  BB.inApp = navigator.userAgent.includes("BusBuddyApp");

  // Home page of each user type
  BB.HOME = { guest: "map.html", passenger: "map.html", driver: "driver.html", admin: "monitor.html" };

  // ---------------------------------------------------------------
  // 2. Small helpers
  // ---------------------------------------------------------------
  BB.$ = (sel, root) => (root || document).querySelector(sel);
  BB.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  BB.param = (name) => new URLSearchParams(location.search).get(name);

  // Escape text before putting it inside innerHTML (prevents broken pages / HTML injection)
  BB.esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  BB.fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–";
  BB.fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "–";
  BB.fmtDateTime = (iso) => iso ? BB.fmtDate(iso) + ", " + BB.fmtTime(iso) : "–";
  BB.minutesAgo = (iso) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : null;

  // Badge HTML for a status word (scheduled, active, delayed, completed, cancelled, booked, walk_on)
  BB.badge = (status) => `<span class="badge badge-${BB.esc(status)}">${BB.esc(String(status).replace("_", " "))}</span>`;

  // Supabase error → readable text (our SQL functions raise plain English messages)
  BB.errText = (error) => {
    if (!error) return "";
    const m = error.message || String(error);
    if (m.includes("Failed to fetch")) return "No internet connection. Please try again.";
    return m.replace(/^FULL:\s*/, "");
  };

  // ---------------------------------------------------------------
  // 3. Toast and confirm box  (no alert()/confirm(): they don't show in a plain WebView)
  // ---------------------------------------------------------------
  let toastTimer;
  BB.toast = (text, type) => {
    let el = document.getElementById("bb-toast");
    if (!el) { el = document.createElement("div"); el.id = "bb-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = text;
    el.className = "show " + (type || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ""; }, 3500);
  };

  BB.confirmBox = (message, okLabel) => new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
        <p>${BB.esc(message)}</p>
        <div class="row">
          <button class="btn btn-outline" data-a="no">Back</button>
          <button class="btn" data-a="yes">${BB.esc(okLabel || "Yes")}</button>
        </div></div>`;
    back.addEventListener("click", (e) => {
      const a = e.target.getAttribute("data-a");
      if (a || e.target === back) { back.remove(); resolve(a === "yes"); }
    });
    document.body.appendChild(back);
  });

  // Put a button into a "working…" state while a request runs
  BB.busy = (btn, isBusy, text) => {
    if (!btn) return;
    if (isBusy) { btn.dataset.label = btn.textContent; btn.textContent = text || "Please wait…"; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  };

  // Show a message inside a box on the page (type: error | ok | info | warn)
  BB.show = (el, text, type) => {
    if (typeof el === "string") el = BB.$(el);
    if (!el) return;
    if (!text) { el.className = "hidden"; el.textContent = ""; return; }
    el.className = "alert alert-" + (type || "info");
    el.textContent = text;
  };

  // ---------------------------------------------------------------
  // 4. Logged-in user
  // ---------------------------------------------------------------
  let cachedUser;   // undefined = not loaded yet, null = guest
  BB.getUser = async () => {
    if (cachedUser !== undefined) return cachedUser;
    cachedUser = null;
    if (!BB.db) return null;
    const { data } = await BB.db.auth.getSession();
    const session = data && data.session;
    if (!session) return null;
    const { data: profile } = await BB.db.from("users")
      .select("user_id, full_name, email, phone_no, type")
      .eq("user_id", session.user.id).maybeSingle();
    if (!profile) return null;
    cachedUser = { id: session.user.id, email: session.user.email, ...profile };
    return cachedUser;
  };

  // Use at the top of protected pages. Sends guests to the login page and
  // other roles to their own home page. Returns the user when allowed.
  BB.requireRole = async (roles) => {
    if (!BB.db) return null;                         // setup banner explains what to do
    const user = await BB.getUser();
    if (!user) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); return null; }
    if (roles && !roles.includes(user.type)) { location.replace(BB.HOME[user.type] || "index.html"); return null; }
    return user;
  };

  BB.homeFor = (type) => BB.HOME[type] || "index.html";

  BB.logout = async () => {
    if (BB.db) await BB.db.auth.signOut();
    cachedUser = undefined;
    location.href = "index.html";
  };

  // ---------------------------------------------------------------
  // 5. Top navigation bar – the same on every page, links depend on the role
  //    Put <header id="topbar"></header> at the top of <body>.
  //    active = file name of the current page, e.g. "map.html"
  // ---------------------------------------------------------------
  const NAV = {
    guest:     [["map.html", "Live map"], ["schedules.html", "Schedules"], ["login.html", "Log in"], ["register.html", "Register"]],
    passenger: [["map.html", "Live map"], ["schedules.html", "Schedules"], ["bookings.html", "My bookings"], ["messages.html", "Messages"]],
    driver:    [["driver.html", "My trips"], ["messages.html", "Messages"], ["map.html", "Live map"]],
    admin:     [["monitor.html", "Monitor"], ["admin.html", "Manage"], ["map.html", "Live map"], ["schedules.html", "Schedules"]]
  };

  BB.renderNav = async (active) => {
    const bar = document.getElementById("topbar");
    if (!bar) return;
    const user = await BB.getUser();
    const role = user ? user.type : "guest";
    const links = NAV[role].map(([href, label]) =>
      `<a href="${href}" class="${href === active ? "active" : ""}">${label}</a>`).join("");
    bar.innerHTML = `<div class="topbar-inner">
        <a class="brand" href="${user ? BB.homeFor(role) : "index.html"}"><span class="brand-mark">B</span>BusBuddy</a>
        <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
        <nav class="nav-links">${links}
          ${user ? `<span class="nav-user">${BB.esc(user.full_name)}</span><button id="bb-logout">Log out</button>` : ""}
        </nav></div>`;
    const toggle = bar.querySelector(".nav-toggle"), nav = bar.querySelector(".nav-links");
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("open"));
    });
    const out = document.getElementById("bb-logout");
    if (out) out.addEventListener("click", BB.logout);
  };

  // Shows a yellow banner if config.js still has the placeholder values
  BB.setupBanner = () => {
    if (BB.demo) return BB.demoBanner();
    if (BB.configured) return;
    const main = document.querySelector("main") || document.body;
    const div = document.createElement("div");
    div.className = "alert alert-warn";
    div.innerHTML = "<b>Setup needed:</b> put your Supabase URL and publishable key in <code>js/config.js</code>.";
    main.prepend(div);
  };

  // Demo mode: a thin bar under the menu; on the log-in page it also lists the demo accounts
  BB.demoBanner = () => {
    const page = location.pathname.split("/").pop() || "index.html";
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = "Demo mode · sample data, works offline · <button type='button' id='bb-demo-reset'>Reset demo</button>"
      + (page === "login.html" ? "<br>Demo accounts (any password): <b>rami@busbuddy.test</b> passenger · "
         + "<b>driver@busbuddy.test</b> driver · <b>admin@busbuddy.test</b> admin" : "");
    const top = document.getElementById("topbar");
    if (top) top.after(bar); else document.body.prepend(bar);
    bar.querySelector("#bb-demo-reset").addEventListener("click", async () => {
      if (!(await BB.confirmBox("Start the demo again with the original sample data? You will be logged out.", "Reset"))) return;
      window.BBDemo.reset();
      location.href = "index.html";
    });
  };

  // Run page code after the page has loaded:  BB.ready(async () => { ... })
  BB.ready = (fn) => {
    const run = () => { BB.setupBanner(); Promise.resolve(fn()).catch((e) => { console.error(e); BB.toast(BB.errText(e), "error"); }); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  };

  // ---------------------------------------------------------------
  // 6. Polling – call fn now and every `seconds`; pauses while the tab is hidden.
  //    Returns a function that stops it.
  // ---------------------------------------------------------------
  BB.poll = (fn, seconds) => {
    let timer = null, stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) { try { await fn(); } catch (e) { console.error(e); } }
      timer = setTimeout(tick, (seconds || cfg.POLL_SECONDS || 10) * 1000);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  };

  // ---------------------------------------------------------------
  // 7. Map helpers (Leaflet 1.9.4 + OpenStreetMap tiles)
  // ---------------------------------------------------------------
  BB.makeMap = (elementId) => {
    const map = L.map(elementId).setView(cfg.MAP_CENTER || [33.78, 35.5], cfg.MAP_ZOOM || 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return map;
  };

  // Each route gets its own colour (a route row may also carry its own `color`)
  BB.ROUTE_COLORS = ["#534AB7", "#1565C0", "#C2185B", "#00838F", "#6D4C41", "#2E7D32", "#AD1457", "#283593"];
  BB.routeColor = (route) => {
    if (route && typeof route === "object") {
      if (route.color) return route.color;
      route = route.route_id;
    }
    const id = Number(route) || 1;
    return BB.ROUTE_COLORS[(id - 1) % BB.ROUTE_COLORS.length];
  };
  BB.routeDot = (route) => `<span class="route-dot" style="background:${BB.esc(BB.routeColor(route))}"></span>`;

  // Bus marker: a circle in the route's colour with an arrow that shows the direction.
  // Without a colour it keeps the old look (green, amber when delayed) – used by the monitor and driver pages.
  BB.busIcon = (status, color, heading) => {
    const delayed = status === "delayed";
    const bg = color || (delayed ? "var(--amber)" : "var(--green)");
    const arrow = heading == null || isNaN(heading) ? `<span class="bus-arrow"></span>`
      : `<span class="bus-arrow on" style="transform:rotate(${Number(heading)}deg)"></span>`;
    return L.divIcon({
      className: "", iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16],
      html: `<div class="bus-marker ${delayed ? "delayed" : ""}" style="--route:${BB.esc(bg)}">${arrow}<span class="bus-glyph">🚌</span></div>`
    });
  };
  BB.stopIcon = (color) => L.divIcon({ className: "", iconSize: [14, 14], iconAnchor: [7, 7],
    html: `<div class="stop-marker"${color ? ` style="border-color:${BB.esc(color)}"` : ""}></div>` });

  // Direction from point 1 to point 2 in degrees (0 = north, 90 = east)
  BB.bearing = (lat1, lng1, lat2, lng2) => {
    const rad = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  };

  // Turn a bus marker's arrow. The angle is kept continuous (350° → 10° turns 20°, not back 340°).
  BB.setBusHeading = (marker, deg) => {
    if (deg == null || isNaN(deg)) return;
    marker.bb = marker.bb || {};
    const prev = marker.bb.heading;
    marker.bb.heading = prev == null ? deg : prev + ((((deg - prev) % 360) + 540) % 360 - 180);
    BB.applyBusHeading(marker);
  };
  BB.applyBusHeading = (marker) => {
    const el = marker.getElement && marker.getElement();
    const arrow = el && el.querySelector(".bus-arrow");
    if (!arrow || !marker.bb || marker.bb.heading == null) return;
    arrow.style.transform = `rotate(${marker.bb.heading}deg)`;
    arrow.classList.add("on");
  };

  // Move a marker smoothly to its new position instead of jumping.
  // Jumps straight there when the tab is hidden, the move is very long, or the user prefers less motion.
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  BB.slideMarker = (marker, to, ms) => {
    const target = L.latLng(to), from = marker.getLatLng();
    marker.bb = marker.bb || {};
    cancelAnimationFrame(marker.bb.anim);
    if (reduceMotion || document.hidden || !marker._map || from.equals(target) || from.distanceTo(target) > 3000) {
      marker.setLatLng(target); return;
    }
    const start = performance.now(), dur = ms || 1500;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);   // ease-out
      marker.setLatLng([from.lat + (target.lat - from.lat) * e, from.lng + (target.lng - from.lng) * e]);
      if (t < 1) marker.bb.anim = requestAnimationFrame(step);
    };
    marker.bb.anim = requestAnimationFrame(step);
  };

  // "Today", "Tomorrow" or a short date – and a key to group trips by day
  BB.dayKey = (d) => { const x = new Date(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); };
  BB.dayLabel = (iso) => {
    const key = BB.dayKey(iso), now = new Date();
    if (key === BB.dayKey(now)) return "Today";
    if (key === BB.dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))) return "Tomorrow";
    return BB.fmtDate(iso);
  };

  // Load the stops of every route once:  { route_id: [stops sorted by stop_order] }
  // Each list also gets .path = the route's road shape ([lat, lng] points) when the route has one.
  BB.loadStopsByRoute = async () => {
    const out = {};
    if (!BB.db) return out;
    const { data, error } = await BB.db.from("stops").select("*").order("route_id").order("stop_order");
    if (error) throw error;
    (data || []).forEach((s) => { (out[s.route_id] = out[s.route_id] || []).push(s); });
    const { data: routes } = await BB.db.from("routes").select("*");
    (routes || []).forEach((r) => { if (out[r.route_id] && Array.isArray(r.path) && r.path.length > 1) out[r.route_id].path = r.path; });
    return out;
  };

  // The line to draw for a route: its real road shape if known, otherwise straight lines between its stops
  BB.routeLine = (stops, path) => {
    const p = path || (stops && stops.path);
    return Array.isArray(p) && p.length > 1 ? p : (stops || []).map((s) => [s.latitude, s.longitude]);
  };

  // ---------------------------------------------------------------
  // 8. ETA  (UC-06): haversine distance ÷ recent speed, plus any reported delay.
  //    If the speed is unknown or the bus is stopped, the scheduled
  //    minutes_from_start difference is used instead.
  // ---------------------------------------------------------------
  BB.distanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  // bus = a row from get_live_buses(); stops = that route's stops (sorted)
  // returns [{ stop, minutes }] for the stops still ahead of the bus
  BB.computeEta = (bus, stops) => {
    if (!bus || bus.latitude == null || !stops || !stops.length) return [];
    // nearest stop = where the bus is now; the ones after it are still ahead
    let nearest = 0, best = Infinity;
    stops.forEach((s, i) => {
      const d = BB.distanceKm(bus.latitude, bus.longitude, s.latitude, s.longitude);
      if (d < best) { best = d; nearest = i; }
    });
    const ahead = stops.slice(best < 0.3 ? nearest + 1 : nearest);
    const delay = bus.delay_minutes || 0;
    const speed = bus.speed && bus.speed > 5 ? bus.speed : null;     // km/h
    let travelled = 0, prev = { latitude: bus.latitude, longitude: bus.longitude };
    const baseSched = stops[nearest].minutes_from_start;
    return ahead.map((s) => {
      let minutes;
      if (speed) {
        travelled += BB.distanceKm(prev.latitude, prev.longitude, s.latitude, s.longitude) * 1.3; // roads are not straight
        prev = s;
        minutes = (travelled / speed) * 60;
      } else {
        minutes = Math.max(0, s.minutes_from_start - baseSched);
      }
      return { stop: s, minutes: Math.max(1, Math.round(minutes + delay)) };
    });
  };

  // Phone link for calls (UC-03)
  BB.telLink = (phone, label) => phone
    ? `<a class="btn btn-outline btn-small" href="tel:${BB.esc(phone.replace(/[^+\d]/g, ""))}">📞 ${BB.esc(label || "Call")}</a>`
    : "";
})();
