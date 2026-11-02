# Realtime Database rooms

Beam and Rune Stones now use RTDB exclusively. The Firestore room transport and
four-character room compatibility have been removed. Existing RTDB rooms and
their `R-XXXX` codes continue unchanged. Firebase Auth, account records/scores,
admin settings and feedback retain their existing Auth/Firestore storage.

## Finish retiring Firestore rooms

The following steps complete the server-side cutoff. A website deployment alone
does not publish Firebase rules, and already-loaded old clients retain their old
JavaScript until refreshed.

1. Deploy this code through the existing GitHub Pages branch-based deployment.
   Refresh or close old game tabs. New clients only use RTDB rooms.
2. In Firebase Console, select `games-7e19b`, open **Firestore Database > Rules**,
   replace the complete rules with [`firestore.rules`](../firestore.rules), and
   publish. This file no longer permits `beam_rooms` or `duel_rooms`; unmatched
   paths are denied. Existing profile, admin and feedback rules remain intact.
   Old clients will lose Firestore room access and should reload the website.
3. Verify both games with the two-tab checks below and confirm profile records
   still load. Publishing rules ends access to active Firestore matches, so do
   not expect an old four-character room to continue after this cutoff.
4. If old room data is no longer needed, back up and remove only the Firestore
   collections `beam_rooms` and `duel_rooms` from the Console. Rule publication
   does not delete documents. This code does not delete production data.

No RTDB rule change is needed for this retirement: [`database.rules.json`](../database.rules.json)
already uses the current paths and `R-XXXX` format. Do not remove either database
or change Firestore account collections. There is no `legacyFirestore` flag,
backend selector or built-in Firestore room rollback anymore. Reintroducing that
transport would require restoring compatible code and rules together.

## Configure RTDB in a new environment

Use the same Firebase project as the existing Auth/Firestore configuration.
Check **Realtime Database > Data** for the existing database URL; create a new
database in Locked mode only if no database exists. Publish the complete contents
of [`database.rules.json`](../database.rules.json) in **Realtime Database > Rules**.
This is separate from the Firestore Rules editor above.

The supplied rules allow authenticated users, including existing anonymous guest
accounts, to use `/rooms/beam_rooms` and `/rooms/duel_rooms`. They validate basic
room metadata and index `lastActionAt` for cleanup. The project's existing
honor-system room policy remains; these are not server-authoritative anti-cheat
rules. Unknown roots are denied. Local JSON checks do not evaluate server rules.

The public URL is configured in [`js/firebase-config.js`](../js/firebase-config.js):

```js
window.FIREBASE_ROOMS = {
    databaseURL: 'https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app/',
};
```

Use the exact Console URL, without a `/rooms` path, `.json` suffix or query.
Account/project configuration remains in `FIREBASE_CONFIG`. A missing/invalid
room URL disables online rooms while account sync and solo play continue.
RTDB permission/network errors propagate to the caller; they cannot select a
different database or create a fallback room. Deploy all changed modules together.

## Verify in two fresh tabs

1. Reload the deployed page and sign in through the existing Google/guest flow.
2. Create a Beam room, confirm a code such as `R-ABCD`, and join from a second
   tab. Same-account tabs must occupy separate seats. Test readiness, starting,
   finishing, same-room rematch, leave/rejoin and disconnect recovery.
3. Repeat with Rune Stones. Both players ready up to start automatically. A
   surviving player retains the room when the other leaves or disconnects.
4. Confirm RTDB data appears under `rooms/beam_rooms/R-ABCD` or
   `rooms/duel_rooms/R-EFGH`. Existing RTDB rooms need no migration.
5. Check account records/scores still appear; they remain in Firestore profiles.
6. Old four-character room codes must fail to join. After publishing Firestore
   rules, a stale Firestore client must no longer be able to read or write rooms.
7. Observe RTDB Usage for connections/downloads and Firestore Usage for accounts.
   Current room clients perform no Firestore room operations. Server rule changes
   are needed to stop stale clients from continuing the old transport.

`window.ArcadeNet.rooms.backend` reports `rtdb`. Successful room creation/joining
is the permissions test; the reported backend alone is not.

## Why keep the room prefix?

The `R-` prefix is now a stable room-code format, not a database selector.
Removing it offers no matchmaking or quota benefit and would require a second
format/rules migration for already-open pages and existing rooms. It stays in
place, with six-character input/copy support and narrow-screen layout checks.

## Local checks

No production Firebase access is used:

```text
node tools/rooms-check.js
node tools/room-traffic-check.js
node tools/beam-room-check.js
node tools/rune-room-check.js
node tools/rtdb-room-check.js
node tools/rooms-browser-check.js
node tools/rooms-browser-check.js --invalid-rtdb
```

These check real game/service code against local RTDB SDK fixtures, including
cold caches, transactions, serialization, presence, settlement, cleanup, retired
code rejection, lobby layout and independent account storage. They do not replace
server rules/live-project verification.

Official references: [setup](https://firebase.google.com/docs/database/web/start),
[transactions](https://firebase.google.com/docs/database/web/read-and-write),
[presence](https://firebase.google.com/docs/database/web/offline-capabilities),
[RTDB rules](https://firebase.google.com/docs/database/security),
[Firestore rules](https://firebase.google.com/docs/firestore/security/get-started).
