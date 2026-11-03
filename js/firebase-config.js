/*
 * Firebase web config for GameBox accounts and online rooms.
 *
 * These values are PUBLIC by design — they ship to every browser. Security is
 * enforced by Firebase Security Rules + authentication, NOT by hiding this key.
 * It is safe to commit this file.
 *
 * Sign-in: Google (primary) + Anonymous guest fallback. Firestore rules live in
 * `firestore.rules`; RTDB room rules live in `database.rules.json`.
 * Authorized domains must include localhost + boshow88.github.io.
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
};

// Rooms use RTDB. Account records and scores remain in Firestore.
// Console rules must match database.rules.json; see docs/ROOMS.md.
// Players use XXXX codes; the adapter preserves R-XXXX storage keys and rules.
window.FIREBASE_ROOMS = {
    databaseURL: 'https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app/',
};

// Convenience flag the game checks before offering online play.
window.FIREBASE_READY = !!(window.FIREBASE_CONFIG.apiKey && window.FIREBASE_CONFIG.apiKey.indexOf('REPLACE') === -1);
