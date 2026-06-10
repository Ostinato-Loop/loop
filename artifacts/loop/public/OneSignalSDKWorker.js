/**
 * Loop — OneSignal Service Worker entry point
 * PUSH-001 (2026-06-10)
 *
 * OneSignal manages all push delivery through this file.
 * Our sw.js continues to handle app shell caching separately.
 * Both service workers coexist without conflict.
 */
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
