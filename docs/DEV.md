# Developer notes

How this collection is put together, the conventions to follow, and how
to add another game. For per-game *rules* see [`rules.md`](rules.md).

> **Scope.** Shared development conventions, launcher/account features and game
> implementation notes. The **Arcade engine** is `js/arcade.js`
> (`window.ArcadeCommon`); the **Puzzle engine** is `js/puzzle.js`
> (`window.PuzzleCommon`). Shared base + both themes live in `css/common.css`
> (scoped under `[data-theme]`); arcade page chrome is `css/arcade.css`.
> See [Shared conventions](#shared-conventions) for house style and
> [`DEBUG.md`](DEBUG.md) for dev tools / logging.

## Documentation ownership

Keep maintained documentation in these five files:

| Document | Owns |
| --- | --- |
| [DEV.md](DEV.md) | Architecture, shared conventions and implementation details |
| [DEBUG.md](DEBUG.md) | Test commands, local fixtures and debugging/reset procedures |
| [rules.md](rules.md) | Current player-facing game rules and controls |
| [ROOMS.md](ROOMS.md) | Shared online-room API, policies and Firebase deployment |
| [UNSHACKLE.md](UNSHACKLE.md) | The isolated 3D engine, generation and compatibility contracts |

Update the relevant section when implementing a feature. Do not create a separate
feature diary or retain a completed follow-up spec. Tests document expected
behavior; these files explain ownership, contracts and how to run those tests.
Create another document only when a substantial independent system needs its own
maintained reference. Link to the owning section instead of copying setup or rules.

## Philosophy

- **No build step.** Plain HTML/CSS/JS. It runs from `file://`,
  `python -m http.server`, or GitHub Pages with no tooling.
- **Framework-free.** Everything shared lives on one global,
  `window.ArcadeCommon` (`js/arcade.js`), created by an IIFE.
- **Offline-capable.** No CDNs. Icons are an inlined subset of Lucide;
  sound is synthesised with WebAudio (no asset files).
- **Relative paths everywhere**, so the site can live at any base URL.
- **Each game owns its own HUD + scoring.** The shared chrome only
  provides the lifecycle, overlay, loop and a generic high-score store —
  it never hard-codes a game's stats. A game defines whatever HUD pills
  it wants in its own page and updates them itself.

## File layout

```
index.html                   Unified launcher (tag-driven game picker)
favicon.svg                  GameBox mark
css/common.css               Theme tokens (both themes, scoped under [data-theme]) + toast
css/launcher.css             Launcher-only hub styles
css/arcade.css               Arcade game-page chrome: topbar, HUD pills, stamina bar,
                             controls, canvas stage, start/pause/over overlay
js/arcade.js                 ArcadeCommon — all shared arcade plumbing (see below)
js/launcher.js               Game manifest (GAMES) + tags + render/filter + account UI
js/net/net.js                Firebase room layer (window.ArcadeNet)
js/net/rooms.mjs             Shared configurable matchmaking and room sessions
js/net/rtdb-rooms.mjs        RTDB transport (deployment: docs/ROOMS.md)
js/net/rtdb-values.mjs       Lossless RTDB encoding for logical JSON values
js/net/room-lobby.mjs        Shared room lobby DOM and action layout
css/room-lobby.css           Shared responsive lobby styling
js/cloud-sync.js             Cross-device high-score sync (window.CloudSync)
js/birthday.js               Birthday eligibility, homepage entry and first-entry routing
js/birthday-cake.js          Local directional wind/candle interaction
js/birthday-settings.js      Optional manual birthday account settings
css/birthday-settings.css    Account settings modal styling
js/games/birthday.js         Bilingual birthday-only ceremony and replayable candle game
css/birthday.css             Birthday ceremony and homepage entry visuals
js/games/colour-ladder.js    One file per game: logic + Canvas 2D rendering
docs/rules.md                Player-facing rules
docs/DEV.md                  This file
```

## `ArcadeCommon` surface (`js/arcade.js`)

| Namespace | What |
| --- | --- |
| `storage` | `readJSON` / `writeJSON` / `storageKey` — namespaced `localStorage` (prefix `arcadeGames`). |
| `prefs` | `get(game)` / `set(game, patch)` — per-game preferences. |
| `scores` | `best(game, mode)` / `submit(game, mode, score, meta)` / `resetIfStale(game, epoch)` — per-(game, mode) high scores + a recent-runs ring buffer. |
| `rng` | `make(seed)` (mulberry32) + `int` / `float` / `one` / `shuffle`. |
| `math` | `clamp`. |
| `format` | `score(n)` (thousands). |
| `icon(name)` / `icons.render(root)` | Inline Lucide-subset icons; fills every `[data-icon]` placeholder. |
| `i18n` | EN/中 strings, `t(key, ...args)`, `setLocale`, `subscribe`, `translateNode`, and the mutable `STRINGS` table. |
| `toast` | One shared bottom-centre notice: `toast.show(text, ms)`. |
| `input.keyboard(opts)` | Window-level key state + edge (`onPress`) callbacks. |
| `loop.create(opts)` | Fixed-timestep rAF loop (accumulator). |
| `audio` | WebAudio blip synth. `play(name)`; `unlock()`; `isMuted` / `toggleMuted`. |
| `shell.create(opts)` | Lifecycle + overlay + loop glue (below). |

### The shell

`shell.create(opts)` owns the state machine
`idle → playing → paused → over`, the fixed-timestep loop, the
start/pause/over overlay, and the Pause / Restart / Sound buttons and
their keyboard shortcuts. The game supplies `update(dt)` / `render()` /
`reset()` and calls `shell.gameOver({ score, win, meta })` when the run
ends. It intentionally knows nothing about the game's own HUD.

Config keys: `gameId`, `mode()` (leaderboard bucket), `scoreEpoch` (one-time
score reset — see below), `step`, `preventKeys`, `update`, `render`, `reset`,
`onStart` / `onPause` / `onResume` / `onGameOver`, `restartToReady`
(Restart → ready screen), and `overlayContent(state, result)` returning
`{ badge, title, message, button, hint }`.

**Resetting everyone's high scores once**: set `scoreEpoch` to an integer in
`shell.create` (we just use the date, e.g. `20261009`). Each save is stamped
with the epoch it was written under; bump `scoreEpoch` whenever a mechanics
change invalidates old scores, and every returning player's next load wipes
that game's bests exactly once, then stores the new epoch. Leave it unset to
never auto-reset. (Manual one-off: `ArcadeCommon.scores.resetIfStale(game, epoch)`.)
A signed-in player's cloud bests (CloudSync) are the source of truth and re-seed
after a local wipe, so bumping the epoch only resets device-local / guest scores —
clear `profiles` too if you really mean to reset accounts.

DOM ids the shell looks for (all optional): `#overlay`,
`#overlay-badge`, `#overlay-title`, `#overlay-message`, `#overlay-btn`,
`#overlay-hint`, `#pause-btn`, `#restart-btn`, `#sound-btn`, `#best`.

Global shortcuts: `Space`/`Enter` start from idle/over, `P`/`Esc` pause,
`R` restart (to the ready screen if `restartToReady`), `M` mute.
Switching tabs mid-run auto-pauses.

### Online rooms

Beam and Rune Stones use `ArcadeNet.rooms.create(options)` for configurable
membership, seats, readiness, starts and room subscriptions. `rooms.lobby()` renders
their common lobby layout using game-supplied text, badges and actions.
Both use guest readiness, host-controlled starts and same-room rematches; their
different departure policies live in each game's configuration. See
[`ROOMS.md`](ROOMS.md) for the API, policy comparison, RTDB deployment and
Firestore room retirement. Test commands live in [DEBUG.md](DEBUG.md#room-checks).
Rooms use RTDB exclusively.
Authentication, account records, admin settings and feedback remain unchanged.

### i18n conventions

- `data-i18n="key"` sets `textContent`; keys ending in **`Html`** set
  `innerHTML` (may contain markup / `[data-icon]`).
- `data-i18n-title` / `data-i18n-aria-label` handle those attributes.
- A game registers its strings by mutating
  `ArcadeCommon.i18n.STRINGS.en` / `.zh` at load time (top of the game
  file, synchronously) — before the DOM-ready translate pass.
- Dynamic text subscribes with `ArcadeCommon.i18n.subscribe(cb)`.

## Shared conventions

Both engines share these conventions; cross-cutting fixes must be kept in sync
in `js/puzzle.js` and `js/arcade.js`.

### iOS double-tap-to-zoom

iOS Safari does **not** reliably honour CSS `touch-action` for double-tap-to-zoom
— it ignores it outright on `<svg>` and `<canvas>`. So `touch-action: manipulation`
on `body` (set per theme in `css/common.css`) is not enough on its own.

Both shells therefore run a small JS guard that cancels the quick second
`touchend` (killing the zoom and its synthesised click) and re-dispatches a real
`click` so buttons/cells still fire:

- `js/puzzle.js` — scoped to `#board` (SVG or canvas).
- `js/arcade.js` — at the document level (covers the canvas stage, HUD and overlay
  buttons).

Unshackle also guards its numeric piece controls and serving plate locally in
`js/games/unshackle/game.js`, with explicit `touch-action: manipulation` on the
tray and buttons. Each area has independent tap state. The delegated guards
survive new puzzles and replaced plate contents, ignore drags and multi-touch,
and use `button.click()` so disabled pieces cannot be activated. Empty plate
places also suppress double-tap zoom without dispatching a click to the board.

**If you add a new shell or a standalone interactive page, add the same guard.**
Keep the two copies in sync.

### Staged settings & live preview

Difficulty / size pickers **stage** a change rather than apply it at once — the
running game isn't regenerated until the player commits (puzzle: *New Game*;
arcade: *Start*). While a change is staged, show a live **"current → pending"**
readout so the player sees what's running versus what they've picked, and that it
hasn't taken effect yet:

- Update on the control's `input` event (live while dragging), not `change`.
- When staged equals applied (nothing pending), show the plain value.
- When they differ, render `current → pending` — e.g. `9×9 → 11×11` or
  `Normal II → Hard I` — with a `pending` class; style the current value muted,
  the arrow fainter, and the pending value in the game colour.
- Make the readout granular enough that **every** step previews a change (a
  Roman-numeral sub-step within a tier, say, so same-tier moves still read as a change).

Reference: `js/puzzle.js` → `syncSizeButtons` (`.size-readout`). (Beam's old
difficulty bar used this pattern; its difficulty now lives in the Room's Solo tab
as a plain slider that applies on Start, so it is no longer a deferred-apply control.)

### Icons

- **DOM icon registries** (`js/launcher.js`, `js/puzzle.js`, `js/arcade.js` → their
  `ICONS` objects) are keyed by the Lucide icon name and hold the icon's inner SVG
  verbatim where possible.
- **Canvas icons** (e.g. Rune Stones' runes/UI in `js/games/rune-stones.js`) store
  the Lucide path fed to `Path2D`. Every entry records its source in a comment:
  - `// lucide: <kebab-name>` — the Lucide icon verbatim (re-fetch/verify at
    `lucide.dev/icons/<name>`).
  - `// lucide: <name> (modified)` — that icon, hand-edited.
  - `// custom` — hand-drawn, no Lucide equivalent.
  Keep the annotation accurate whenever an icon changes — it's the only way to tell
  later what a path actually is.

### Language & copy

- **Player-facing text** lives in the i18n tables (English + Traditional Chinese).
- **Code comments and docs are English.** Chinese appears *only* in player-facing
  content — never in comments, identifiers, or internal docs.

#### House style for copy

- Calm, rational, concise, tidy. When in doubt, say less.
- Don't narrate self-evident UI (e.g. "filter by tag", "tap to play"). Prefer a
  confident identity line over an instruction.
- Keep each game's in-game copy in the same voice as its siblings.
- No emoji unless explicitly requested.
- **Chinese copy uses full-width punctuation** (，。；：！？「」（）、…, and —— for a
  dash), never half-width commas/periods. Write it as idiomatic Chinese — don't just
  transliterate the English line word-for-word.
- **Chinese copy does not inherit English word spacing.** Do not insert ASCII
  spaces between Chinese characters, between Chinese and numbers/Latin text, or
  around Chinese punctuation. Apply this to translated strings, placeholders,
  dynamically joined sentences, labels, summaries, help and accessibility text.
- Use locale-specific templates or translation functions for dynamic text. Do not
  hard-code English spaces around translated labels or join Chinese sentences
  with `join(' ')`. Review the rendered Chinese as well as the translation table.
- Preserve meaningful spaces within English terms (such as `Open In`), display
  names, room codes and user-entered text. Keep intentional visual separators
  such as ` · ` and conventional numeric/unit spacing; never globally strip spaces
  from rendered content or user data.
- Prefer plain language over notation in player copy: say "the prime you fire", not a
  symbol like "p". Math notation is for comments and docs, not the player.

### Accounts & cloud sync

Sign-in is **Google-only**, via `ArcadeNet` (`js/net/net.js`), surfaced globally on
the launcher. One shared engine — `js/cloud-sync.js` (`window.CloudSync`) — does
everything; it loads on the launcher and every arcade game (right after `net/net.js`).

- **Cloud is the source of truth for an account; the live keys are a working copy.**
  Only the **guest** identity is cached locally (a single "guest drawer"). On sign-in
  CloudSync stashes the guest's live records, **clears the live keys** (so guest
  scores can't bleed into the account), then pulls the account from the cloud; on
  sign-out it brings the guest drawer back. Accounts are never mirrored to a local
  drawer. Signing in on the launcher syncs **all** games at once.
- **Descriptors** (in `cloud-sync.js`) define each record family: how to read/write
  its slice of the game's own localStorage, how to merge two record objects (per
  field **max** for scores, **min** for ranks/rounds), and how it maps to the profile
  doc. Everything nests under `games.<id>`: generic high scores
  (`games.<game>.bests[<mode>]`), Beam ranks (`games.beam.ranks[<notch>]`), Rune
  Stones Sandbag (`games.rune-stones.sandbag[<level>]`).
- Sync only **monotonic bests** (a max or a min). Cumulative counts (plays, wins)
  stay device-local — they don't merge cleanly.
- **Guest → account** is a per-game **claim** (move, not copy), offered only at the
  moment of signing in and only for games the account doesn't have yet but the device
  does. Accepting merges just those games in, pushes, and drops them from the guest
  drawer; games the account already has are left in the drawer untouched. Because
  "already has the game" is the gate, a game is claimable into a given account **at
  most once**. Declining or ignoring the prompt just waits until the next sign-in.
- Games stay out of it — they just `CloudSync.onApplied(repaint)` and call
  `CloudSync.sync()` after writing a new best. Everything is guarded, so **guests and
  offline play are unaffected**.
- A game that syncs must load `firebase-config.js` + `net/net.js` + `cloud-sync.js`,
  and `firestore.rules` must allow `profiles/{uid}` for its owner.
- **Sign-in needs an authorized https domain.** Google OAuth uses a **popup on every
  platform** — a full-page redirect would need the app and Firebase's `authDomain` to
  share an origin, which GitHub Pages can't do, so browsers' cross-site storage
  partitioning silently drops the redirected session. It only works on a domain in
  Firebase's *Authorized domains* over https — i.e. `localhost` or the deployed site.
  A phone hitting a LAN-IP `http` dev server **can't** sign in (the popup flashes and
  vanishes); test sign-in on the deployed site or an https tunnel.

