// =====================================================================
// BB – the one object every page uses (Facade).
// It wires the core classes together and exposes them under short names,
// so page code can write BB.db, BB.$, BB.toast, BB.requireRole, …
//
// Load order on every page:
//   js/vendor/supabase.js → [js/vendor/leaflet/leaflet.js, map pages only]
//   → js/config.js (defines window.BB_CONFIG) → <script type="module" src="js/pages/<page>.js">
// =====================================================================
import { Dom } from "./dom.js";
import { Format } from "./format.js";
import { Ui } from "./ui.js";
import { Connection } from "./connection.js";
import { Session } from "./session.js";
import { NavBar } from "./navbar.js";
import { Banners } from "./banners.js";
import { Poller } from "./poller.js";
import { MapKit } from "./map-kit.js";
import { Eta } from "./eta.js";
import { RouteStyle } from "./route-style.js";
import { createApi } from "../data/api.js";

const cfg = window.BB_CONFIG || {};
const connection = new Connection(cfg);
const api = createApi(connection);            // demo or Supabase backend, chosen by DEMO_MODE
const session = new Session(api);
const navBar = new NavBar(session, connection.demo ? Banners.resetDemo : null);
const banners = new Banners(connection);
const mapKit = new MapKit(cfg, api);

export const BB = {
  // 1. Settings and data
  config: cfg,
  api,                    // ← pages read and change data ONLY through this (js/data/api.js)
  db: connection.db,      // the raw client; kept only until every page uses BB.api
  demo: connection.demo,
  configured: connection.configured,
  inApp: navigator.userAgent.includes("BusBuddyApp"),   // the Android app adds "BusBuddyApp" to its user agent

  // 2. Small helpers
  $: Dom.$,
  $$: Dom.$$,
  param: Dom.param,
  esc: Dom.esc,
  fmtTime: Format.time,
  fmtClock: Format.clock,
  fmtDate: Format.date,
  fmtDateTime: Format.dateTime,
  minutesAgo: Format.minutesAgo,
  dayKey: Format.dayKey,
  dayLabel: Format.dayLabel,
  badge: Format.badge,
  errText: Format.errText,
  telLink: Format.telLink,

  // 3. Toast, confirm box, busy buttons, message boxes
  toast: Ui.toast,
  confirmBox: Ui.confirmBox,
  busy: Ui.busy,
  show: Ui.show,

  // 4. Logged-in user
  HOME: Session.HOME,
  getUser: () => session.getUser(),
  requireRole: (roles) => session.requireRole(roles),
  homeFor: (type) => session.homeFor(type),
  logout: () => session.logout(),

  // 5. Navigation bar and banners
  renderNav: (active) => navBar.render(active),
  renderMenu: (active) => navBar.render(active),     // same as renderNav (the name the plan uses)
  setupBanner: () => banners.setup(),
  demoBanner: () => banners.demo(),

  // Run page code after the page has loaded:  BB.ready(async () => { ... })
  ready(fn) {
    const run = () => { BB.setupBanner(); Promise.resolve(fn()).catch((e) => { console.error(e); BB.toast(BB.errText(e), "error"); }); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  },

  // 6. Polling – call fn now and every `seconds`; returns a function that stops it
  poll: (fn, seconds) => {
    const poller = new Poller(fn, seconds || cfg.POLL_SECONDS || 10).start();
    return () => poller.stop();
  },

  // 7. Maps and route colours
  map: {
    create: (elementId) => mapKit.makeMap(elementId),
    drawRoute: MapKit.drawRoute,       // (map, route, stops, { color, stopPopup }) → layer group
    busMarker: MapKit.busMarker        // ([lat, lng], { status, color, heading, label }) → marker
  },
  makeMap: (elementId) => mapKit.makeMap(elementId),
  busIcon: MapKit.busIcon,
  stopIcon: MapKit.stopIcon,
  setBusHeading: MapKit.setBusHeading,
  applyBusHeading: MapKit.applyBusHeading,
  slideMarker: MapKit.slideMarker,
  routeLine: MapKit.routeLine,
  loadStopsByRoute: () => mapKit.loadStopsByRoute(),
  ROUTE_COLORS: RouteStyle.COLORS,
  routeColor: RouteStyle.color,
  routeDot: RouteStyle.dot,

  // 8. ETA and directions
  eta: Eta.timetable,                  // (bus, stops, delayMinutes) → { stale, minutesAgo, stops: [{ stop, minutes, at }] }
  distanceKm: Eta.distanceKm,
  bearing: Eta.bearing,
  computeEta: Eta.compute
};

// Also available as window.BB, handy for trying things in the browser console
window.BB = BB;
