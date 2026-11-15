// =====================================================================
// AdminController – checks the request (POST, JSON body, logged-in
// administrator), then hands the action to AdminService.
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import { HttpError, fail } from "./http.js";
import { AdminService } from "./admin-service.js";

export class AdminController {
  static async handle(request) {
    try {
      return await AdminController.#handle(request);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      throw e;
    }
  }

  static async #handle(request) {
    // 1. Only POST requests are accepted
    if (request.method !== "POST") throw new HttpError(405, "Use POST.");

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new HttpError(500, "The server is missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
    }

    // 2. Connect to Supabase with the secret key (it bypasses RLS, so we check the role ourselves)
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 3. Read the request body
    let body;
    try { body = await request.json(); } catch { throw new HttpError(400, "The request body must be JSON."); }

    // 4 + 5. Who is calling, and are they an administrator?
    const user = await AdminController.#requireAdmin(request, admin);

    // 6. Run the action
    try {
      return await new AdminService(admin).run(body, user);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      return fail(500, e.message || "Server error.");
    }
  }

  // The page sends its login token as "Authorization: Bearer <token>";
  // the role is checked in public.users
  static async #requireAdmin(request, admin) {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Please log in again.");
    const { data: { user } = {}, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) throw new HttpError(401, "Your session has expired. Please log in again.");

    const { data: caller, error: roleError } = await admin.from("users")
      .select("type").eq("user_id", user.id).maybeSingle();
    if (roleError) throw new HttpError(500, roleError.message);
    if (!caller || caller.type !== "admin") throw new HttpError(403, "Administrators only.");
    return user;
  }
}
