// =====================================================================
// BusBuddy settings – the ONLY file you edit to connect your project.
// Supabase dashboard → Connect (or Settings → API Keys)
// =====================================================================
window.BB_CONFIG = {
  // DEMO_MODE: true  → the site runs OFFLINE with sample data (js/demo/). No Supabase or Vercel needed.
  // DEMO_MODE: false → the site uses your real Supabase project below.
  DEMO_MODE: true,

  SUPABASE_URL: "https://YOUR-PROJECT-ID.supabase.co",
  SUPABASE_KEY: "YOUR-PUBLISHABLE-KEY",   // sb_publishable_...  (safe in the browser; never put the secret key here)

  POLL_SECONDS: 10,      // passenger map asks for new bus positions every N seconds (polling)
  SHARE_SECONDS: 10,     // driver page sends its position every 10 seconds
  STALE_MINUTES: 3,      // admin monitor highlights a bus with no update for this long
  ETA_STALE_MINUTES: 2,  // arrival times say "position may be out of date" when the bus's last update is older than this
  TIME_ZONE: "Asia/Beirut",   // every time on the site is shown in Lebanon time

  MAP_CENTER: [33.78, 35.50],   // between the Chouf and Beirut
  MAP_ZOOM: 11
};
