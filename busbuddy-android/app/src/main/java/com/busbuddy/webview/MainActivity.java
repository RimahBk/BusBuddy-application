package com.busbuddy.webview;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * BusBuddy Android app = a WebView that shows the BusBuddy website.
 * OFFLINE version: the website files are inside the app (the build copies
 * ../busbuddy-web into the assets as www/). WebViewAssetLoader serves them at
 * https://appassets.androidplatform.net/assets/www/... so the pages behave like
 * a real secure website (login session, GPS, ES modules, links all work).
 *
 * Later, when the site is on Vercel, change START_PAGE to
 * "https://your-project.vercel.app/index.html".
 */
public class MainActivity extends AppCompatActivity {

    private static final String START_PAGE = "https://appassets.androidplatform.net/assets/www/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // 1. Keep the screen on, so the driver's GPS sharing doesn't stop
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 2. Ask Android for location permission (used by driver.html)
        ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION}, 1);

        // 3. Serve the files in app/src/main/assets/ under https://appassets.androidplatform.net/assets/
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        // Debug builds only: lets you open chrome://inspect on the PC to see the pages' console
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // 4. WebView settings the pages need
        web = findViewById(R.id.web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);    // the pages are JavaScript
        s.setDomStorageEnabled(true);    // login session and demo data are kept in localStorage
        s.setGeolocationEnabled(true);   // GPS for the driver page
        s.setUserAgentString(s.getUserAgentString() + " BusBuddyApp");   // tells the site it runs inside the app

        web.setWebViewClient(new WebViewClient() {
            // Load our own files from the assets folder
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            // "Call driver" / "Call" buttons open the phone's dialer
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("tel".equals(url.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_DIAL, url));
                    return true;
                }
                return false;   // every other link stays inside the app
            }
        });

        // 5. Let the website use the GPS when it asks
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        // 6. Android back button = go back one page inside the site
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack(); else finish();
            }
        });

        // Rotating the phone keeps the same page (configChanges in the manifest),
        // so only load the start page when the activity is created fresh
        if (savedInstanceState == null) web.loadUrl(START_PAGE);
    }
}
