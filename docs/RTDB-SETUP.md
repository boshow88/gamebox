# Enable Realtime Database rooms

The local configuration now selects **RTDB with legacy Firestore room support**,
using the existing database URL supplied by the operator:
`https://games-7e19b-default-rtdb.asia-southeast1.firebasedatabase.app/`.
The operator reports publishing the RTDB rules. The website still needs this
code deployed and the live checks below; a local configuration change does not
update already-deployed pages. Accounts, scores, cloud migrations, feedback and
admin settings remain on Firestore after the room transport is switched.

Use the existing Firebase project, `games-7e19b`. There is no need for a second
project, different sign-in providers, a service-account key or a paid server.

## 1. Check whether the database still exists

Open [Firebase Console](https://console.firebase.google.com/), select
`games-7e19b`, then open **Realtime Database** under **Build** or
**Databases & Storage** (the Console navigation can vary).

- If the page shows **Data / Rules / Usage** and a database URL, use that existing
  database. Do not create another one based on an old remembered URL.
- If it shows **Create database**, create one in this project. Choose a location
  appropriate for the players and start in **Locked mode**. The next step supplies
  the application's actual rules.

See the official [database setup guide](https://firebase.google.com/docs/database/web/start).

## 2. Publish the RTDB rules

Open the database's **Rules** tab, replace the initial rules with the complete
contents of [`database.rules.json`](../database.rules.json), then click **Publish**.

This is the **Realtime Database Rules** editor. Keep the existing
[`firestore.rules`](../firestore.rules) in Cloud Firestore: it still protects
accounts and scores and permits existing four-character rooms to finish.

The RTDB rules deny public access and unknown roots, allow authenticated users
(including existing anonymous guest accounts) to use the two game room groups,
validate basic room metadata, and index `lastActionAt` for bounded cleanup.
They retain the project's existing honor-system room policy; they are not
server-authoritative anti-cheat rules.

The local contract tests check the JSON structure, not Firebase's rule evaluator.
Console Publish validates rule syntax; the live smoke test in step 5 confirms
the signed-in app can use them. No rules have been deployed to your project by
the local implementation.

## 3. Copy the exact database URL

Copy the URL displayed in the **Data** tab. It has one of these shapes:

```text
https://DATABASE_NAME.firebaseio.com
https://DATABASE_NAME.REGION.firebasedatabase.app
```

Copy the database URL itself, without a `/rooms` path, `.json` suffix or query.
Use the URL of the database that currently exists, not a URL inferred from the
project name or an earlier deleted database. The URL is public client
configuration, like the existing web configuration.

You can send this URL back in chat and say that the rules have been published;
the remaining configuration can then be completed for you.

## 4. Enable the room transport and deploy the site

In [`js/firebase-config.js`](../js/firebase-config.js), change only the
`FIREBASE_ROOMS` block:

```js
window.FIREBASE_ROOMS = {
    backend: 'rtdb',
    databaseURL: 'PASTE_THE_EXACT_DATABASE_URL_HERE',
    legacyFirestore: true,
};
```

Leave `FIREBASE_CONFIG` (project ID, API key, Auth domain, etc.) as it is. Commit
and deploy the complete code change together with the configured URL, using the
existing GitHub Pages workflow. No build step is required.

While `backend` is `firestore`, the RTDB URL is not used. Selecting `rtdb` with a
missing/invalid URL disables online rooms and logs an explanation; account sync
and solo play continue. Permission/network errors in RTDB are shown as errors,
not silently redirected into a second Firestore room.

## 5. Verify in two fresh tabs

1. Reload the deployed page and sign in using the existing Google/guest flow.
2. Create a Beam room. Its code must look like **`R-ABCD`**.
3. Join from a second tab. Each tab has its own player seat even with the same
   account. Ready up, start, finish a round, rematch and leave one tab.
4. Repeat for Rune Stones: both players press Ready and the game starts
   automatically. Closing either side preserves the room for the other player.
5. In RTDB's Data tab, confirm room data appears under:

   ```text
   rooms / beam_rooms / R-ABCD
   rooms / duel_rooms / R-EFGH
   ```

6. Confirm existing records and scores still appear after signing in. They remain
   under Firestore `profiles`; no score data needs to be imported into RTDB.
7. Watch the RTDB **Usage** tab (connections and downloads) and Firestore's Usage
   tab. New RTDB rooms do not perform Firestore room reads or writes. Profile
   synchronization and any still-active legacy rooms can continue using Firestore.

The client records its selected transport in `window.ArcadeNet.rooms.backend`.
That setting is not a permissions test: successfully creating/joining a room is
the live verification.

## 6. Understand compatibility and retire it after old rooms finish

The operator switch is `window.FIREBASE_ROOMS` in `js/firebase-config.js`.
`configureRooms()` in `js/net/net.js` builds each game's adapter; the common
`room-routing.mjs` selects a store from the normalized code:

| Configuration | Create | Join `ABCD` | Join `R-ABCD` |
| --- | --- | --- | --- |
| `backend: 'firestore'` | Four-character Firestore room | Firestore | Unsupported |
| `backend: 'rtdb', legacyFirestore: true` | `R-XXXX` RTDB room | Firestore | RTDB |
| `backend: 'rtdb', legacyFirestore: false` | `R-XXXX` RTDB room | Rejected | RTDB |

The selection covers subscriptions, transactions, updates and departures, not
just the initial join. There are no dual writes, live data copies, cross-store
lookup probes or fallback writes after errors. For example, `ABCD` and `R-ABCD`
are separate rooms, and an RTDB permission error cannot create a Firestore room.
RTDB-mode cleanup scans only RTDB, so abandoned Firestore documents may remain
until reviewed and removed separately.

This is **new-client support for old rooms**, not old-client support for new
rooms. A previously loaded four-character-only page cannot join `R-XXXX`. It can
still use and create Firestore rooms until refreshed or denied by server rules.
Changing a client configuration flag does not update those old pages.

- New rooms use six-character **`R-XXXX`** codes and RTDB.
- Old four-character codes continue to route directly to Firestore while
  `legacyFirestore` is `true`; the shared input accepts both formats.
- The prefixes prevent cross-database code collisions and remove the need for
  Firestore discovery probes when creating or joining new RTDB rooms.
- Already-loaded old tabs retain their old Firestore transport. Let their games
  finish and refresh/close those tabs before evaluating the final quota reduction.
- Once those rooms are no longer needed, set `legacyFirestore: false` and deploy.
  New clients then reject old codes without reading Firestore room collections.
  Accounts/scores still use Firestore normally.

For a permanent cutoff, first drain active matches and arrange for old pages to
refresh, then retire room access in **Firestore rules** for `beam_rooms` and
`duel_rooms`. Audit overlapping allow rules as well: an additional deny does not
override another matching allow. This step deliberately ends support for stale
clients and must not be applied while their matches are expected to continue.
A quiet dashboard or a few minutes without rooms is not proof that an old tab
cannot later create another one.

Once RTDB-only behavior is verified and rollback is no longer needed, a separate
cleanup change can remove the Firestore room adapter (`firebase-rooms.mjs`),
the legacy router branch (or replace the router with RTDB code validation), the
`legacyFirestore` flag, the selectable Firestore room factory branch, obsolete
room rules/indexes, and the legacy-only test cases. Back up and remove only the
old room collections when no longer needed. Keep the shared room core, game
policies, round guards, codec, native presence and RTDB tests. Keep the Firestore
SDK and account/profile APIs: those features still depend on Firestore.

Keep the `R-` room prefix after retirement. Removing it would introduce another
code-format transition without improving matchmaking or operating cost.

Do not copy live room documents between databases. These rooms are temporary,
and each active match stays on the backend where it was created. Any abandoned
Firestore room documents can be reviewed separately after the transition; no
automatic deletion of the legacy collections is performed by this migration.

## Existing Bomberman test data

The current repository has no `bomb_live` consumer. Current games use
`/rooms/beam_rooms` and `/rooms/duel_rooms`; `/bomb_live` is unrelated to the
Firestore compatibility path described above.

If the old Bomberman experiment no longer needs its data, select `/bomb_live` in
the RTDB Console **Data** tab, use **Export JSON** for that selected node, and
save the backup. Then delete that same node and confirm the displayed path.
Deleting the parent includes its children such as `3HAC` and `QCCY`; there is no
need to delete every room separately. Do not select the database root or the
new `/rooms` node. If another room's link opens only the root (`/data#`), inspect
its actual tree location before deciding whether it belongs to the old data.

Publishing the supplied root-deny rules does not delete stored data. It denies
client access to `bomb_live`; privileged Console/admin access is separate. Old
static data occupies RTDB storage, but deleting it does not reduce Firestore
document-operation usage. Do not open public access just to remove it.

See [Console data management](https://firebase.google.com/docs/database/manage-data-console)
for selected-node exports and edits.

If the Console viewer switches to read-only/non-realtime mode because this node
is too large, use the Firebase CLI instead of deleting individual descendants.
This is a viewer limitation; changing the application's security rules is not
necessary. The CLI supports chunked deletion for large nodes.

One option without a local installation is
[Google Cloud Shell](https://shell.cloud.google.com/?project=games-7e19b), which
includes the Firebase CLI and authenticates with the signed-in Google account.
Use an account with permission to administer this Firebase project, and approve
Cloud Shell authorization if prompted. No `firebase init` or deployment is needed.

First export only the old subtree:

```sh
firebase database:get /bomb_live --project games-7e19b --instance games-7e19b-default-rtdb --export --output bomb_live-backup.json
```

Wait for successful completion and download/save the backup. Only then run:

```sh
firebase database:remove /bomb_live --project games-7e19b --instance games-7e19b-default-rtdb
```

The CLI asks for confirmation; verify that the displayed database and path end
in `/bomb_live`. This removes that subtree and preserves `/rooms`. Do not replace
the path with `/`. Check completion without downloading the whole tree:

```sh
firebase database:get /bomb_live --project games-7e19b --instance games-7e19b-default-rtdb --shallow
```

The result should be `null`. If running locally instead, install the
[Firebase CLI](https://firebase.google.com/docs/cli) and run `firebase login`
with the project administrator account before these same commands.
See the official [large-node deletion guidance](https://firebase.google.com/docs/reference/rest/database#section-query-parameters).

## Room-code layout

`R-XXXX` contains six characters, including the hyphen. The factory supplies
`codeLength: 6` in RTDB mode; both games pass it to the shared lobby input, which
therefore accepts both legacy four-character codes and new six-character codes.
Firestore mode retains a four-character input. Copying and joining use the full
code, and the existing normalization still trims and uppercases input.

The shared lobby CSS handles both games. Browser checks assert that the room code
stays on one line, has no horizontal overflow, and leaves action rows inside the
card at 320px and 768px widths. They also check the input limit and preservation
of typed content, focus and selection across redraws. These are local Chrome
checks, not a claim of testing every device/font/accessibility setting.

## Rollback

Set `backend: 'firestore'` and redeploy. New/reloaded pages return to the existing
four-character Firestore flow. Already-loaded RTDB tabs continue on RTDB until
their matches finish, but reloaded Firestore-only pages cannot join `R-XXXX`
rooms. Prefer draining those matches before rolling back. Keep both rule sets;
the account data and score storage do not move during either direction.

## Local checks

No production Firebase credentials or database access are used:

```text
node tools/rooms-check.js
node tools/room-traffic-check.js
node tools/beam-room-check.js
node tools/rune-room-check.js
node tools/rtdb-room-check.js
node tools/beam-room-check.js --rtdb
node tools/rune-room-check.js --rtdb
node tools/rooms-browser-check.js
node tools/rooms-browser-check.js --rtdb
node tools/rooms-browser-check.js --invalid-rtdb
```

The RTDB fixture exercises its documented cold-cache transaction callback,
concurrent settlement, local update ordering, value serialization, native
disconnect/reconnect markers, cleanup and legacy routing. The browser checks
load real game pages with a local mock SDK, including new room codes, mobile
layout and account/room backend isolation. They are not a substitute for the
server-side rules/live-project check after configuration.

Official references: [read/write transactions](https://firebase.google.com/docs/database/web/read-and-write),
[presence/onDisconnect](https://firebase.google.com/docs/database/web/offline-capabilities),
[security rules](https://firebase.google.com/docs/database/security),
[pricing and connection/download limits](https://firebase.google.com/pricing).
