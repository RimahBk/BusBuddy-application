// =====================================================================
// NavBar – the top navigation bar, the same on every page.
// Put <header id="topbar"></header> at the top of <body>.
// The links depend on the role of the logged-in user.
// =====================================================================
import { Dom } from "./dom.js";

export class NavBar {
  static LINKS = {
    guest:     [["map.html", "Live map"], ["schedules.html", "Schedules"], ["login.html", "Log in"], ["register.html", "Register"]],
    passenger: [["map.html", "Live map"], ["schedules.html", "Schedules"], ["bookings.html", "My bookings"], ["messages.html", "Messages"]],
    driver:    [["driver.html", "My trips"], ["messages.html", "Messages"], ["map.html", "Live map"]],
    admin:     [["monitor.html", "Monitor"], ["admin.html", "Manage"], ["map.html", "Live map"], ["schedules.html", "Schedules"]]
  };

  #session;

  constructor(session) {
    this.#session = session;
  }

  // active = file name of the current page, e.g. "map.html"
  async render(active) {
    const bar = document.getElementById("topbar");
    if (!bar) return;
    const user = await this.#session.getUser();
    const role = user ? user.type : "guest";
    const links = NavBar.LINKS[role].map(([href, label]) =>
      `<a href="${href}" class="${href === active ? "active" : ""}">${label}</a>`).join("");
    bar.innerHTML = `<div class="topbar-inner">
        <a class="brand" href="${user ? this.#session.homeFor(role) : "index.html"}"><span class="brand-mark">B</span>BusBuddy</a>
        <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
        <nav class="nav-links">${links}
          ${user ? `<span class="nav-user">${Dom.esc(user.full_name)}</span><button id="bb-logout">Log out</button>` : ""}
        </nav></div>`;
    const toggle = bar.querySelector(".nav-toggle"), nav = bar.querySelector(".nav-links");
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("open"));
    });
    const out = document.getElementById("bb-logout");
    if (out) out.addEventListener("click", () => this.#session.logout());
  }
}
