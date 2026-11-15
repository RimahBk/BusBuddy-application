// =====================================================================
// Session – the logged-in user, role checks and log out.
// =====================================================================
export class Session {
  // Home page of each user type
  static HOME = { guest: "map.html", passenger: "map.html", driver: "driver.html", admin: "monitor.html" };

  #db;
  #cachedUser;   // undefined = not loaded yet, null = guest

  constructor(db) {
    this.#db = db;
  }

  async getUser() {
    if (this.#cachedUser !== undefined) return this.#cachedUser;
    this.#cachedUser = null;
    if (!this.#db) return null;
    const { data } = await this.#db.auth.getSession();
    const session = data && data.session;
    if (!session) return null;
    const { data: profile } = await this.#db.from("users")
      .select("user_id, full_name, email, phone_no, type")
      .eq("user_id", session.user.id).maybeSingle();
    if (!profile) return null;
    this.#cachedUser = { id: session.user.id, email: session.user.email, ...profile };
    return this.#cachedUser;
  }

  // Use at the top of protected pages. Sends guests to the login page and
  // other roles to their own home page. Returns the user when allowed.
  async requireRole(roles) {
    if (!this.#db) return null;                      // setup banner explains what to do
    const user = await this.getUser();
    if (!user) { location.replace("login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); return null; }
    if (roles && !roles.includes(user.type)) { location.replace(Session.HOME[user.type] || "index.html"); return null; }
    return user;
  }

  homeFor(type) {
    return Session.HOME[type] || "index.html";
  }

  async logout() {
    if (this.#db) await this.#db.auth.signOut();
    this.#cachedUser = undefined;
    location.href = "index.html";
  }
}
