import { useEffect } from 'react';
import { create } from 'zustand';
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

export type NativeAuthStatus = 'idle' | 'pending' | 'error';

// Ephemeral (not persisted) — mirrors the useSyncStatus pattern in
// cloudSync.ts. The actual OAuth completion happens asynchronously in the
// appUrlOpen listener below, a separate boundary from the signInWithGoogle
// call the UI awaits, so this is how that listener reports success/failure
// back to AccountCard.
export const useNativeAuthStatus = create<{ status: NativeAuthStatus; error: string | null }>(() => ({
  status: 'idle',
  error: null,
}));

export async function signInWithGoogleNative() {
  if (!supabase) return;
  useNativeAuthStatus.setState({ status: 'pending', error: null });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT_URL, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    console.error('Native Google sign-in failed:', error ?? 'No OAuth URL returned');
    const message = 'Could not start Google sign-in.';
    useNativeAuthStatus.setState({ status: 'error', error: message });
    throw error ?? new Error(message);
  }
  await Browser.open({ url: data.url });
  // Status stays 'pending' until the appUrlOpen listener below resolves it.
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
      // Safe diagnostic only — never logs the full URL or any token/code value,
      // just structural facts needed to see where the callback is diverging.
      const matchesRedirect = url.startsWith(NATIVE_REDIRECT_URL);
      const hashIndex = url.indexOf('#');
      const hasFragment = hashIndex !== -1;
      let protocol = '';
      let host = '';
      let pathname = '';
      let paramNames: string[] = [];
      try {
        const parsed = new URL(url);
        protocol = parsed.protocol;
        host = parsed.host;
        pathname = parsed.pathname;
        const searchNames = Array.from(parsed.searchParams.keys());
        const hashNames = hasFragment ? Array.from(new URLSearchParams(url.slice(hashIndex + 1)).keys()) : [];
        paramNames = Array.from(new Set([...searchNames, ...hashNames]));
      } catch (err) {
        console.error('Native Google sign-in: failed to parse callback URL.', err);
      }
      console.error('Native Google sign-in: appUrlOpen received.', { matchesRedirect, protocol, host, pathname, hasFragment, paramNames });

      if (!matchesRedirect) return;
      try {
        const tokens = parseTokensFromUrl(url);
        console.error('Native Google sign-in: token parse result.', { tokensFound: Boolean(tokens) });
        if (!tokens) {
          useNativeAuthStatus.setState({ status: 'error', error: 'Google sign-in did not complete. Please try again.' });
          return;
        }
        try {
          await client.auth.setSession(tokens);
          console.error('Native Google sign-in: setSession succeeded.');
          useNativeAuthStatus.setState({ status: 'idle', error: null });
        } catch (err) {
          console.error('Native Google sign-in: setSession failed.', err);
          useNativeAuthStatus.setState({ status: 'error', error: 'Could not complete Google sign-in. Please try again.' });
        }
      } finally {
        await Browser.close().catch(() => {});
      }
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);
}