### Git & local dev

- Shell commands here are PowerShell: chain with `;`, not `&&`.
- Work ships to the protected `main`. If the remote has moved, `git pull --rebase`
  before pushing.

## Shared unread indicators

`js/notifications.js` owns an in-memory unread tree and DOM bindings;
`css/notifications.css` renders shared corner dots without changing button padding
or dimensions. The launcher creates one hub and passes it to feature controllers.
It binds the menu button once to the aggregate `menu` node. Features never toggle
that button directly. The menu dot is 12px; other corner dots are 9px, with a dark
outline. Labels include unread counts for assistive technology.

The hub has no Firebase dependency and does not decide when content is read.
Each feature owns its persistence, permissions and read policy, and publishes a
count. A parent's count is the sum of its children; its dot stays lit while any
descendant is unread. Multiple controls may bind to one source without counting
those items again. Each logical unread item should be published by one source.

```js
// A feature controller uses the hub passed by the launcher:
const announcements = notifications.source('announcements', 'menu');
const unbind = notifications.bind(announcementButton, 'announcements', state =>
    'Announcements' + (state.unread ? ' · ' + notifications.describe(state) : ''));
announcements.publish(3); // lights both this entry and the shared menu
announcements.publish(0); // unread feedback can still keep the menu lit
// On teardown: announcements.dispose(); unbind();
```

