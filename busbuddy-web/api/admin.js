// =====================================================================
// BusBuddy – admin server function (Vercel Function, no framework)
// URL: POST /api/admin   body: { action: "...", ... }
//
// Why a server function? Creating a login for someone else, and blocking
// a login, need Supabase's SECRET key (sb_secret_...). That key may never
// be sent to the browser, so these actions run here, on Vercel's server.
// Set these in Vercel → Project → Settings → Environment Variables:
//   SUPABASE_URL        = https://YOUR-PROJECT-ID.supabase.co
//   SUPABASE_SECRET_KEY = sb_secret_...
//
// Actions (all need the caller to be logged in as an administrator):
//   create_driver  { full_name, email, phone_no, password, license_number }
//   set_active     { user_id, active: true|false }
//   list_status    {}   → { banned: { user_id: true, ... } } (deactivated accounts)
// =====================================================================
import { createClient } from "@supabase/supabase-js";

// Small helper: send an error back as JSON with an HTTP status code
const fail = (status, message) => Response.json({ error: message }, { status });

export default {
  async fetch(request) {
    // 1. Only POST requests are accepted
    if (request.method !== "POST") return fail(405, "Use POST.");

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      return fail(500, "The server is missing SUPABASE_URL or SUPABASE_SECRET_KEY.");
    }

    // 2. Connect to Supabase with the secret key (it bypasses RLS, so we check the role ourselves)
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 3. Read the request body
    let body;
    try { body = await request.json(); } catch { return fail(400, "The request body must be JSON."); }

    // 4. Who is calling? The page sends its login token as "Authorization: Bearer <token>"
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return fail(401, "Please log in again.");
    const { data: { user } = {}, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return fail(401, "Your session has expired. Please log in again.");

    // 5. ...and are they an administrator? (checked in public.users)
    const { data: caller, error: roleError } = await admin.from("users")
      .select("type").eq("user_id", user.id).maybeSingle();
    if (roleError) return fail(500, roleError.message);
    if (!caller || caller.type !== "admin") return fail(403, "Administrators only.");

    try {
      // -------------------------------------------------------------
      // 6a. Create a driver account
      // -------------------------------------------------------------
      if (body.action === "create_driver") {
        const full_name = String(body.full_name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const phone_no = String(body.phone_no || "").replace(/\s/g, "");
        const password = String(body.password || "");
        const license_number = String(body.license_number || "").trim();
        if (!full_name || !email || !license_number) return fail(400, "Name, email and licence number are required.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "The email address is not valid.");
        if (!/^\+961\d{7,8}$/.test(phone_no)) return fail(400, "Phone must look like +96170123456.");
        if (password.length < 8) return fail(400, "The temporary password needs at least 8 characters.");

        // Step 1: create the login. The database trigger then adds the public.users row as a passenger.
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name, phone_no }
        });
        if (createError) {
          const msg = /already|registered|exists/i.test(createError.message) ? "An account with this email already exists." : createError.message;
          return fail(400, msg);
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
          return fail(400, msg);
        }
        return Response.json({ ok: true, user_id: newId });
      }

      // -------------------------------------------------------------
      // 6b. Deactivate (ban) or activate (un-ban) an account
      // -------------------------------------------------------------
      if (body.action === "set_active") {
        const userId = String(body.user_id || "");
        if (!/^[0-9a-f-]{36}$/i.test(userId)) return fail(400, "A valid user_id is required.");
        if (userId === user.id && body.active === false) return fail(400, "You cannot deactivate your own account.");
        // 876000h ≈ 100 years, i.e. blocked until an admin activates the account again
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: body.active ? "none" : "876000h" });
        if (error) return fail(400, error.message);
        return Response.json({ ok: true });
      }

      // -------------------------------------------------------------
      // 6c. Which accounts are deactivated? (so the page shows the right button)
      // -------------------------------------------------------------
      if (body.action === "list_status") {
        const banned = {};
        for (let page = 1; ; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) return fail(500, error.message);
          data.users.forEach((u) => {
            if (u.banned_until && new Date(u.banned_until) > new Date()) banned[u.id] = true;
          });
          if (data.users.length < 1000) break;
        }
        return Response.json({ ok: true, banned });
      }

      return fail(400, "Unknown action.");
    } catch (e) {
      return fail(500, e.message || "Server error.");
    }
  }
};
