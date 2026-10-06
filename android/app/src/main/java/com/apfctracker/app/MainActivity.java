package com.apfctracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Phase 2 — registers the native low-latency stylus ink plugin (see NativeInkPlugin's own
    // header). Capacitor's documented convention is to register plugins before calling
    // super.onCreate().
    //
    // Phase 10 — registers the JARVIS Android local AI runtime proof-of-integration plugin (see
    // LocalLlamaPlugin's own header). Purely additive: the NativeInkPlugin registration above is
    // untouched, per this phase's own "Native Ink is sacred" rule.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeInkPlugin.class);
        registerPlugin(LocalLlamaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