`source(id, parent)` returns a publisher with `publish(count, { atLeast }?)` and
`dispose()`. Lower-bound counts propagate (20+ replies plus one announcement
becomes 21+ notifications). Source replacement invalidates the older publisher;
cycle/reparenting attempts are rejected. `bind(element, id, label)` should run
after attaching the element; it returns an unsubscribe function. Disconnected
elements are pruned on refresh. `refresh()` also updates localized labels.

The launcher calls `setScope(uidOrNull)` before notifying feature controllers of
an account change. This clears counts and invalidates old publishers. Controllers
must acquire a new publisher for the new scope, so old asynchronous callbacks
cannot relight or clear another account's notifications. Both the feedback and
announcement controllers use this hub; their persistence policies remain separate.

## Announcements

`js/net/announcements.mjs` exposes the public board and admin publishing API through
`ArcadeNet.announcements`. `js/announcements.js` owns the bilingual board/editor;
`css/announcements.css` uses the shared modal shell. The drawer has a public
Announcements entry and an admin-only Manage announcements entry.

Admin editors provide Traditional Chinese and English title/body fields, an
important badge and an optional game selector. At least one complete language
pair is required; missing translations fall back to the other language. Titles
are bounded to 120 characters and each body to 6000. Content uses plain text;
game links resolve only against the local game manifest. Announcement text cannot
supply HTML or arbitrary link targets. Important is a visible label, not a forced
popup or a separate notification channel.

Each `announcements/{id}` stores `title` and `body` language maps, optional `game`,
`important`, `published`, a monotonically increasing `revision`, immutable
`createdBy`/`createdAt`, `updatedBy`/`updatedAt`, and nullable `publishedAt`.
Only verified-email admins may write. Everyone may read published posts, including
signed-out visitors; draft reads and the unfiltered admin list are admin-only.
Lists are bounded to 20 per page (server rules cap at 50).

Save draft does not notify players. Publishing or editing a published post
atomically updates both the post and `announcement_meta/index`, whose public
`versions` map contains only active post IDs and revisions. Rules require the
published document's revision to match that index in the same commit. Withdrawing
to draft removes its index entry in that transaction; draft-only edits never
write the public index. Published posts must be withdrawn before deletion.
Editors compare their captured revision, rejecting stale saves. First publication
and republication receive a server `publishedAt`; edits while published retain
their order but notify readers again. The index caps active posts at 1000.

The homepage watches only this one small index document. It reads full post
documents on explicit board opening/pagination. Background tabs unsubscribe;
foreground return reconnects. The index drives the `announcements` notification
source under `menu` independently of feedback. Expanding a post acknowledges that
specific revision; opening the list alone does not. Live index changes update dots,
while the open list uses its Refresh button to fetch updated article content.

The public toolbar also offers Mark all as read. It captures the currently known
unread ID/revision pairs, including posts beyond the loaded page. For an account,
`CloudSync.saveAllAnnouncementReads` reads the version index and own profile in one
transaction and merges matching markers in at most one profile write. A new post
or revision published after the click is excluded; stale markers cannot overwrite
newer ones. It does not fetch each article or modify feedback notifications.
Visitors persist the captured markers in their browser without a Firebase write.

Signed-in read markers live in `profiles/{uid}.announcementReads` as ID/revision
pairs, reusing the normal CloudSync profile read. `CloudSync.saveAnnouncementRead`
uses a transaction to verify the latest public revision and merge a marker without
overwriting scores, birthday or other markers. Older-view acknowledgements cannot
clear a newly published revision. Metadata cache updates guard account changes
and late reads. Read markers are loaded from the cloud at normal profile sync;
another device's acknowledgement is reflected on its next profile sync/reload,
rather than adding another permanent profile listener.

Visitors keep read markers under `gamebox:announcements:guest-reads` in this
browser's localStorage, with no profile reads/writes. Storage events update other
guest tabs; unavailable storage falls back to memory for the current visit.
Clearing browser storage resets those markers. Guest markers do not migrate into
a Google account; the signed-in account uses its own cloud markers.

