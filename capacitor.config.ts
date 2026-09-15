import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apfctracker.app',
  appName: 'APFC Tracker',
  webDir: 'dist',
  server: {
    url: 'https://apfc-tracker.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
