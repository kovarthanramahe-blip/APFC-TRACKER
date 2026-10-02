package com.apfctracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Phase 2 — registers the native low-latency stylus ink plugin (see NativeInkPlugin's own
    // header). Capacitor's documented convention is to register plugins before calling
    // super.onCreate().
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeInkPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