Before deploying the feature, publish the full updated `firestore.rules`, and add
the collection-scope `announcements` composite index: `published` Ascending,
`publishedAt` Descending. It is included in `firestore.indexes.json`; preserve the
existing feedback indexes. The CLI command in
[feedback deployment](#publish-feedback-rules-and-indexes) publishes both sets.
There is no data migration or RTDB change. The admin UI creates documents when
used; implementation does not seed or publish real announcements automatically.
Checks and the two-role acceptance flow are in [DEBUG.md](DEBUG.md#announcement-checks).

## Feedback ownership, replies and notifications

`js/net/feedback.mjs` owns the Firestore operations, injected with the Firebase SDK
and current user. `ArcadeNet.feedbackBox` exposes `send`, `listMine`, `listAdmin`,
`listUnread`, `watchUnread`, `reply`, `markRead`, `setResolved` and `remove`.
`ArcadeNet.feedback(data)` remains the submission entry point. `js/feedback.js`
owns the account/admin inbox UI and notification lifetime; `css/feedback.css`
extends the launcher's modal styling. Messages are rendered with `textContent`.

Each `feedback/{id}` document keeps the immutable original submission (`uid`,
`text`, `at`, account metadata and optional `kind`/`game`), plus:

| Field | Meaning |
| --- | --- |
| `resolved` | Admin-only handled flag; missing is treated as false |
| `reply` | Latest admin response: `{ text, by: adminUid, at: serverTimestamp }` |
| `replyVersion` | Integer revision, starting at zero; each admin response increments it |
| `unread` | Set true by a reply, cleared only by its submitting account after viewing |

This is a submission with one replaceable admin response, not a chat archive.
The admin editor says that only the latest response is retained. Updating it
notifies the player again without changing handled status. Legacy submissions
with a valid original UID remain visible; their first response initializes the
new fields. Anonymous submissions remain accepted but have no account history,
reply notifications or automatic transfer to a Google account.

Security is enforced by `firestore.rules`, not visibility of admin buttons.
Create rules pin UID/email/anonymous status to the authenticated identity, bound
text to 2000 characters, require a server timestamp and reject unapproved fields,
pre-filled replies and notification/status forgery. A signed-in account may read
only its own submissions and change only `unread` from true to false. Admins may
read all, mark handled, replace the reply or delete; they cannot rewrite original
submissions. Admin membership requires a verified email in `config/admins`.
Lists require a limit no greater than 100. Owner queries include the exact UID;
Firestore rules are not result filters.

An admin response uses a transaction with the editor's captured `replyVersion`.
Another admin's newer response rejects a stale save. Read acknowledgement also
uses a transaction and captured version; viewing an old response cannot mark a
newer one read. Opening the inbox alone does not acknowledge anything: the player
must expand the response. Signing out or changing account closes feedback views,
clears notifications and discards delayed old-account results.

Only the homepage watches unread items (`uid == currentUid`, `unread == true`,
limit 20). The badge displays `20+` when that bounded page is full. Feedback
publishes its count to the shared hub's `feedback` child of `menu`, driving dots
on the menu button, My feedback entry, Unread replies
tab and individual unread reply summaries. Opening a menu or list does not clear
these indicators; successful read acknowledgement clears the corresponding reply,
and the listener clears feedback's outer dots only when no unread replies remain.
Other sources can still keep the menu lit. The indicators reuse the same
subscription and add no queries or writes. Listener failures retain the last
known indicators alongside the error message; account changes clear them immediately.
Background pages unsubscribe; foreground return reconnects. There is no polling, email,
browser push or OS permission request. Notifications persist in Firestore until
read and appear on later homepage visits. History loads 20 items per explicit
page; admin history loads 50. Unread refresh loads the next current unread batch.
Other game pages initialize the service but do not subscribe to feedback.

### Publish feedback rules and indexes

A Pages deployment does not publish Firestore configuration. Before publishing
the website, publish the complete `firestore.rules` and the indexes in
`firestore.indexes.json`. Existing data does not need a migration. RTDB rules do
not change. With an authenticated Firebase CLI:

```powershell
firebase deploy --only "firestore:rules,firestore:indexes" --project games-7e19b
```

Alternatively, publish `firestore.rules` in **Firestore Database > Rules**, then
create these **collection-scope** composite indexes on collection `feedback` in
**Firestore Database > Indexes**:

- `uid` Ascending, `at` Descending (account history).
- `uid` Ascending, `unread` Ascending (notification query).

Wait until the indexes are enabled before the two-account acceptance check in
[DEBUG.md](DEBUG.md#feedback-checks). The standard Firebase client API key is not
a secret or an admin credential. These controls isolate access; they do not add
server-side spam throttling or prevent a legitimate account from creating many
submissions. That pre-existing abuse/billing concern would need a separate policy.

## Birthday personalization

The launcher menu's **Personalization** dialog lets a signed-in account manually
set an optional month/day or delete the date. Saving a birthday is sufficient;
there is no separate enable checkbox. Google is used for normal sign-in only;
no birthday scope, People API or extra OAuth setup
is involved. The dialog does not announce or link to the candle ceremony.

Profile metadata lives alongside scores in `profiles/{uid}`:

| Field | Value |
| --- | --- |
| `birthday` | `{ month: 11, day: 3 }`, or null when deleted |

Only `birthday` is read or written by this feature. The earlier experimental
`birthdayEnabled` and `birthdayUpdatedAt` fields are unused and are not cleaned
up automatically; they may be removed manually from the test profile.

Only a map containing integer `month` and `day` fields is accepted. Strings and
maps containing a year are unsupported; no automatic data migration is performed.
Saves replace the whole birthday field. February 29 matches only an actual leap
day; invalid month/day pairs do not qualify. Dates and midnight use the device's
local calendar. Existing owner-only Firestore profile rules suffice.

`CloudSync.onProfile` reuses the normal profile read. Opening settings adds no
read or write; explicit save/delete uses one targeted metadata write and notifies
subscribers without rereading. Late reads cannot overwrite acknowledged settings,
and account transitions discard old read/save results from the new account UI.

The homepage entry and `games/birthday.html` are available only on a signed-in
account's birthday. There is no anytime/practice route or query flag
that bypasses this eligibility check. The first eligible homepage visit that day
automatically opens the ceremony after any settings/claim dialog closes. Later
visits remain on the homepage with a repeat-entry banner. Midnight or sign-out
removes the active ceremony and cancels pending completion UI.

Daily markers are local to the browser origin, account and local calendar date:

- `gamebox:birthday:entered:<uid>:YYYY-MM-DD`: written before automatic navigation
  or on manual/direct entry, preventing repeated automatic redirects that day.
- `gamebox:birthday:completed:<uid>:YYYY-MM-DD`: written when all candles are out;
  changes the banner/notice to acknowledge completed proceedings and allow repeats.

Both markers are written to localStorage and sessionStorage, and either copy
counts. Changing the birthday does not clear them; a new local day uses new keys.
Old keys are currently retained but ignored. These flags never write to Firebase.
For manual verification and first-entry resets, see [DEBUG.md](DEBUG.md#birthday-checks).
The ceremony keeps its bilingual formal register, pointer/keyboard controls,
mobile scroll cue and brief finished-cake pause; detailed mechanics live in
`js/birthday-cake.js` and its checks rather than a duplicate feature manual.

## Adding a new game

1. **Launcher entry**: append one object to `GAMES` in `js/launcher.js`
   (`id`, `href`, `icon`, `color`, `tags`). The launcher is data-driven, so the
   card is rendered from this — no HTML to copy.
2. **Accent colour**: set `body { --game-color: #…; }` in the game page's inline
   `<style>` (the launcher card uses the `color` field from its `GAMES` entry).
3. **Game page** `games/<id>.html`: copy `colour-ladder.html` — topbar,
   the HUD pills **your** game needs, a `.stage-wrap` with the
   `<canvas id="stage">` + overlay, controls, and the *How to play*
   footer. Load `../js/arcade.js` then `../js/games/<id>.js` (add
   `../js/firebase-config.js` + `../js/net/net.js` + `../js/cloud-sync.js` before
   the game script only if it syncs scores or goes online).
4. **Game module** `js/games/<id>.js`: an IIFE that
   - registers its strings on `AC.i18n.STRINGS`,
   - grabs the canvas + its own HUD nodes,
   - builds state,
   - calls `AC.shell.create({ gameId, update, render, reset, … })`,
   - wires its own input and updates its own HUD,
   - calls `shell.gameOver({ score, win })` when the run ends.
5. **Launcher strings** (`<id>_name` / `_tagline` / `_body`, EN + 中) go in
   `STRINGS` in `js/launcher.js`; per-game gameplay strings stay in the game file.
6. Add a rules section to `docs/rules.md`.

### WIP gating (the `wip` flag)

A game whose `GAMES` entry has `wip: true` is still shown on the launcher, but
opening it goes through a soft gate (`openWipGate` in `js/launcher.js`). What the
gate does depends on who's looking — so a half-built game can ship on `main`
without being openly playable, while you and testers still reach it directly:

- **Signed-in owner / admin** (listed in `config/admins`): no gate at all. The
  card opens the game directly, exactly like a normal entry. This is why a `wip`
  game is fully playable for you once you're signed in.
- **A device unlocked via `index.html?backstage`**: the flag is stored in
  `localStorage` (`gamebox:backstage`), so WIP games open after a friendly
  "backstage — take a look?" confirm. Share that one link with a tester and a
  single click unlocks every WIP game on their device.
- **Everyone else (locked)**: the confirm reads "still being built — isn't open
  yet"; insisting ("let me in anyway") leads to a well-known decoy video rather
  than the game. It's a deterrent, not real access.

So `wip: true` is the switch between "listed but gated for the public" and
"normal playable card". Flip it off (or just delete the key) to release a game to
everyone. Nothing else changes — strings, scoring and sync all behave the same
whether or not the flag is set.

Canvas convention: render at a fixed logical resolution (Colour Ladder
uses 600×760 portrait, capped/centred via a `.stage-wrap { max-width }`
on its page) and scale the backing store by `devicePixelRatio` in a
`fitCanvas()`.

## Colour Ladder internals

- **Tuning lives up top** in `CONFIG` (shared: `ballSpeed`, wave gap, …) +
  `DIFFICULTIES` (per preset: the fixed layout `lanes`=`colors`, `lives`,
  `twoBall` chance, and the `freq` wave-rate curve). Change balance there.
- **Difficulty** is a preset (`easy` / `normal` / `hard`), chosen with
  the on-page selector and stored in prefs; high scores are kept
  per-difficulty (`shell.mode` returns `G.difficulty`). Each preset has one
  **fixed layout** where `lanes === colors`, so every basket is a distinct
  colour.
- **Ladder model.** `G.rungs` is a fixed list of `{ gap, y, color }` (gap = the
  left lane of the pair; `y` = a free, continuous height; `color` = the one
  colour it does NOT affect). A ball tracks its logical `lane` and each frame
  crosses any adjacent rung whose colour differs from it (in height order) —
  a ball slips straight through rungs of its own colour — easing its `x`
  toward the lane centre (`CONFIG.xEase`) for a diagonal slide.
  Lanes draw a faint full-height rail plus a brighter capped segment marking
  the rung band (`RUNG_TOP`–`RUNG_BOTTOM`).
- **Colour-gate rungs.** `initRungs` seeds **one rung per colour**
  (`COLOR_SETS[G.colors]`) spread out by `placeRungSpread` (a best-candidate
  pick that keeps rungs apart via soft repulsion); it also scatters
  `DIFFICULTIES.*.fixedRungs` **immovable obstacle rungs** (`fixed: true`,
  upper-biased ~26%) that deflect **every** colour
  (crossing skips the colour test for them) and can't be grabbed (`rungIndexAt`
  ignores them). A gate rung deflects
  every colour EXCEPT its own (a ball passes straight through its own colour's
  rungs), so every rung interacts with almost every ball — managing those side
  effects is the puzzle, and an own-colour rung is a "safe gate". Drawn as a
  neutral bar with coloured end-rings (`drawRung`). Rungs move, never add/remove.
  Pointer input grabs the rung under the cursor (`rungIndexAt`); while held it
  is placed freely — the gap snaps to the nearest pair (`nearestGap`) and the
  height follows the cursor. `resolveDropY` dodges conflicts: rungs that share a
  lane (same or adjacent gap) must stay `CONFIG.rungMinSep` apart, so the ghost
  slides to the nearest free height (or turns red / snaps back if the column is
  full). The held rung keeps steering at its old spot until release
  (`drawDragGhost`).
- **Baskets** (`makeBaskets`) lay the fixed colour set in a **fixed order** (no
  shuffle, from `COLOR_SETS`), one per lane. A ball's colour (chosen uniformly,
  differing within a wave) is both its destination (the same-colour basket) and
  the rung colour that can move it.
- **Steady wave spawning.** `waveRate()` = `freq.base + freq.k·ln(1 + t/freq.tau)`
  — unbounded but decelerating. A single accumulator (`G.spawnAcc`) fires a wave when
  it crosses 1 and `CONFIG.waveMinGap` has passed; the rhythm stays even (no
  jitter). `spawnWave` drops one ball, or two (on distinct free lanes) with
  `DIFFICULTIES.*.twoBall` probability — never more than two.
- **Fall speed** is `ballSpeed()` = `CONFIG.speed.base + k·ln(1 + t/tau)`
  (shared across difficulties), computed once per frame and applied to every
  ball — the whole field accelerates together as it rises.
- **Rung cooldown.** Moving a rung sets `rg.readyAt = elapsed +
  cooldownDuration()`, where `cooldownDuration()` = `CONFIG.rungCooldown ×
  speed(0)/speed(t)` (≈ `rungCooldown` s early, shorter as `ballSpeed` rises, so
  moves-per-ball-drop stays roughly constant). While cooling, `rungIndexAt`
  skips it (can't grab) and its end-rings draw as a sweeping recharge arc.
- **Opening countdown.** `onStart` sets `G.countdown` (`CONFIG.countdownSec`);
  while it ticks down `update` freezes the scene (no spawning or falling) and
  `drawCountdown` paints a 3‑2‑1 overlay, so play doesn't start the instant you
  press Start. The difficulty clock (`G.elapsed`) only begins afterwards.
- **No overlap at spawn.** `laneBlockedAtTop` keeps a lane clear until its top
  ball descends past `CONFIG.laneClearY`; within a two-ball wave `createBall`'s
  `used` set forces two different colours. In a two-ball wave each ball picks a
  free lane independently, so the pair may coincide (stacked — peel apart with a
  colour rung) or not; stacked/converged balls are spread side by side for
  readability (`drawBalls`).
- **Difficulty over time** is only the wave rate rising, `base + k·ln(1 + t/tau)`:
  unbounded (never plateaus) but ever gentler, so late game stays fair and good
  players last long. `tau` drifts the gentle opening. Easy/Normal share a curve;
  Hard's is a touch lower (its extra colours already carry the load).
- **Delivery** compares the ball's colour to its final lane's basket. Correct →
  score (plus +1 life if it's a heal ball, capped at `G.maxLives`); wrong → a
  life lost, **except heal balls, which are harmless when misplaced**. Zero
  lives ends the run. (No combo system.)
- **Heal balls** (`b.heal`) come from a separate accumulator (`spawnHeal`) at
  `waveRate / CONFIG.healEveryWaves` — EXTRA balls on their own timeline, not
  part of a wave, so ~1 per `healEveryWaves` waves (scales with the rate). They
  fall `CONFIG.healSpeedMul×` the normal speed and draw with a trail + white `+`.
- **Lives HUD** renders as pips via `renderLives` (easier to read at a glance).

## Darts implementation

The existing relative mouse/touch flick, release smoothing, ballistics and camera
remain in `js/games/darts.js`. `darts-rules.js` owns canonical dartboard results,
mode rules and immutable turn/leg/match transitions. `darts-room.js` supplies the
game policy for the existing `ArcadeNet.rooms` service and RTDB adapter.
`darts-hud.js` maps shared state into player/turn/mode presentation data and renders
the components; responsive composition lives in `css/darts.css`.
`darts-history.js` owns the accessible, scrollable player/all-player history dialog.
`darts-lobby.js` presents the unified local/online room, participant editing,
contextual configuration and per-controller Ready/Start actions.

### Room, participant and match lifetimes

The page immediately creates a local room with one human slot. Adding local
players, configuring rules and completing a local match do not initialize
`ArcadeNet`; networking is imported only when Invite/Join is requested. Promoting
the room preserves its local slots and names. Online connections continue to use
the existing tab identity, RTDB room service, session/presence handling and host
transfer. This is game policy on shared infrastructure, not a second transport.

Room `players` identify connected controllers. Separately, `participants` and
`seatOrder` describe 1–4 seats, each with a name, `controllerId` and `type:'human'`.
One controller can own several slots; the separation leaves room for a future CPU
without adding CPU behavior or controls now. The first local slot uses a known
signed-in account's display name when available; guests and additional local
slots use numbered names. The shared auth layer keeps a small `gamebox:account-name`
display hint and clears it on sign-out/anonymous auth, so local-only Darts can
reuse the name without loading Firebase. This hint grants no account or room
permissions. An untouched default can update in the lobby; manual names and an
active match's roster are preserved. Device ownership is shown separately.
Lobby edits validate capacity and
ownership and clear Ready state. Readiness is per controller, covering all its
slots. A host-start convention allows the host to acknowledge settings by Start
after each guest controller readies up.

Room `options` configure the next match. At Start, `Rules.create` captures the
normalized options and participant order, and `game.owners` captures controller
ownership. Active input and submitted actions derive the active slot and verify
its owner rather than accepting a supplied participant ID. Existing match-ID,
turn, status and sequence guards serialize scoring actions. A match can pass
through playing/between-Legs/results without destroying the room; Back to Lobby
keeps the last game, history, settings, names and slots until a new match replaces
them. The host can stop Practice, which has no formal winner. Other active
competitive matches retain locked configuration and membership.

Start also fixes `game.execution` for the match. An invitation room containing
only host-owned participants uses `local`: the host applies the same Rules,
history, timer and pause policies as an offline match. Per-dart scoring, local
timeouts and next-Leg transitions make no room writes. The room code and
membership remain reserved through ordinary heartbeats, and new participants
cannot join during play. Returning to the lobby uploads the accepted finished
snapshot through `syncLocal`, preserving the complete history in one guarded
update. Match completion alone does not publish that live local state.

Matches with another controller start as `shared` and keep the existing guarded
throw protocol. Execution does not switch after a disconnect: a shared match
finishes under its original ownership/departure rules. The next Start evaluates
the current participants again, so the same invitation can host a local match
and later a shared one without recreating the room.

The existing reconnect grace period retains every slot owned by a temporarily
disconnected controller. Intentional departure/eviction withdraws those slots
atomically through `Rules.withdrawMany`, preventing a departing controller's
second seat from becoming a transient winner. Frozen match players/owners and
roster names remain available for history; remaining live room seats determine
the next match. No new active participants join an in-progress match.

### Explicit game configuration

`Rules.options` validates `mode`, `startingScore`, `startingPlayer`, `settlement`,
`legsToWin`, `turnMs`, `roundLimit`, `inRule`, `outRule`, `bullMode` and
`cricketVariant`. Legacy `bestOf` input remains compatible;
the UI uses first-to-1/2/3 Leg wins instead of promising a fixed Leg count.
`Rules.eligibility` permits Practice/Count-Up with 1–4 slots and X01/Cricket with
2–4. Practice defaults to unlimited rounds and Timer Off; competitive modes
default to 60 seconds. Timers can also be Off/30/60/90 seconds. X01/Cricket offer
10/15/20/30/unlimited rounds; Count-Up offers 5/8/10/15/20/30 (default 8).

The lobby shows only relevant rules: X01 starting score, In/Out and Bull settings, Cricket
Standard/Cut-Throat, and Count-Up rounds/Bull settings. Automatic Cricket resolves
to Standard for two and Cut-Throat for three/four when the match is created;
explicit choices survive population changes. Mode changes select appropriate
round/timer defaults, while explicit values in the same update take precedence.
Rules are copied into the match and are not read from mutable lobby options.
Explanations describe only the selected mode, participant count and actual rule
combination. A one-player Cricket lobby explains the two-player minimum instead
of recommending a one-player variant.

The lobby dialog uses a fixed header, independently scrollable `#lobby-content`
and a non-scrolling footer. Start/Ready and its associated eligibility reason
remain visible with four players and expanded rules. Practice uses Start Practice;
other games use Start Game. Ready guests see a disabled Waiting for Host action
and a separate Cancel ready button, both using the existing controller callbacks.
The compact rule summary follows the selected options; Rules explained expands
the same contextual explanation inside the content region. Visual viewport
resize/scroll events fit the dialog above a mobile keyboard and scroll only the
content to keep a focused name field visible.

`scoreAt`/`normalize` preserve physical Bull region and multiplier. Only
`scoreResult` applies 25/50 or 50/50 numeric Bull scoring for X01/Count-Up; a
50-point Outer Bull remains ineligible for Double In/Out. Master accepts Doubles,
Triples and either Bull; Double accepts Doubles/Inner Bull. `entered` and
`turnStartEntered` accompany the existing starting-score snapshot, so Bust restores
both score and entry state for the complete turn. Open Out permits one remaining;
Master/Double Out bust there or on an illegal checkout.

Cut-Throat keeps the thrower's score unchanged and applies excess-mark penalties
to every active opponent with that target open. `turnPenalties`, `lastDart.penalties`
and history recipient maps make the difference explicit. Victory detection checks
all contenders: penalties may make an already-closed non-throwing player lowest.
Standard awards excess points once to the thrower and compares all contenders.

Finite limits use each participant's completed-turn count, not the global turn
revision. Everyone receives the configured opportunities before score settlement,
unless normal checkout/closure wins immediately. Settlement uses lowest remainder
for X01, highest Standard/Count-Up total and lowest Cut-Throat total. Tied leaders
enter `phase:'cork'`: one dart each, unchanged scores, physical distance from the
Bull passed as the optional fifth `throwDart` argument. Distances within 0.001 mm
repeat only among those still tied. A Cork timeout forfeits the opportunity.
Normal scoring and Cork history/feedback carry distinct phase data.

The canonical countdown mode is `x01`, with `startingScore` restricted to
301/501/701/901/1101/1501. Legacy `mode:'501'` normalizes to X01 with 501 points;
older live snapshots without caps remain unlimited. `configureOptions` is shared
by local and connected lobbies. `roundLimitExplicit` distinguishes a manually
selected cap from an automatic score-based default; changing X01 starting score
updates only automatic caps. Mode changes reset mode-specific round/timer defaults.
All normalized settings, including `startingPlayer` and `settlement`, freeze at
Match start and configuration changes reset device Ready states.

`phase:'cork'` shares physical-distance comparison across `corkPurpose` values
`opening`, `tie` and `limit`. Opening Cork selects `firstStarter`/`legStarter`
once, retaining seat order and later-Leg rotation. Direct X01 limit Cork admits
all contenders, while a numeric settlement tie admits only tied leaders. Cork
does not increment normal stats/turn counts or change scores/marks; accepted
history, last-dart and last-turn data carry the context. `legCorkPurpose` preserves
the completed context for result presentation. Timeout and controller withdrawal
continue through the same shared Cork resolution code.

### Local and online CPU players

CPU V1 uses normal participant slots (`type:'cpu'`, `difficulty`) and requires at
least one human. X01, Standard/Cut-Throat Cricket and Count-Up support 1–3 CPUs;
Practice cannot start with CPU slots and does not silently remove them. The
current local roster is cloned into `game.participants` at Start, alongside a
local `cpuSeed`, so difficulty stays fixed across Legs and ordinary history keeps
the same participant IDs. CPU owns no human input; its offline owner tag remains
`local-cpu` for compatibility. In a coded room, every CPU has the same real
connection `controllerId` and captured `game.owners` entry as that device's human
slots. Creating a code imports existing CPUs without changing their type;
joining follows the existing single-human join policy, then that device can add
CPUs. Every connected device retains an owned human. Only the owner can rename,
remove or change its CPU's sixteen-level difficulty in the lobby. These transactions
increment the room revision and clear all device Ready states; CPUs add no Ready
identity. Match start clones every participant's type/name/difficulty/owner into
`game.participants`, and local result uploads also validate that locked snapshot.
The existing rules engine remains independent of participant skill/type.

`darts-cpu-difficulty.js` owns the shared 0–15 scale (Easy/Normal/Hard/Insane,
I–IV within each tier), strict validation and translated labels. New CPU slots
default to 6 (Normal III). Legacy `easy`/`normal`/`hard`/`insane` values resolve to
1/6/11/14 (Easy II / Normal III / Hard IV / Insane III). Existing snapshots can
retain their strings; imports and edits write numeric levels, and locked Match
participants are never rewritten. Level zero is valid and must not use a truthy
fallback. Lobby and HUD use the same labels, with no ASCII space before Roman
numerals in Chinese.

The original profiles are interpolation references, rather than fixed interior
difficulty levels. Public level `n` maps to reference strength
`15 * (n / 15)^1.5`, controlled by `CURVE_POWER`. This concentrates more choices
toward the easier end. Easy I and Insane IV keep their exact profiles, tactics and
RNG consumption; every interior level, including the four legacy aliases, uses
the easier curve. Positive error parameters interpolate geometrically at that
reference strength. Tactics probabilistically blend the neighboring reference
policies at the same strength, avoiding a sudden policy change at a tier label.
The thinking interval and physical pipeline remain common to every level.
Seeded six-thousand-dart probes verify increasing ordinary scoring and Cork
precision across all sixteen levels, with golden results for both endpoints.

`darts-cpu-strategy.js` chooses physical target centres. X01 uses bounded legal
checkout lookahead, actual In/Out/Bull qualification and safe setup targets;
Cricket weighs closure and attacks differently for Standard and Cut-Throat.
At low strengths the policy chooses broad single beds, then blends toward Bull
and eventually T20 as strength increases. The stronger reference policies prefer
Bull under 50/50 scoring after measured expected-score comparison. Cork always
aims at physical centre and checks current eligibility.

`darts-cpu-gesture.js` calibrates a 17-sample accelerating gesture through the
actual `analyseGesture`, `computeThrow` and `computeImpact` callbacks. A small
two-variable numerical solve needs about 5–8 evaluations for a new target; cached
targets need no new search. This solves the intended input before execution
errors. Seeded velocity, timing and acceleration-shape errors, including rare
large lapses, modify only samples. `submitGesture` is shared by human and CPU;
flight, impact and scoring use unchanged existing code. No actual hit is adjusted
or retried. An invalid upward gesture has the same no-dart behavior as human
input, then the scheduler can attempt another gesture later.

CPU scheduling is polled in the game update with a 900 ms recognition interval
after the previous result presentation ends. A pending key contains match, Leg,
phase, turn, accepted sequence and player. Pauses/dialogs, deadlines, new states,
results and resets cancel pending work; there is no detached asynchronous throw.
When the document is hidden and animation frames stop, the existing one-second
maintenance interval also advances accepted flights and owned CPU turns. It uses
the same update path and guards, without throwing for humans or bypassing pause.
This depends on the browser continuing timers; an OS-suspended page cannot run.
Timers are neither paused nor reset for CPU. Human pointer input is blocked on
CPU turns. Handoff never asks a CPU to confirm; remembered confirmed human
ownership preserves H1 → CPU → H2 handoff and skips H1 → CPU → H1. Existing
direct human-to-human and remote-human behavior stays intact.

The online scheduler checks that the current connection owns the active CPU,
remains a room member and is connected, and respects `readyAt` as well as the
unchanged turn deadline. It submits the same physical flight through
`online.submit`, using captured Match/Leg/phase/active/turn/sequence/deadline
fields, as well as the current room attachment and authenticated connection.
A pending position is retained until acknowledgement or a newer committed
snapshot resolves it. An old promise cannot clear a subsequent submission or
display a stale error. Only one concurrent transaction can advance an expected
sequence. Transaction retries recheck the wall clock, membership, ownership and
locked participant; no queued pre-deadline dart can score after the deadline.

Host-only coded CPU matches retain the existing local execution/reservation path;
shared matches run each CPU only on its owner. Presence loss stops new CPU work.
After the ordinary grace/reaping policy, every departed device's human/CPU slot
is withdrawn without transferring its CPUs; another host can continue with its
own slots. A same-page connection may recover before eviction, but a page refresh
creates a new random connection identity and cannot reclaim the old slots. RTDB
rules still provide the existing authenticated room boundary, not server-side
physics or anti-cheat validation; all game-policy validation runs in clients.

`lastCpuThrow` holds local diagnostic samples,
analysis, launch, impact, physical result and target error for test injection;
these diagnostics are not written into ordinary throw history or a new overlay.

Seed version 1 calibration (`node tools/darts-cpu-calibrate.js`) uses 6,000 accepted
ordinary darts per tier, 25/50 Bull, Open In and 1,000 remaining without checkout
pressure. PPR is total physical points / accepted darts × 3; real misses count,
and invalid gestures are reported separately. This benchmark is distinct from
complete-game net PPR with Bust and checkout effects.

| Difficulty | Ordinary PPR | Physical miss | Cork mean distance | Standard Cricket target MPR |
| --- | ---: | ---: | ---: | ---: |
| Easy II | 19.59 | 48.23% | 117.64 mm | 0.67 |
| Normal III | 33.90 | 11.88% | 57.75 mm | 1.15 |
| Hard IV | 58.15 | 1.13% | 23.51 mm | 2.59 |
| Insane III | 93.75 | 0.43% | 12.74 mm | 3.95 |

The default calibration retains the original four string seeds for historical
comparison. `node tools/darts-cpu-calibrate.js --all-levels` reports all sixteen
numeric levels with their own seeds. Ordinary PPR is approximately:

| Tier | I | II | III | IV |
| --- | ---: | ---: | ---: | ---: |
| Easy | 19.43 | 20.09 | 21.56 | 23.46 |
| Normal | 27.12 | 29.98 | 33.82 | 37.09 |
| Hard | 40.02 | 45.30 | 50.64 | 56.67 |
| Insane | 67.89 | 78.70 | 92.22 | 109.99 |

Numeric and legacy probes use different random seeds, so their sample averages
differ at the same difficulty. A same-seed comparison with the previous curve
preserves both endpoint results exactly across ordinary scoring, full X01 games,
target accuracy, Cricket and Cork. The all-level four-player Cut-Throat matchup
keeps one of each legacy position, rather than sixteen seats.

For 301 Open In/Double Out simulations, net game PPR is respectively
12.95/21.19/48.13/76.41. A separate 1,000-dart D16 probe converts a 32-point
checkout on 1.2/5.7/19.7/32.3% of darts. The script also reports turn distributions,
Busts, closing efficiency, penalties, Cork medians/near-Bull frequency and small
matchup samples. Stronger tiers generally perform better; lower tiers can still
win some seeded games. Easy did not close all Cricket targets in the
sampled 30-round games, which therefore use normal cap settlement. These are
Gamebox tuning measurements, not real-world player classifications or guaranteed
scores. Physical phone pacing/performance still benefits from manual playtesting.

### Gameplay viewport

The same fixed viewport holds essential gameplay information in every mode.
Above 760px, players occupy the left column, the board the centre and the mode
panel the right. At narrower widths, a compact 2x2 player summary sits above the
board and the mode panel sits below it. The mobile viewport is portrait (3:5),
desktop is landscape (3:2). The page header stays visible and the game fits in the
remaining screen height from the initial ready screen onward. Start/Restart do
not hide page sections, change viewport geometry or force a scroll. The native
lobby dialog contains slots, invitations, contextual rules/help and detailed
post-leg statistics. The single Room toolbar action remains available during play,
with Invite/Join inside that dialog and
match settings locked. No mobile/desktop scoring branches are needed.

Panel bounds stay constant across Practice, X01, Cricket and Count-Up. Primary
scores appear only in the player summary. The mode panel shows three individual
turn darts and subtotal, Cricket's seven-row mark matrix, or practice release
feedback. Numbered/coloured seats link four-player marks to the player summary
without long names in table headers. Current player, dart, mode, leg/round and
optional timer remain visible. Completed turns retain their three results under
an explicit "Last turn" label until the next player throws. Cork replaces mode
details with one dart and its distance. Practice player cards show per-slot darts,
and its feedback preserves the established free-throw interaction.

Pointer-downs in `#throw-surface` or `#mode-panel` can begin a throw, allowing a
mobile flick to start below the board. Buttons, links, inputs, player cards and
result overlays keep normal interaction. History/lobby dialogs block throwing
behind them; history scrolling uses native vertical touch scrolling. Movements
and releases can continue across the window. Secondary pointers are ignored and
resize cancels a gesture. The
renderer is cropped around the existing board centre, without changing gesture
maths or ballistics. Desktop and mobile use the same canvas scale, with the board
centre at 44% and 46.5% of their board regions respectively. Backing resolution
follows its display size. The adjustable `pitchOffsetDeg` rigidly rotates the
gesture-derived launch velocity in Y/Z, preserving speed, release point and
camera. `handYOffset` sets the release height relative to the Bull in millimetres.
Detailed Count-Up statistics are expandable
after a Leg inside the lobby.

`darts-throw-guide.js` is a presentation-only first-use guide. It outlines only
the existing board surface and mode panel, with touch/mouse instructions and
below/right wording matching the layout. It waits for `canThrow` on a local
human turn, yields to notices, handoff, dialogs and active gestures, and uses a
compact single-line hint when the board region is short. It changes no grid or
board dimensions. An accepted pointer gesture or manual dismissal saves
`arcadeGames:darts:throw-guide:v1` through the shared storage helpers. Invalid or
cancelled gestures, CPU submissions and rejected online throws do not complete
it. Existing Throwing controls in the Room dialog can request the hint again;
that request waits for the next eligible human turn if necessary.

The contact dot and short trail read at most ten existing `gesture.samples`,
converting them back to CSS coordinates without adding or changing samples.
They are pointer-transparent, disappear on release/cancellation/input loss, and
never show aim or predicted flight. Reduced motion retains only the contact dot.
Only the real pointer path supplies the completion callback to `submitGesture`;
CPU scheduling, synthetic input, scoring and networking are unchanged.

Timed local matches, including host-only invitation rooms, use the same wall-clock
deadline policy and cannot pause; Timer-Off local matches can pause. Local expiry
waits while an accepted dart is
flying so its score cannot be applied to a newly advanced slot. Online clients
present the accepted throw before showing its updated score/history; presentation
does not apply a second physical pitch transformation.

`darts-opening.js` presents the already selected random starter once, at the start
of a competitive Match with two or more players. Local Start and the shared room's
atomic start patch record the chosen slot and timestamp, then delay `readyAt` and
`turnStartedAt` by 1900 ms. Player cards cycle for 1000 ms and the accepted starter
is named for 900 ms; reduced motion shows that starter immediately. Feedback blocks
human and CPU input during the presentation, and the ordinary turn receives its
full timer afterward. Shared clients derive the display from the accepted timestamp,
so repeated/delayed snapshots do not restart it. Practice, solo Count-Up, opening
Cork and later-Leg rotation retain their existing behavior.

`darts-feedback.js` coordinates local presentation only. A transition between two
different slots owned by this device requires Ready to Throw; no handoff appears
for solo play, consecutive darts or a remote-to-local transition. A pending
handoff cancels gestures and blocks board/mode-panel input until confirmation,
then requires a fresh press. A confirmation retains its displayed turn key so a
timeout cannot redirect a stale click to a later player. Enabled timers continue.

Accepted landed events, identified by match ID and accepted throw sequence,
drive Bust rollback explanations and actual Cut-Throat recipient badges. The
presentation coordinator deduplicates events across snapshot refreshes. Results
take priority over handoff, then Bust, turn notice and ordinary hit feedback.
Bust briefly explains the accepted restored score before showing any pending
handoff; input is blocked throughout. Timings are centralized in
`DartsFeedback.TIMING`. Returning to the lobby clears transient presentation.
HUD result explanations use `legEndReason`/`endReason`, mode and accepted winner
score/distance, distinguishing Leg wins from final Match wins and Cork distance
from the original mode's points. This layer does not alter scoring or deadlines.

A landed accepted winning event, or the last dart completing a Cork round, sets
`resultPending` for `TIMING.finalHit` (1000 ms), retaining its actual last-dart
result for the hit toast. Cork captures a compact completed comparison (at most
two history rows per player), so choosing the opening starter or clearing tied
distances cannot hide that last throw. The authoritative result/next phase is
already accepted; only presentation waits. Still-playing opening/rethrow outcomes
block the next local gesture during the hold, without resetting turn timers.
Afterward, opening Cork identifies the starter in the handoff or a nonblocking
notice; a tie reveals the eligible rethrow and handoff, while a Leg win uses the
existing result overlay. A newer accepted sequence cancels an obsolete hold.
Repeated snapshots do not extend the interval. HUD result
visibility updates outside its content cache so expiry reveals the result even
without a new accepted state. New match/Leg/lobby transitions clear pending
presentation; timeout/forfeit endings have no artificial winning-hit delay.

During active Cork, the top meta prioritizes a short purpose label instead of
ordinary X01 rules. The existing mode region shows a compact Cork comparison
panel: current eligible players, physical hits and millimetre distances, with
previous-round distances retained for excluded players and those awaiting a
rethrow. Names/seat colours identify the field; excluded players never appear
as waiting. This is derived from accepted phase/history data, not another score
store. No scoring or physical comparison code changes for presentation.

Cork phase notices use match/Leg/purpose/round/eligible-field identity, so repeated
snapshots cannot replay or extend them. Opening, tied-result and direct-limit
purposes have distinct copy. A rethrow gets a new notice. Pending handoff takes
priority; the Cork notice waits until confirmation and remains nonblocking.
Resolved phases, results, lobby and new matches discard queued notices. Existing
timers and Bust/final-hit timing continue independently.

The meta button contains one full text strip. `ResizeObserver` measures actual
overflow and only animates the hidden distance, with 1.8-second endpoint pauses
and roughly 20 pixels/second movement. Content/width changes reset the animation;
clock and ordinary snapshot refreshes do not. Reduced motion cancels it. The full
text is always available through the button's accessible label/title and a small
tap/keyboard popup, dismissed by Escape or an outside click. Only this rules/phase
strip moves; active-player information, timer, controls and viewport geometry stay
stationary.

### Throw history

Click a player card for that player's records, or History for the entire roster.
The dialog filters by player and shows newest turns first: leg, per-player round,
three individual hits, effective turn points, resulting score, and bust/checkout/
timeout/departure/in-progress status. Cut-Throat lists actual penalty recipients;
Cork lists one dart, tie-break round and distance. Reading history does not pause
a timed turn; a visible note explains this while its timer is running.

Rules maintain `game.history` and `game.historyDropped` in each accepted state
transition. Shared execution commits these with scoring in the same guarded
transaction; a host-only invitation match keeps them locally until returning to
the lobby. Each turn is appended once and updated as its darts land;
rejected or duplicate submissions cannot create extra records. History survives
Leg changes and brief reconnects. Returning to the lobby preserves the finished
game; a new match clears history. Departed players keep names through the match
roster. Solo Practice stores one record per accepted throw with `leg:0`;
multiplayer Practice stores three-dart turns while rotating seat order without
a winner or round limit. Both local and remote Practice use the same rules data.
There is no profile or permanent archive.

To bound RTDB room payloads, retain the latest 500 turns per match, or 500 throws
in solo Practice. A visible notice appears if older records were trimmed. An open
history dialog refreshes without resetting its filter, focus or the visible row
when new records arrive. Native modal focus trapping, Escape/Close and restored
player-card focus support touch and keyboard use. Game shortcuts do not propagate
out of these dialogs.

Modes and scoring live in [rules.md](rules.md#darts); network guards and departure
policy live in [ROOMS.md](ROOMS.md#darts-room-and-match-protocol). Run the checks listed in
[DEBUG.md](DEBUG.md#darts-checks).

## Logging

No debug URL flags or cheat console remain. The only arcade logging left is
defensive `console.warn` in `js/arcade.js` (storage read/write + i18n subscriber
failures) plus `[duel]` / `[lobby]` network warnings in the online games. The full
inventory (both engines + dev tools) lives in [`DEBUG.md`](DEBUG.md).

## Run locally & deploy

```powershell
python -m http.server 8000   # then open http://localhost:8000
```

GitHub Pages: Settings → Pages → Source `main` / root. All paths are
relative, so pushes to `main` redeploy automatically. No build step.
