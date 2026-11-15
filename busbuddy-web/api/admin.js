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
//
// The code is in api/_lib/:
//   admin-controller.js  checks the request and the caller's role
//   admin-service.js     the three actions
//   http.js              HttpError + JSON error helper
// =====================================================================
import { AdminController } from "./_lib/admin-controller.js";

export default {
  fetch(request) {
    return AdminController.handle(request);
  }
};
