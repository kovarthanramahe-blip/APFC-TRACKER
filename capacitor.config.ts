import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apfctracker.app',
  appName: 'APFC Tracker',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
