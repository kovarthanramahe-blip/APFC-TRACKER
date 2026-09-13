import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

// Google blocks OAuth inside embedded WebViews, which is what a plain
// Capacitor app uses — so on native we send the whole flow through the
// system browser instead, and catch the final redirect via a custom URL
// scheme deep link (registered in AndroidManifest.xml and in Supabase's
// Redirect URLs) rather than relying on window.location.
export const isNativePlatform = Capacitor.isNativePlatform();
export const NATIVE_REDIRECT_URL = 'com.apfctracker.app://callback';

export async function signInWithGoogleNative() {
  if (!supabase) return;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error('Native Google sign-in failed:', error ?? 'No OAuth URL returned');
    throw error ?? new Error('Could not start Google sign-in.');
  }
  await Browser.open({ url: data.url });
}

function parseTokensFromUrl(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * Mount once at the app level (not per-page): listens for the OS handing
 * our custom-scheme URL back to the app after the system browser finishes
 * the Google OAuth + Supabase redirect, and turns it into a real session.
 */
export function useNativeAuthBridge() {
  useEffect(() => {
    if (!isNativePlatform || !supabase) return;
    const client = supabase;

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT_URL)) return;
      const tokens = parseTokensFromUrl(url);
      if (tokens) {
        await client.auth.setSession(tokens);
      }
      await Browser.close().catch(() => {});
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);
}
