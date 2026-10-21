/*
 * Firebase web config for online PvP (Rune Stones room matchmaking).
 *
 * These values are PUBLIC by design — they ship to every browser. Security is
 * enforced by Firestore Security Rules + anonymous auth, NOT by hiding this key.
 * It is safe to commit this file.
 *
 * Sign-in: Google (primary) + Anonymous guest fallback. Firestore rules live in
 * `firestore.rules`; authorized domains must include localhost + boshow88.github.io.
 *
 * If Firebase ever fails to load (offline), PvP simply stays disabled and the
 * vs-AI duel keeps working — online play is strictly additive.
 */
window.FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDGlukYB9toWL1H_K4yHjsLLb3vJgyr-lM',
    authDomain: 'games-7e19b.firebaseapp.com',
    projectId: 'games-7e19b',
    storageBucket: 'games-7e19b.firebasestorage.app',
    messagingSenderId: '702001155215',
    appId: '1:702001155215:web:98988e28348c4bed8474fa',
    // Realtime Database (Bomber's realtime input relay). MUST match the URL shown when you
    // create the database in the Firebase console. Pick a nearby region for low latency —
    // asia-southeast1 (Singapore) is closest to us. If the console gives a different URL
    // (e.g. the US default https://games-7e19b-default-rtdb.firebaseio.com), use that instead.
    databaseURL: 'https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app',
};

// Convenience flag the game checks before offering online play.
window.FIREBASE_READY = !!(window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey.indexOf('REPLACE') === -1);
