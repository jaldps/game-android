package com.clearplay.arcade;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
  static final String ORIGIN = "https://appassets.androidplatform.net/";
  WebView web;

  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (Build.VERSION.SDK_INT >= 28) getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    web = new WebView(this);
    web.setBackgroundColor(Color.BLACK);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setCacheMode(WebSettings.LOAD_NO_CACHE);
    web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    web.addJavascriptInterface(new Bridge(), "AndroidHost");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        String url = r.getUrl().toString();
        if (!url.startsWith(ORIGIN)) return null;
        String path = r.getUrl().getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.endsWith("/")) path += "index.html";
        try {
          InputStream in = getAssets().open(path.substring(1));
          Map<String,String> h = new HashMap<>();
          h.put("Access-Control-Allow-Origin", "*");
          h.put("Cache-Control", "no-cache");
          return new WebResourceResponse(mime(path), mime(path).startsWith("text") || path.endsWith(".js") || path.endsWith(".json") ? "utf-8" : null, 200, "OK", h, in);
        } catch (Exception e) {
          return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<>(), null);
        }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        return !r.getUrl().toString().startsWith(ORIGIN);
      }
    });
    setContentView(web);
    hideBars();
    web.loadUrl(ORIGIN + "index.html");
  }

  static String mime(String p) {
    p = p.toLowerCase();
    if (p.endsWith(".html")) return "text/html";
    if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
    if (p.endsWith(".css")) return "text/css";
    if (p.endsWith(".json")) return "application/json";
    if (p.endsWith(".png")) return "image/png";
    if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
    if (p.endsWith(".webp")) return "image/webp";
    if (p.endsWith(".svg")) return "image/svg+xml";
    if (p.endsWith(".ogg")) return "audio/ogg";
    if (p.endsWith(".mp3")) return "audio/mpeg";
    if (p.endsWith(".wav")) return "audio/wav";
    if (p.endsWith(".glb")) return "model/gltf-binary";
    if (p.endsWith(".wasm")) return "application/wasm";
    if (p.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  }

  void hideBars() {
    if (Build.VERSION.SDK_INT >= 30) {
      WindowInsetsController c = getWindow().getInsetsController();
      if (c != null) { c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
    } else {
      getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }
  }

  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideBars(); }
  @Override protected void onPause() { super.onPause(); web.evaluateJavascript("window.dispatchEvent(new Event('hostpause'))", null); web.onPause(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); web.evaluateJavascript("window.dispatchEvent(new Event('hostresume'))", null); }
  @Override public void onBackPressed() {
    web.evaluateJavascript("(window.__onBack && window.__onBack()) ? 'handled' : 'no'", v -> {
      if (v != null && v.contains("handled")) return;
      String u = web.getUrl();
      if (u != null && !u.equals(ORIGIN + "index.html")) web.loadUrl(ORIGIN + "index.html"); else finish();
    });
  }

  class Bridge {
    @JavascriptInterface public void setOrientation(String o) {
      runOnUiThread(() -> setRequestedOrientation("landscape".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE : "portrait".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
    }
    @JavascriptInterface public void vibrate(int ms) {
      Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (v == null) return;
      if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE)); else v.vibrate(ms);
    }
    @JavascriptInterface public void exitGame() { runOnUiThread(() -> web.loadUrl(ORIGIN + "index.html")); }
  }
}
