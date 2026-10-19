package com.lanz.arcade;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.os.*;
import android.view.*;
import android.webkit.*;
import java.io.InputStream;
import java.util.HashMap;

public class MainActivity extends Activity {
  private WebView web;
  static final HashMap<String,String> MIME = new HashMap<>();
  static {
    MIME.put("html","text/html"); MIME.put("js","text/javascript"); MIME.put("mjs","text/javascript"); MIME.put("css","text/css");
    MIME.put("json","application/json"); MIME.put("png","image/png"); MIME.put("jpg","image/jpeg"); MIME.put("webp","image/webp");
    MIME.put("svg","image/svg+xml"); MIME.put("woff2","font/woff2"); MIME.put("wasm","application/wasm"); MIME.put("glb","model/gltf-binary");
    MIME.put("mp3","audio/mpeg"); MIME.put("ogg","audio/ogg"); MIME.put("wav","audio/wav");
  }

  @SuppressLint("SetJavaScriptEnabled")
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    web = new WebView(this);
    web.setBackgroundColor(0xff000000);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        android.net.Uri u = r.getUrl();
        if (!"appassets.androidplatform.net".equals(u.getHost())) return null;
        String p = u.getPath();
        if (p == null || !p.startsWith("/assets/")) return null;
        p = p.substring(8);
        try {
          InputStream in = getAssets().open(p);
          String ext = p.substring(p.lastIndexOf('.') + 1).toLowerCase();
          String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
          WebResourceResponse res = new WebResourceResponse(mime, "UTF-8", in);
          HashMap<String,String> h = new HashMap<>(); h.put("Access-Control-Allow-Origin", "*"); h.put("Cache-Control", "no-cache");
          res.setResponseHeaders(h);
          return res;
        } catch (Exception e) { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null); }
      }
    });
    web.addJavascriptInterface(new Bridge(), "Android");
    setContentView(web);
    hideSystemUi();
    if (b == null) web.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    else web.restoreState(b);
  }

  private void hideSystemUi() {
    View d = getWindow().getDecorView();
    d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
  }

  @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) hideSystemUi(); }
  @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); web.saveState(o); }
  @Override protected void onPause() { super.onPause(); web.evaluateJavascript("window.__onPause&&window.__onPause()", null); web.onPause(); }
  @Override protected void onResume() { super.onResume(); web.onResume(); web.evaluateJavascript("window.__onResume&&window.__onResume()", null); }

  @Override public void onBackPressed() {
    web.evaluateJavascript("(window.__onBack?window.__onBack():false)", v -> {
      if ("true".equals(v)) return;
      if (web.canGoBack()) web.goBack(); else finish();
    });
  }

  class Bridge {
    @JavascriptInterface public void vibrate(int ms) {
      Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
      if (v != null) v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), VibrationEffect.DEFAULT_AMPLITUDE));
    }
    @JavascriptInterface public void setOrientation(String o) {
      runOnUiThread(() -> setRequestedOrientation(
          "landscape".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE :
          "portrait".equals(o) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT :
          ActivityInfo.SCREEN_ORIENTATION_FULL_USER));
    }
  }
}
