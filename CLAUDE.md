# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BusBuddy: a bus-tracking web app for commuters from the Chouf to LIU Cola (a student project). All code lives in `busbuddy-web/`. It uses plain HTML/CSS/JavaScript with no build step, no bundler, no framework and no test suite. The backend is Supabase (Postgres, Auth, RLS, SQL functions). The site is hosted on Vercel and has one serverless function. Maps use Leaflet 1.9.4 with OpenStreetMap tiles. `busbuddy-web/README.md` is the setup and deployment guide.

## Running

- Serve `busbuddy-web/` over HTTP (`npx serve` from inside it, or VS Code Live Server). Don't open the files with `file://`, because auth and geolocation need a real `http://localhost` origin.
- `js/config.js` ships with `DEMO_MODE: true`, so every page runs offline on sample data with no Supabase needed. Demo logins accept any password: `rami@busbuddy.test` (passenger), `driver@busbuddy.test` (driver), `admin@busbuddy.test` (admin).
- The database lives entirely in `supabase/schema.sql`. It is written for a **new, empty** project: paste it into the Supabase SQL Editor and run it. It is not a migration and is not idempotent.
- `package.json` only exists so that Vercel installs `@supabase/supabase-js` for `api/admin.js`. The front end does not use npm.

## Architecture

**Page structure.** The HTML pages stay at the root of `busbuddy-web/` on purpose. The Supabase redirect URLs, the Android start page and the `?next=` check in login (which rejects any path containing `/`) all depend on those URLs. Each page loads these scripts in this order:
`js/vendor/supabase.js` → (`js/vendor/leaflet/leaflet.js` on map pages) → `js/config.js` (classic script, sets `window.BB_CONFIG`) → `<script type="module" src="js/pages/<page>-page.js">`.
Each page module defines `class XxxPage extends Page` (from `js/pages/page.js`) with an `async init()` and ends with `XxxPage.mount()`. Page-only CSS lives in `css/pages/<page>.css`, linked right after `css/style.css`. Vendor libraries are local copies, not CDN links. The JavaScript uses ES modules, so it never works over `file://`.

**`js/core/bb.js` exports `BB`** (also set as `window.BB`). It is a facade over the classes in `js/core/` (`Dom`, `Format`, `Ui`, `Connection`, `Session`, `NavBar`, `Banners`, `Poller`, `MapKit`, `Eta`). Page modules `import { BB } from "../core/bb.js"`. Some functions on `BB` are static methods passed around on their own (pages write `const $ = BB.$`), so static helpers must not use `this`. Inside a class they refer to the class by name. The shared layer every page uses:
- `BB.db`: either the real Supabase client or the demo mock client (see below). Page code always calls `BB.db.from(...)` / `BB.db.rpc(...)` and never checks which mode it is in.
- `BB.ready(fn)` wraps page start-up (it shows the setup/demo banner and turns errors into toasts). `BB.requireRole([...])` guards protected pages and redirects by role using `BB.HOME`. `BB.renderNav(activePage)` fills `<header id="topbar">` with links chosen per role (the `NAV` table).
- `BB.poll(fn, seconds)` is how the app gets live updates. It uses polling, not Supabase Realtime, and pauses while the tab is hidden.
- `BB.computeEta` estimates arrival times: haversine distance × 1.3 road factor ÷ current speed, falling back to the scheduled `minutes_from_start`, plus any reported delay.
- UI helpers: `BB.toast`, `BB.confirmBox`, `BB.show`, `BB.busy`, `BB.esc`. **Do not use `alert()`/`confirm()`/`prompt()`**, because they don't show in the Android WebView. Always pass user data through `BB.esc` before putting it into `innerHTML`.

**Business logic lives in Postgres.** Pages read reference tables directly (routes, stops, trips and so on, protected by RLS), but every write and multi-table read goes through `SECURITY DEFINER` SQL functions in `schema.sql`, such as `book_seat`, `start_trip`, `share_location`, `get_live_buses` and `admin_fleet`. These functions check the caller's role and raise plain-English errors, which `BB.errText` shows as-is (it strips a `FULL:` prefix, which `schedules.html` uses to offer the next available trip). New behaviour normally means a new SQL function plus a `BB.db.rpc` call.

**Demo mode mirrors the backend. Keep the two in sync.** `js/demo/` is a fake Supabase client, chosen by `core/connection.js` when `DEMO_MODE` is true. It is made of:
- `DemoClient`: `from` / `rpc` / `auth`.
- `DemoQuery`: the chainable query builder.
- `DemoRpc`: one method per SQL function, with the **same name and columns** as in `schema.sql`.
- `DemoStore`: the tables and lookup helpers, kept in `localStorage` (`bb_demo_db`, `mock_user`) for about 6 hours.
- `demo-fixtures.js`: the sample data.

When you add or change an SQL function or the columns it returns, make the same change in `DemoRpc`, or the page will break in demo mode. Every method on `DemoRpc` can be called as an RPC, so helper methods go in `DemoStore`.

**Roles** are stored in `public.users.type` (`passenger` | `driver` | `admin`). A trigger on `auth.users` creates a `public.users` row for every new account as a passenger. Promotions happen through `admin_set_role`.

**`api/admin.js`** is a thin Vercel Function entry (`export default { fetch }`) that delegates to `api/_lib/`: `AdminController` validates the request and the caller, and `AdminService` runs the actions. Vercel does not turn `_`-prefixed paths into routes. Validation failures are thrown as `HttpError(status, message)`. The function holds `SUPABASE_SECRET_KEY` and handles the actions that need the secret key: `create_driver`, `set_active` (ban/unban) and `list_status`. It checks the caller's bearer token and admin role itself, because the secret key bypasses RLS. It does not run in demo mode or on a local static server. Only `admin.html` calls it. The secret key must never appear anywhere under `js/`. Only the publishable key belongs in `config.js`.

**Android.** `busbuddy-android/` (at the repo root, next to `busbuddy-web/`) is the buildable Android Studio project: AGP 9.2.1, Gradle 9.4.1, compileSdk 37, minSdk 24, Java. It is the **offline** WebView app. The `copyWebsite` task in `app/build.gradle.kts` copies `*.html`, `css/` and `js/` from `../busbuddy-web` into the generated assets as `www/` on every build, so never copy the site in by hand. `MainActivity` serves those assets at `https://appassets.androidplatform.net/assets/www/` through `WebViewAssetLoader`. Build it with `gradlew assembleDebug` from `busbuddy-android/` (set `JAVA_HOME` to Android Studio's `jbr`). `busbuddy-web/android-app/` is the older copy-paste reference version of the same code. README §7 shows the **online** version, which loads the Vercel URL. The app appends `BusBuddyApp` to the user agent, which `BB.inApp` detects, and it hands `tel:` links to the phone dialer. Pages must keep working at phone width.

## Conventions

- Code and comments are written for beginners and explain the "why". Keep that style and the plain-English error messages.
- Phone numbers are validated as Lebanese: `+961` followed by 7–8 digits.
- Tunables live in `BB_CONFIG` (`POLL_SECONDS`, `SHARE_SECONDS`, `STALE_MINUTES`, `MAP_CENTER`, `MAP_ZOOM`), not in page code.
