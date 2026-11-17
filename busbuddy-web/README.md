# BusBuddy – setup and deployment guide

BusBuddy is a bus tracking web app for commuters from the Chouf to LIU Cola.
Plain HTML, CSS and JavaScript · Supabase (database, login, security, functions) · Vercel (hosting) · Leaflet + OpenStreetMap (maps).

## 0. Demo mode (offline, no Supabase or Vercel)

`js/config.js` starts with `DEMO_MODE: true`. In this mode every page works offline with sample data
(`js/demo-data.js`): five routes, six running buses, six upcoming trips, bookings and messages.
Routes 2–5 (Baakline – Cola, Niha – Cola, Saida – Cola, Aley – Cola) come from `data/BusRoutes_edited.geojson`:
their road shape is stored in the `routes.path` column, their stops are the file's named stops along the road,
and the minutes between stops share out the file's travel time (90, 120, 60 and 39 min) by distance.
Route 1 (Chouf – LIU Cola) follows route 2's road from Damour; its Beiteddine – Deir el Qamar part is approximate.
Routes 4 and 5 and route 1's path are made by `tools/build-routes.js` (run `node tools/build-routes.js`).
Changes you make (bookings, trips, messages) are kept in the browser for 6 hours; **Reset demo** under the menu starts again.

Demo accounts (any password): `rami@busbuddy.test` passenger · `driver@busbuddy.test` driver · `admin@busbuddy.test` admin.

The map's background (OpenStreetMap tiles) needs internet; offline the map shows the routes and buses on a grey background.
Creating driver accounts and deactivating users need the Vercel function, so they only work after deployment.

When you are ready to go online, set `DEMO_MODE: false` and follow sections 2 to 6.
The Android app for the offline demo is in `android-app/` (see section 7 for the online version).

## 1. Folder structure

```
busbuddy-web/
├── index.html            Welcome page
├── login.html            Log in (passenger, driver, admin)
├── register.html         Passenger registration
├── reset-password.html   New password after the email link
├── map.html              Live bus map + ETA (public)
├── schedules.html        Routes, timetable, reserve a seat
├── bookings.html         Passenger: my bookings, cancel, call / message driver
├── messages.html         Passenger and driver chat
├── driver.html           Driver: trips, start/end, share location, delay, walk-ons
├── monitor.html          Admin: live fleet monitor
├── admin.html            Admin: buses, routes & stops, trips, accounts
├── css/style.css         One shared style for every page
├── js/config.js          YOUR Supabase URL and key (the only file you edit)
├── js/app.js             Shared code: login check, menu, map, ETA, polling
├── js/demo-data.js       Offline sample data (used when DEMO_MODE is true)
├── js/vendor/            Local copies of Leaflet 1.9.4 and supabase-js 2.118.0 (no CDN needed)
├── android-app/          MainActivity.java + layout + manifest lines for the offline Android app
├── api/admin.js          Vercel Function: create driver accounts, deactivate users
├── package.json          Lists the one library the Vercel Function needs
└── supabase/schema.sql   The whole database: tables, security rules, functions
```

## 2. Create the database (Supabase)

1. Go to <https://supabase.com>, sign in, **New project**. Choose a name (BusBuddy), a database password and the region closest to Lebanon (for example Frankfurt). Wait until it is ready.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, press **Run**. You should see "Success. No rows returned".
3. Check **Table Editor**: you should see 10 tables (users, drivers, buses, routes, stops, trips, bookings, messages, delay_reports, updated_locations) and one sample route with 5 stops.

## 3. Connect the website to Supabase

1. In Supabase open **Connect** (top of the dashboard) or **Settings → API Keys**.
2. Copy the **Project URL** and the **publishable key** (`sb_publishable_…`).
3. Paste them into `js/config.js`:
   ```js
   SUPABASE_URL: "https://abcdefgh.supabase.co",
   SUPABASE_KEY: "sb_publishable_xxxxxxxx",
   ```
   The publishable key is meant to be in the browser; the security rules in `schema.sql` protect the data.
   **Never** put the secret key (`sb_secret_…`) in any file inside `js/`.

