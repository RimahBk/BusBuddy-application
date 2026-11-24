// =====================================================================
// Session – the logged-in user, role checks and log out.
// It asks the data layer (BB.api) who is logged in, so it works the same
// in demo mode and with the real database.
// =====================================================================
export class Session {
  // Home page of each user type
  static HOME = { guest: "map.html", passenger: "map.html", driver: "driver.html", admin: "monitor.html" };

  #api;
  #cachedUser;   // undefined = not loaded yet, null = guest

  constructor(api) {
    this.#api = api;
  }

  // { id, user_id, full_name, email, phone_no, type } or null for a guest
  async getUser() {
    if (this.#cachedUser !== undefined) return this.#cachedUser;
    this.#cachedUser = null;
    if (!this.#api) return null;
    this.#cachedUser = await this.#api.getCurrentUser();
    return this.#cachedUser;
  }

  // Use at the top of protected pages. Sends guests to the login page and
  // other roles to their own home page. Returns the user when allowed.
  async requireRole(roles) {
    if (!this.#api) return null;                     // setup banner explains what to do
    const user = await this.getUser();
    if (!user) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); return null; }
    if (roles && !roles.includes(user.type)) { location.replace(Session.HOME[user.type] || "index.html"); return null; }
    return user;
  }

  homeFor(type) {
    return Session.HOME[type] || "index.html";
  }

  async logout() {
    if (this.#api) await this.#api.signOut();
    this.#cachedUser = undefined;
    location.href = "index.html";
  }
}
