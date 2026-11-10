# Debug & dev affordances

A running list of the non-shipping dev surface in the project.

The per-game debug / demo **URL flags** (`?hashi_debug`, `?sudoku_demo`,
`?patches_demo`, `?patches_debug`, `?queens_debug`, `?zip_debug`, and the arcade
`?debug=1` overlay / cheat console) have all been removed — no `[DEBUG-HOOK]`
URL flags remain in the code. The `*Internals` generator exports below are kept
because the `tools/` self-test pages depend on them.

## Dev tools (`tools/`)

Standalone pages, not linked from anywhere in the app (no nav points at them),
loaded manually by opening the file. Safe to ship, but they are dev surface:

| Tool | Purpose |
| --- | --- |
| `tools/queens-solver-trace.html` | Step through the Queens generator/solver and inspect each deduction + score. |
| `tools/sudoku-solver-trace.html` | Step through the Sudoku solver technique-by-technique on a generated/seeded puzzle. |
| `tools/tango-solver-trace.html` | Step through the Tango solver's deductions one at a time. |
| `tools/patches-solver-trace.html` | Step through the Patches solver (single / core) on a generated puzzle; `?tech=core\|tier3\|commit` auto-jumps to that hint. |
| `tools/patches-gentest.html` | Self-test: drives the real `generate()` a few seeds per size/tier — checks solvability + soundness, that medium lands in its hardness window, that median hardness climbs (easy ≤ medium ≤ hard), and reports tiling-density stats. |
| `tools/patches-hintfix.html` | Self-test: hint soundness + full solve walkthrough, plus the no-leak and forced-cell-merge regressions. |
| `tools/zip-gentest.html` | Self-test: drives the real `generate()` across sizes/tiers — checks each solution is valid + unique (cross-validated against an independent cell-based counter on small N) and that base checkpoint density is monotonic; reports checkpoint/wall counts + timing. |
| `tools/nonogram-gentest.html` | Self-test: drives the real `generate()` across sizes/difficulties — checks each board is line-solvable and **unique** (cross-validated against an independent DFS solution counter), that the clues match the solution, that the difficulty score climbs (easy ≤ medium ≤ hard), and that tier-3 (enumeration) reliance is non-decreasing; reports the per-difficulty technique profile (n1/n2/n3), median depth, score + timing. |
| `tools/nonogram-hintview.html` | Visual check for Nonogram hints: renders generated boards with the first `nextStep` hint drawn (row/column clue ranges + fills/blanks) using the real board geometry so the hint overlay can be eyeballed. |
| `tools/guards-gentest.html` | Self-test for Guards (Akari / Light Up): drives the real `generate()` across sizes/difficulties — checks each shipped solution is valid, is **unique** (independent backtracking counter) and solvable at its difficulty's depth (Easy/Medium by pure propagation, Hard by one assume→contradiction step), that Hard genuinely needs that step, and that the shown-clue count is monotonic (Easy ≥ Medium ≥ Hard); also sweeps larger sizes for timing + never-blank. |
| `tools/hashi-gentest.html` | Self-test for Hashi (Bridges): drives the real `generate()` across sizes/difficulties — checks each shipped solution is valid, is **unique** (solver counter cross-validated against an independent brute-force counter on small boards), is solvable within its difficulty's reasoning budget and **hint-drivable** (the `nextStep`/`nextStepDeep` engine solves it from empty), that island numbers are within capacity, and that difficulty tier is monotonic; reports island counts + timing. |
| `tools/hashi-view.html` | Visual check for Hashi rendering: draws a generated board solved (single/double bridges), won (green), with a hint band + ghost, and a conflict (crossing bridges + over-filled island) — reuses the real CSS classes to eyeball the board vocabulary. |
| `tools/hashi-hintview.html` | Visual check for Hashi hints: finds a board state that surfaces a grounded deduce hint (e.g. "one short of full") and a Hard assume→contradiction walk-through, then renders each with its anchor rings, ghosts and numbered chain so the hint vocabulary can be eyeballed. |

