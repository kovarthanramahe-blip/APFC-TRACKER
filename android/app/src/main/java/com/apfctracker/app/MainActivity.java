package com.apfctracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Phase 2 — registers the proof-of-concept native low-latency stylus ink plugin (see
    // NativeInkPlugin's own header). Capacitor's documented convention is to register plugins
    // before calling super.onCreate().
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeInkPlugin.class);
        super.onCreate(savedInstanceState);
        // UI audit — the WebView's WebSettings has its own text-size multiplier, driven by the
        // device's OS-level font-scale accessibility setting, entirely separate from CSS
        // text-size-adjust (set in src/index.css). Left at its default, a device with a >100%
        // system font scale (common on tablets) renders every label larger than the same CSS
        // produces on desktop/web, which is the primary reason the Android APK's UI has not
        // matched the web app's layout. Pinning it to 100% makes the APK render text at the size
        // its CSS actually specifies, same as a normal desktop browser. Only available after
        // super.onCreate() constructs the Bridge/WebView; never touches touch/stylus dispatch.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
