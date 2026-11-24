// =====================================================================
// api – the ONLY way pages read or change data:  BB.api.bookSeat(3, 2), …
//
// It picks the backend from js/config.js:
//   DEMO_MODE: true  → DemoBackend     (offline sample data, js/demo/)
//   DEMO_MODE: false → SupabaseBackend (the real database, supabase/schema.sql)
// Both have exactly the same functions, return the same fields and throw the
// same error messages, so switching to the real database needs NO page changes.
// The full list of functions is in supabase-backend.js.
// =====================================================================
import { SupabaseBackend } from "./supabase-backend.js";
import { DemoBackend } from "./demo-backend.js";

// connection = core/connection.js (it holds the client and knows the mode).
// Returns null while config.js still has placeholder keys (the setup banner explains).
export function createApi(connection) {
  if (!connection.db) return null;
  return connection.demo ? new DemoBackend(connection.db) : new SupabaseBackend(connection.db);
}
