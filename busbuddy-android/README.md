# BusBuddy – Android app (WebView)

A ready-to-build Android Studio project that shows the BusBuddy website in a WebView.

It is the **offline version**: the website is packed inside the app, so it runs in demo mode
with no Supabase or Vercel. You don't copy the website by hand. On every build, the `copyWebsite`
task in `app/build.gradle.kts` copies the pages, `css/` and `js/` from `../busbuddy-web` into the
app as `assets/www/`. Edit the site in `busbuddy-web/`, press Run, and the app has the new version.

## Run it on your phone

1. Android Studio → **File → Open** → choose this `busbuddy-android` folder. Wait for the Gradle sync to finish.
2. On the phone: **Settings → About phone** → tap **Build number** 7 times, then
   **Settings → System → Developer options → USB debugging** = on.
3. Connect the phone by USB and allow the computer when the phone asks.
4. Pick the phone in the device list at the top of Android Studio and press **Run ▶**.
5. Allow **location** when the app asks (the driver page needs it).

Demo logins (any password): `rami@busbuddy.test` passenger · `driver@busbuddy.test` driver · `admin@busbuddy.test` admin.

Without Android Studio, from this folder:
```
gradlew assembleDebug
```
This builds `app/build/outputs/apk/debug/app-debug.apk`, which you can copy to the phone and install.

## Release version (install without Android Studio)

```
gradlew assembleRelease
```
This builds a signed `app/build/outputs/apk/release/app-release.apk`. A copy of the first one is in `dist/BusBuddy-1.0.apk`.
Copy the APK to the phone, open it, and allow "Install unknown apps" for the app you opened it with.

The build signs it with the key in `keystore/busbuddy-release.jks`, using the passwords in `keystore.properties`.
Neither is in git. **Keep a backup of both.** Android only installs an update over the app if the update is signed with
the same key. To release an update, raise `versionCode` (and `versionName`) in `app/build.gradle.kts`.

## Good to know

- Pages are served at `https://appassets.androidplatform.net/assets/www/…` (WebViewAssetLoader). That counts as a
  secure address, so GPS and the ES-module scripts work.
- The demo data lives inside the app (WebView localStorage), separate from your PC browser. **Reset demo** starts again.
- The map background (OpenStreetMap) needs internet.
- In debug builds you can see the pages' console: open `chrome://inspect` in Chrome on the PC while the phone is connected.
- "Call" buttons open the phone's dialer. The Android back button goes back one page.

## Online version (later)

When the site is on Vercel with `DEMO_MODE: false`, change `START_PAGE` in
`app/src/main/java/com/busbuddy/webview/MainActivity.java` to `https://your-project.vercel.app/index.html`.
The app then shows the live site, and everyone shares the same Supabase data.

## Versions

Android Gradle Plugin 9.2.1 · Gradle 9.4.1 · compileSdk/targetSdk 37 · minSdk 24 (Android 7.0) · androidx.webkit 1.18.0 · appcompat 1.7.1.
