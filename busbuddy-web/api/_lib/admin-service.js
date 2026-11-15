// =====================================================================
// AdminService – the three admin actions. Uses a Supabase client made with
// the SECRET key (it bypasses RLS), so callers must check the role first
// (AdminController does).
// =====================================================================
import { HttpError } from "./http.js";

export class AdminService {
  static ACTIONS = { create_driver: "createDriver", set_active: "setActive", list_status: "listStatus" };

  #admin;

  constructor(adminClient) {
    this.#admin = adminClient;
  }

  // Run body.action for the logged-in administrator `caller`
  async run(body, caller) {
    if (!Object.hasOwn(AdminService.ACTIONS, body.action)) throw new HttpError(400, "Unknown action.");
    const method = AdminService.ACTIONS[body.action];
    return this[method](body, caller);
  }

  // -------------------------------------------------------------
  // a) Create a driver account
  //    { full_name, email, phone_no, password, license_number }
  // -------------------------------------------------------------
  async createDriver(body) {
    const admin = this.#admin;
    const full_name = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone_no = String(body.phone_no || "").replace(/\s/g, "");
    const password = String(body.password || "");
    const license_number = String(body.license_number || "").trim();
    if (!full_name || !email || !license_number) throw new HttpError(400, "Name, email and licence number are required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "The email address is not valid.");
    if (!/^\+961\d{7,8}$/.test(phone_no)) throw new HttpError(400, "Phone must look like +96170123456.");
    if (password.length < 8) throw new HttpError(400, "The temporary password needs at least 8 characters.");

    // Step 1: create the login. The database trigger then adds the public.users row as a passenger.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name, phone_no }
    });
    if (createError) {
      const msg = /already|registered|exists/i.test(createError.message) ? "An account with this email already exists." : createError.message;
      throw new HttpError(400, msg);
    }
    const newId = created.user.id;

    // Step 2: make that user a driver. (admin_set_role() can't be used here: it checks
    // auth.uid(), which is empty when calling with the secret key.)
    const { error: driverError } = await admin.from("drivers").insert({ user_id: newId, license_number });
    const { error: typeError } = driverError ? { error: null }
      : await admin.from("users").update({ type: "driver" }).eq("user_id", newId);
    const stepError = driverError || typeError;
    if (stepError) {
      // Undo step 1 so no half-created account is left behind
      try { await admin.auth.admin.deleteUser(newId); } catch { /* report the original error below */ }
      const msg = stepError.code === "23505" ? "This licence number is already used by another driver." : stepError.message;
      throw new HttpError(400, msg);
    }
    return Response.json({ ok: true, user_id: newId });
  }

  // -------------------------------------------------------------
  // b) Deactivate (ban) or activate (un-ban) an account
  //    { user_id, active: true|false }
  // -------------------------------------------------------------
  async setActive(body, caller) {
    const userId = String(body.user_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(400, "A valid user_id is required.");
    if (userId === caller.id && body.active === false) throw new HttpError(400, "You cannot deactivate your own account.");
    // 876000h ≈ 100 years, i.e. blocked until an admin activates the account again
    const { error } = await this.#admin.auth.admin.updateUserById(userId, { ban_duration: body.active ? "none" : "876000h" });
    if (error) throw new HttpError(400, error.message);
    return Response.json({ ok: true });
  }

  // -------------------------------------------------------------
  // c) Which accounts are deactivated? (so the page shows the right button)
  //    {} → { banned: { user_id: true, ... } }
  // -------------------------------------------------------------
  async listStatus() {
    const banned = {};
    for (let page = 1; ; page++) {
      const { data, error } = await this.#admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new HttpError(500, error.message);
      data.users.forEach((u) => {
        if (u.banned_until && new Date(u.banned_until) > new Date()) banned[u.id] = true;
      });
      if (data.users.length < 1000) break;
    }
    return Response.json({ ok: true, banned });
  }
}