## 4. Run it on your computer

Open the folder in VS Code → right-click `index.html` → **Open with Live Server**
(or run `npx serve` in the folder). Don't double-click the files: logging in and the GPS need a real `http://localhost` address.

## 5. Create the first accounts

1. Open `register.html` and register yourself.
2. Make yourself the administrator: Supabase → SQL Editor → run
   ```sql
   update public.users set type = 'admin' where email = 'your@email.com';
   ```
3. Log in again → you land on the admin **Monitor**. In **Manage**:
   - **Accounts**: make a registered user a driver (with a licence number), or create a driver account directly (this needs step 6, Vercel).
   - **Buses**: add a bus and choose its driver.
   - **Routes & stops**: check the sample stops; click the map to move or add stops.
   - **Trips**: create a trip (route + bus + driver + departure time).
4. Log in as the driver on a phone → **Start trip** → the bus appears on `map.html` for everyone.

> If Supabase asks new users to confirm their email (Authentication → Sign In / Providers → Email → "Confirm email"),
> registration shows "Check your email". For the demo you may turn confirmation off.

## 6. Put it online (Vercel)

1. Put the folder in a GitHub repository (GitHub Desktop or `git push`).
2. <https://vercel.com> → **Add New → Project** → import the repository → **Deploy** (no build settings needed).
3. Vercel → Project → **Settings → Environment Variables**, add (then **Redeploy**):
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Project URL |
   | `SUPABASE_SECRET_KEY` | the **secret** key from Supabase → Settings → API Keys (`sb_secret_…`) |
   The secret key lives only on Vercel's server, inside `api/admin.js`.
4. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://your-project.vercel.app`
   - **Redirect URLs**: add `https://your-project.vercel.app/reset-password.html`, `https://your-project.vercel.app/login.html`
     and, for testing, `http://127.0.0.1:5500/**`.

The site is served over HTTPS by Vercel, which the GPS (Geolocation API) requires.

## 7. Android app (WebView)

The Android app shows this same website, so the login, data and pages are shared – there is no separate login API.
The pages already avoid `alert()`/`confirm()` popups and work at phone width. In Android Studio:

**AndroidManifest.xml** (inside `<manifest>`):
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

**MainActivity.java** (layout `activity_main.xml` has one `<WebView android:id="@+id/web" …/>` filling the screen):
```java
package com.example.busbuddy;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.*;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

public class MainActivity extends AppCompatActivity {
    private static final String SITE = "https://your-project.vercel.app/login.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // keeps GPS sharing alive for drivers

        // Ask Android for the location permission (needed by driver.html)
        ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, 1);

        web = findViewById(R.id.web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);      // the pages are JavaScript
        s.setDomStorageEnabled(true);      // Supabase keeps the login session in localStorage
        s.setGeolocationEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " BusBuddyApp"); // lets the site know it runs in the app

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("tel".equals(url.getScheme())) {           // "Call driver" / "Call" buttons
                    startActivity(new Intent(Intent.ACTION_DIAL, url));
                    return true;
                }
                return false;                                   // every other link stays in the app
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);           // let the site use the GPS
            }
        });

        // Android back button goes back one page inside the site
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack(); else finish();
            }
        });

        web.loadUrl(SITE);
    }
}
```

## 8. Before the demo

- Supabase free projects **pause after 1 week without activity** – open the dashboard a day before the defense.
- Create test accounts: 1 admin, 1 driver (with a bus), 2 passengers, and a trip departing a few hours later.
- Test the driver page on a real phone outdoors (GPS works best outside).

## 9. Free-plan limits (enough for the project)

Supabase Free: 500 MB database, 50,000 monthly active users, 5 GB egress. Vercel Hobby: non-commercial use, 100 GB transfer.
One driver sending a position every 10 s for a 1-hour trip = 360 small rows.