## Room checks

```text
node tools/rooms-check.js
node tools/room-traffic-check.js
node tools/beam-room-check.js
node tools/rune-room-check.js
node tools/rtdb-room-check.js
# Optional: real Chrome pages with a local fake Firebase SDK
node tools/rooms-browser-check.js
node tools/rooms-browser-check.js --invalid-rtdb
```

For Darts-specific commands and coverage, see [Darts checks](#darts-checks).

The core check uses the actual RTDB adapter and a serialized native-tree fixture
for contention, capacity, policies, authority, subscription lifetime and cleanup.
Game checks execute both games' actual handlers with DOM/drawing stubbed, covering
independent tabs, spectators, host-controlled starts, readiness resets, departures,
host migration, rematches, result closing, vanished rooms and single settlement.
The core check also covers opt-in all-ready starts. Controlled clocks cover presence,
recovery before eviction and native disconnect/reconnect.

The optional browser check loads the real pages, modules and shared UI. It covers
creation, joining, starts, results, rematches, rejoining, input preservation,
320px/768px layout and Beam solo settlement. Firestore stubs reject room access;
profile reads/writes still work even with invalid RTDB settings. All SDK calls
are redirected locally; these checks never access production Firebase. Pass a
Chrome executable as the first argument if the Windows default path is unavailable.
Rules JSON is checked locally, but server-side authorization still requires the
Firebase rule evaluator or a live-project check after publishing rules.

## Darts checks

```text
node tools/darts-rules-check.js
node tools/darts-room-check.js
node tools/darts-feedback-check.js
node tools/darts-opening-check.js
node tools/darts-hud-check.js
node tools/darts-cpu-physics-check.js
node tools/darts-cpu-strategy-check.js
node tools/darts-cpu-difficulty-check.js
node tools/darts-cpu-calibrate.js
node tools/darts-cpu-calibrate.js --all-levels
node tools/rooms-browser-check.js --darts
node tools/rooms-browser-check.js --darts-cpu
node tools/rooms-browser-check.js --darts-opening
node tools/rooms-browser-check.js --darts --invalid-rtdb
```

The Darts module checks and CPU calibration run without packages or network. The rules check covers
Open/Master/Double In and Out, whole-turn score/entry rollback, physical Bull
identity under 25/50 and 50/50 scoring, Standard/Cut-Throat recipients and wins
(including a non-throwing winner), per-participant round limits, score settlement
and Cork distances/repeated ties. It also covers unlimited single/multiple-player
Practice, first-to-1/2/3 Leg progression, history retention and atomic controller
departures. The real gesture/ballistics functions still run against their golden
velocities and deterministic pitch-rotation checks.

X01 expansion checks preserve the old 501 scenarios and cover all six starting
scores across every In/Out combination, automatic defaults versus explicit caps,
all expanded round choices and equal opportunities. Opening Cork is exercised
with 2/3/4 players, tied retries, timeouts, controller departures, unchanged normal
statistics and later-Leg rotation. Direct X01 limit Cork includes all contenders
regardless of prior scores; numeric ties retain the existing tied-leader Cork.

The Cork coverage audit found existing exact-distance/tolerance rethrows and a
four-controller opening tie. Additional deterministic cases now cover all three
purposes with 2/3/4 players: a tolerance tie, a second exact tie and a decisive
third round. Only tied players rethrow and normal scoring data stays unchanged.
Room cases exercise each purpose with four remote controllers, excluded-owner
rejection, stale-round guards and concurrent duplicates accepted only once.

The feedback check covers same-device ownership transitions, fresh confirmation,
stale confirmations after timeouts, snapshot/event deduplication, actual accepted
penalty recipients, Bust-to-handoff sequencing and result priority. The HUD check
uses accepted rule transitions for the Leg/Match victory-reason matrix, every
mode's cap, tied-score Cricket closures and Cork distance, plus restored Bust
scores/history and penalty effects that expire without discarding accepted data.
Final-impact checks hold the accepted finished state while showing its last hit,
expire without replay, reject scoring/timeout after completion and clear on reset.
Completed Cork-round checks cover opening starter, Leg winner and tied rethrow
outcomes. The last thrower's distance and the full completed field stay visible
before the next phase/handoff, including when an earlier thrower wins. Tests also
cover a last-thrower opening winner without handoff, unchanged timer deadlines,
duplicate snapshots, newer timeouts and cancellation on reset. Browser checks
verify actual gesture blocking and synchronized remote opening/rethrow displays.

`node tools/rooms-browser-check.js --darts-turn-hit` checks third-dart hit text at
320/390/1200px, delayed local handoff, human-to-CPU and physical CPU-to-human turns,
two-device result agreement, ordinary-to-Cork transition, snapshot deduplication
and unchanged accepted scoring/timer state. It verifies that the result outlives
the dart sprite and that a new accepted hit clears the preceding turn notice.
These cases also run in `--darts`. Add `--darts-mobile` or `--darts-desktop` for
ignored `.cache/darts-turn-hit-mobile.png` or desktop previews. Pure feedback
checks cover local/remote/CPU input gating, interval boundaries and stale states.

The room check uses the actual room core, Darts policy and RTDB adapter against
the native-tree fixture. It exercises separate controllers and player slots,
one- and multiple-slot ownership, same-device and mixed-device matches, capacity,
configuration/Ready races, locked match snapshots, rejected impersonation and
duplicate throws, timers including Off, full Count-Up, Cut-Throat penalties,
same-code mode switching, retained results/history and reconnect/eviction with
host transfer. Host-only invitation scenarios keep four slots and two Legs local
across 120 throws without changing the stored scoring sequence, skip the network
turn watchdog, and upload finished history once on Return to Lobby. They reject
altered ownership/rules and duplicate boundary writes, retain the invitation,
and select shared execution after another device joins the next match. Default
numbered names remain distinct after seat removal. The check also covers older
room values starting a normalized match.

The browser check also exercises Google account display-name defaults without
starting local matchmaking, account changes deferred until the lobby, preserved
custom names on invitation creation, and sign-out clearing the name hint.

The browser check loads real pages, physics, canvas, the unified lobby and modules
with only Firebase SDK imports redirected to local fakes. Its V2 scenarios live
in `tools/helpers/darts-browser-v2.js`, injected by the local server; game test
hooks are never shipped in the production page. Scenarios cover immediate
offline Practice/Count-Up without loading networking, mode minimums, promotion
preserving local slots, two players per device, four remote controllers,
Ready invalidation, ownership, match locking, results and another mode in the
same room. The lobby uses one Room toolbar entry, with invitations inside it,
and explains the currently selected rules and valid player count. History
scenarios exercise player/all filtering, independent scrolling,
live-update anchor preservation, modal input blocking and focus restoration.
Invalid-backend checks leave local Practice and account profiles working.

Gameplay UX cases cover four-slot handoffs at small mobile sizes, blocked bottom
panel gestures, confirmation without throwing, stale releases/clicks across
timeouts, and continued countdowns. Mixed-device turns require confirmation only
between two slots on that device. Accepted impacts show actual Cut-Throat changes
for 3/2/1/0 opponents without heartbeat replay; Bust restores the accepted score
and retains history. Result reasons are checked in EN/ZH. Room-loss fallback keeps
a pending local handoff, while a timeout superseding a flight suppresses its stale
scoring effects.

Expansion browser cases check actual X01 variant labels, all caps, explicit cap
preservation, independent Cork controls, frozen settings and Ready resets. Local
opening Cork covers 2/3/4 slots; mixed-device Cork uses actual accepted flights.
Decisive X01/Cricket/Count-Up/Cork impacts show their hit for one second before
the result appears, on both clients when shared. Expanded advanced settings keep
Start/Ready reachable on small mobile viewports.

Cork clarity checks verify context-specific entry/rethrow notices, handoff-first
queuing, current eligibility and retained comparison distances on mobile/desktop.
Status checks measure real overflow, inspect the paused-endpoint animation,
confirm no animation for fitting text and test resize/language/state resets.
Reduced-motion checks disable movement while preserving the accessible full-text
popup. Fixed region bounds, timer/control separation and page horizontal overflow
are checked at 320x568, 390x844 and desktop sizes in EN/ZH.

CPU feasibility loads the actual private human physics through a test-only VM
helper. It proves all 20 sectors/single-double-triple rings, both Bulls and an
intentional miss, deterministic samples/impacts, logical-coordinate viewport
normalization and cache reuse. Seeded gesture execution produces measured PPR,
miss/target distributions, turn variance, D16 checkout and Cork distance metrics.
The strategy check covers all six X01 starts and In/Out/Bull rules, legal
multi-dart routes, distinct Cricket attacks/closures and eligible-only Cork. The
calibration script reports ordinary versus full-game PPR, Cricket MPR/closing
efficiency/penalties and matchup samples; see DEV's local CPU section for its
definition and known Easy Cricket limitation.

The difficulty check verifies all sixteen levels, invalid inputs, the original
Easy I profile and golden results, top-level scoring near 100 PPR, ordered intermediate
strengths, legacy/numeric seeded target and gesture agreement, and increasing
common-seed real-physics scoring/Cork precision. A 30,000-attempt probe per target
checks softer high-level lapse position errors, rare inner-target board misses
and natural edge-double misses without impact correction. The calibration report
uses confidence intervals to avoid treating close, independently seeded sample
means as a skill-order regression.
Calibration defaults to the original four seeds; `--all-levels` reports the full
numeric scale. Browser lobby checks select every level at 320/390/1200px, verify
EN/ZH labels and focus/Ready behavior, render legacy values without mutating them,
and promote a level-zero CPU into a coded room. Room checks exercise all sixteen
owner-only edits, invalid-level rejection and legacy snapshots at Match start.

`--darts-cpu` runs the focused real-browser subset (also included in `--darts`).
It completes five-round Count-Up for all four human/CPU compositions through real
synthetic gestures and replays each sample to verify its physical impact. It
checks no Firebase requirement, visible difficulty, locked roster, human input
blocking, human handoff across CPUs, pacing, unchanged deadlines, pause/modal/
timeout/reset/replacement cancellation, both Cricket variants and every Cork
purpose including ties and final-impact holds. No test hook ships in the game.
Optional `--darts-cpu --darts-mobile`, `--darts-cpu --darts-desktop` and
`--darts-cpu --darts-lobby --darts-mobile` write ignored CPU screenshots in `.cache`.

`node tools/darts-online-cpu-check.js` exercises device-owned CPU lobby edits,
revision/Ready invalidation, locked participants, the real gesture/physics
pipeline, all X01 starting scores and In/Out combinations, both Cricket variants,
all Cork contexts with physical ties, competing controller attempts, queued
deadline expiry, stale requests and host departure on the existing RTDB fixture.

`node tools/darts-online-cpu-browser-check.js` uses separate Chrome browser
contexts (isolated storage) at mobile/desktop sizes. A local HTTP CAS fixture
replaces only the Firebase SDK and shares room state between contexts, with
delayed/repeated snapshots, delayed acknowledgements and connection controls.
It checks owner-only CPU scheduling and accepted physical-impact agreement,
cross-device Ready reset, coded local execution, complete mixed Count-Up,
Cricket/opening Cork, H1/CPU/H2 handoff, delayed/lost acknowledgements, queued CPU
deadline expiry, same-page recovery before reaping, pending disconnect and host
migration. Game hooks/clocks and the
HTTP backend are test-only. Neither suite evaluates deployed security rules,
contacts live RTDB or automates a physical phone.

`node tools/rooms-browser-check.js --darts-guide` checks first-use guidance and
the existing pointer path at 320x568, 390x844 and 1200x800 in EN/ZH. It verifies
touch/mouse wording, real region highlights, unchanged board/HUD bounds, an
unobscured board number ring, no page overflow, board/nested-panel starts,
interactive controls, invalid/cancelled gestures, pause, reduced motion,
accepted-human-only completion, replay from help and persistence across pages,
Legs and Matches. CPU-first and mixed-device turns check ownership and handoff.
The same actual samples are replayed through physics to compare human impacts.
These cases also run in `--darts`. Add `--darts-mobile` or `--darts-desktop` to
write ignored `.cache/darts-guide-mobile.png` or `darts-guide-desktop.png` previews.

`node tools/darts-opening-check.js` covers the random starter's accepted selection,
timestamp-derived draw/reveal, full first-turn deadline, reduced motion, lifecycle
cleanup and Practice/solo/Cork exclusions. `--darts-opening` exercises the real
browser UI at 320/390/1200px, early-input rejection, two-device agreement,
owner-only CPU start, cancellation and later-Leg behavior. It also advances local
and shared CPU turns through hidden-page maintenance without animation updates,
including Timer Off and paused local play. These checks also run in `--darts`.
Add `--darts-mobile` or `--darts-desktop` for ignored opening screenshots in `.cache`.

`node tools/rooms-browser-check.js --darts-cricket-focus` samples actual canvas
pixels for both Cricket variants at 320/390/1200px. It checks target contrast,
own-only versus global closure, Bull closure, withdrawn-player exclusion, unchanged
accepted state/board bounds, and ordinary colors in Cork/X01. These cases also run
in `--darts`. Add `--darts-mobile` or `--darts-desktop` for ignored Cricket focus
previews in `.cache`.

Lobby checks keep the header/footer visible at every content scroll position
with four players and expanded rules at 320x568, 390x844 and 1200x420. They verify
mode-aware Start/Starting/Ready/waiting labels, minimum-player reasons, per-device
readiness counts and cancellation, and matching compact/detailed rule summaries.
A simulated visual viewport resize/offset checks name editing with a keyboard-sized
visible area; this does not automate a physical mobile keyboard.

Layout checks compare board/player/mode bounds before and after Start and across
modes at 320/390/768/1200px. They cover four-player Cricket, visible dart counters,
player HUD drags that must not throw, and board/bottom-panel gestures that must.
Optional screenshot checks write ignored artifacts to `.cache/darts-mobile.png`
and `.cache/darts-desktop.png`:

```text
node tools/rooms-browser-check.js --darts-mobile
node tools/rooms-browser-check.js --darts-desktop
```

These checks never access production Firebase; published-rule
authorization still needs the Firebase evaluator or a deployed two-tab check.

## Announcement checks

```text
node tools/announcements-browser-check.js
node tools/notifications-check.js
```

The browser fixture uses actual launcher/controller DOM with local fake accounts.
It covers draft creation, publishing, editing, withdrawal, locale fallback,
plain-text rendering, safe manifest-only game links, pagination, profile/guest
read markers, account transitions, version notifications, shared feedback dots
and 320/390/768px layouts. No real announcements are published.

Using the test dependencies and Java/PATH setup from [Feedback checks](#feedback-checks):

```text
node .cache/feedback-tests/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.json --only firestore --project demo-gamebox "node tools/announcements-rules-check.mjs"
```

The real-rule fixture verifies public/draft isolation, verified-admin publishing,
atomic post/index updates, stale editors and readers, concurrent account read
markers, preservation of existing profile fields, withdrawal and draft deletion.
Bulk-read tests cover unloaded pages, guest persistence, new/updated posts arriving
during acknowledgement, feedback-dot independence and late account results.

For a local acceptance check after publishing the updated rules/index, use
Manage announcements to save a draft: it must remain invisible to visitors.
Publish it and confirm the Announcements/menu dots appear for a reader. Opening
the board alone must not mark it read; expanding the post must do so. Updating
published content should notify again; withdrawal must remove the public item.
Verify a visitor's read marker survives a reload in that browser, and a Google
account's marker survives a sign-out/sign-in. Another device loads those markers
at normal profile sync, not through an additional permanent listener.

## Feedback checks

```text
node tools/feedback-browser-check.js
node tools/notifications-check.js
node tools/rooms-browser-check.js --account
node tools/rooms-browser-check.js --account --invalid-rtdb
```

The feedback browser check uses real launcher DOM with local fake data: owner
history, pagination, latest admin response/update, handled status, deletion,
unread notifications, explicit read acknowledgement, safe plain-text rendering,
the nested menu/inbox/tab/reply dots (including multiple unread items and listener errors),
independent announcement/feedback sources and unchanged button sizes,
account changes, translation and 320/390/768px layout. The account checks load the
actual networking modules with only the Firebase SDK replaced. They cover
profile access, feedback listener integration, sign-out and RTDB configuration.

Admin coverage includes the separate new-submission branch, its 20+ lower bound,
New submissions tab, viewport dwell versus offscreen cards, shared acknowledgement
between two admins, handled-status independence, listener/write failure recovery,
background unsubscribe/reconnect, modal-close cancellation and stale results after
an admin switches to an ordinary account. Legacy notes do not produce new dots;
clearing the admin queue leaves personal reply and announcement dots intact.

`notifications-check.js` tests the pure unread tree: ancestor aggregation,
independent sources, lower-bound counts, publisher replacement, cycle rejection,
and late publishers after account changes. It uses no Firebase or browser.

Actual authorization uses the **Firestore emulator**, not that UI fixture.
Install test dependencies in the ignored cache (no runtime/build dependencies):

```text
npm install --prefix .cache/feedback-tests --no-save --no-package-lock firebase-tools @firebase/rules-unit-testing firebase
node .cache/feedback-tests/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.json --only firestore --project demo-gamebox "node tools/feedback-rules-check.mjs"
```

Node 22+ and Java 21+ must be on PATH. The test refuses to run without
`FIRESTORE_EMULATOR_HOST`, uses only `demo-gamebox`, and tests the actual rules:
cross-account queries/reads, forged identity, unauthorized status/reply/delete,
oversized and pre-filled payloads, stale response/read guards, legacy records,
admin-only new-submission acknowledgements, idempotent concurrent reads, bounded
queue refill/cursor pagination, profile isolation and retired Firestore room paths. Permission-denied probes are
expected; only an unexpected success/failure fails the check.

After publishing the rules and indexes as described in
[DEV.md](DEV.md#publish-feedback-rules-and-indexes), submit as account A, reply as
an admin in another browser, and confirm A receives a homepage notification.
Open My feedback and expand the response: only then should it be marked read.
Update the response to receive another notification. Account B must never see
A's submission or response; signing out must remove private views immediately.
Confirm anonymous submission still works without promising later account access.
For the admin queue, send a new note from the refreshed website and confirm the
Feedback inbox/menu dots appear for an admin. Open the inbox and leave a lower
card offscreen: only text viewed for half a second should be acknowledged. Another
admin's view clears that same shared marker. The handled checkbox must remain
unchanged, and older notes missing `adminUnread` must remain visible in All feedback.

Known pre-existing check limitation: the default `rooms-browser-check.js` and its
bare `--invalid-rtdb` UI path still expect Beam's retired `#lobby` structure.
Both fail on the current Beam page even with the committed networking layer.
`--account` avoids those stale UI selectors and verifies the shared network layer.
The room-core and RTDB-model checks remain available separately.

## Birthday checks

Run from the repository root:

```text
node tools/birthday-check.js
node tools/birthday-browser-check.js
node tools/birthday-browser-check.js --reduced-motion
node tools/birthday-settings-browser-check.js
```

The Node check covers dates, directional wind/recovery, profile caching and
account-switch safety. The Chrome checks use actual pages with fake accounts,
profile writes and a fixed local clock. They verify birthday entry, candle
controls, completion/repeat behavior, midnight expiry, manual settings and the
absence of an anytime entry or birthday-eligibility bypass. They use no real
Firebase data. Browser checks require Chrome and Node 22+.

For a real local test, serve the site with `python -m http.server 8000`, sign in
normally, and open **Menu > Personalization**. Save today's month/day. The entry
updates immediately behind settings; automatic entry waits until the dialog closes.
A different date, deleted/missing date or signed-out account must hide the entry
and prevent direct ceremony access.
Changing settings does not require Google birthday permissions or Console changes.

To repeat a complete first-entry test on the same day, remove the current
account/date's `entered` and `completed` keys from **both** localStorage and
sessionStorage, then reload the homepage. The key formats and data flow are in
[DEV.md](DEV.md#birthday-personalization). Removing only `entered` restores the
automatic redirect while preserving completed-proceedings wording. Normal use
does not reset markers when the birthday field changes. Localhost and the deployed
site, different browsers and different devices have independent marker storage.

## Account startup checks

Run `node tools/auth-startup-audit.js` for isolated SDK dependency/permission
checks and `node tools/auth-startup-browser-audit.js /path/to/chrome` for the real
launcher with delayed account/admin fixtures. Neither uses a real account nor
reads/writes Firebase.

The SDK checks hold Firestore or RTDB for 800 ms and require Auth delivery before
release. The homepage must not import RTDB or room implementation modules. Checks
also cover explicit popup dependencies, shared roster reads, server verification,
transient failures/retries, permission denial, stale A→B→A responses, unsubscribe,
and failure isolation between Auth, Firestore and RTDB.

The browser checks restore identity after 2200 ms, publish Firestore services
at 2800 ms and hold membership for another 1500 ms. Identity must appear before
Firestore, unknown identity must never offer sign-in, and pending WIP clicks must
wait. They verify cancellation, automatic continuation after approval, stable
admin menus on locale changes, one lookup per identity, explicit retry, account
changes and logout. Timing fixtures are deliberate delays, not production latency
measurements.

`node tools/rooms-browser-check.js /path/to/chrome` tests Beam and Rune Stones
with the real network module and a local fake Firebase SDK. Add `--darts` for
Darts, `--account` for profile/feedback integration, or `--invalid-rtdb` for failure
isolation. Non-screenshot checks use Chrome's debugging protocol with real frame
time; virtual-time DOM dumps can stall on asynchronous imports.

For an affected real account, inspect the SDK requests, `arcade-auth-ready`, the
first `ArcadeAuth.onAuth` callback, `arcade-net-ready`, and `config/admins` read in
that account's browser. A signed-out timing sample cannot establish its token
restoration or server-read latency. Do not share account tokens in diagnostics.

## Ungated console logging

Not behind any flag — plain defensive/dev `console.warn` / `console.log` that
fires in normal runs. Nothing here changes behaviour, but strip/quiet it if you
want a silent console. Find them with `rg "console\.(log|warn)"`. Current spots:

- `js/generators/tango.js` — row-rejection budget exhausted; "returning unverified".
- `js/games/queens.js` — a solver-state warning.
- `js/games/rune-stones.js` / `js/games/beam.js` — `[duel]` / `[lobby]` network errors.
- `js/net/net.js` — `[ArcadeNet]` disabled on boot (missing/invalid config) and stale-room cleanup failures.
- `js/puzzle.js` / `js/arcade.js` — `[common]` storage read/write + `[i18n]` subscriber failures (plus, in the arcade shell, an `[input]` press-handler guard).

## Cleanup checklist

When preparing a release build:

1. `rg "console\.(log|warn)"` and quiet anything you don't want shipping.
2. Decide whether to ship or drop the `tools/` pages.
3. Update this file.
