# Memory implementation

This is the maintained implementation reference, not a development-phase log.
Player rules belong in [rules.md](../rules.md#memory); commands and diagnostic
tools are in [TESTING.md](TESTING.md), and analytics administration is in
[ANALYTICS.md](ANALYTICS.md). Update these files rather than adding phase reports.

The working player-facing name is **By Feel**. Its shared Lucide `blend` icon
and warm sand accent (`#d7b98e`) match on the launcher and game page; question
colors remain separate from interface decoration. Existing `memory` URLs, module
names, storage keys, protocols and analytics identifiers remain the compatibility
contract.

## Current configuration

The launcher entry is currently marked WIP while presentation is reviewed. It
retains the existing RTDB honor-system permissions and their accepted known
limitations; see the [shared security boundary](../ROOMS.md#rtdb-security-boundary).

New online matches use protocol **v14** and CPU model **v1**. Local practice and
new matches share Color scoring **V4**, seeded challenge policy **v1** and
Quantity rendering **v3**.
Online defaults are **500 HP**, **12 rounds**, **8 maximum participants** and
**15 seconds of results**. At least one human and two total actors are required;
one human can play against owned CPUs. The room need not be full.

Preparation defaults to 3s. Color's base memory/answer windows are 4s/25s; Pitch
and grouped Quantity have their own mappings. Actual per-question generation
parameters and timelines are frozen before play; do not assume every category
has the Color timing. The lobby results control offers 2–30s; reducer validation
also supports retained configurations outside that UI range.

Category weights are Off/Low/Medium/High = 0/1/2/4. The weighted bag limits long
repeats; all-Off cannot start. Challenge conditions sample easy/normal/hard with
default weights 20/60/20 and levels 2–4/4–7/7–9. They do not adapt to scores.
Quantity has its separate exact-count progression, documented with the current
stage ranges in [player rules](../rules.md#quantity-memory).

## Implementation ownership

| Files under `js/games/` | Responsibility |
|---|---|
| `memory.js`, `memory-online.js` | Local view/state, online snapshot coordination and room UI |
| `memory-match.js`, `memory-rules.js` | Pure versioned match reducer, deadlines, fixed-point HP/damage |
| `memory-room.js` | Host/Ready/ownership policies over shared `js/net/rooms.mjs` and RTDB adapter |
| `memory-categories.js` | Shared category validation, grading and configuration dispatch |
| `memory-challenge.js`, `memory-progression.js` | Current seeded challenge policy and retained legacy adaptation/selection |
| `memory-color.js`, `memory-color-single.js`, `memory-color-variants.js` | Oklab/scoring, current RGB8 questions, retained HSL/Hue variants |
| `memory-quantity*.js`, `memory-dots.js` | Count questions/scoring, exact-count stages, groups and rendering |
| `memory-pitch*.js`, `memory-audio*.js` | Melody questions/scoring/controls, playback and audio readiness |
| `memory-cpu.js` | Seeded CPU answers/delays; never awards scores or changes HP |
| `memory-results.js`, `memory-results-view.js` | Completed-round capture, rankings, presentation and review |
| `memory-playtest.js`, `memory-analytics.js` | Separate opt-in local diagnostics and automatic best-effort analytics |

Pure modules work in CommonJS tests and the browser. Reuse them in tools;
do not duplicate grading or settlement formulas. New gameplay changes must
retain the explicit protocol/configuration of already-running matches.

## Scoring

Scores retain 0.001-point precision. Score/HP/damage integers use **1,000 units**
per point/HP. Color HSL and RGB controls edit the same canonical RGB8 answer;
switching controls without editing must not change it.

| Category | Current error and curve |
|---|---|
| Color | Oklab distance `d`; `100*exp(-(d/.20)^1.4)*exp(-.35*(max(0,d-.08)/.10)^1.5)` |
| Quantity | Absolute relative count error, or equal-weight RMS across groups; `100*exp(-(error/.30)^1.5)` |
| Pitch | RMS signed cents errors over adjustable notes only; `100*exp(-(rms/180)^1.3)` |

Color V4 parameters are tolerance .20, exponent 1.4, knee .08, width .10,
strength .35 and penaltyExponent 1.5. V1/V2/V3 remain for frozen matches and
diagnostics. Missing answers receive the existing zero-score settlement but
remain distinct from valid zero-score answers.

Damage is the gap to the highest round score times the multiplier. All tied
leaders take zero damage; attacks do not stack. Default round multipliers are
1, 1, 1.3, 1.3, 1.7, 1.7, 2.2, 2.2, then 3. HP clamps at zero.

## Question and CPU contracts

- Quantity uses the same deterministic ordered pool during memory and answering.
  Equal counts reproduce the same arrangement; adding/removing a count changes
  only the pool prefix. Grouped shapes have equal filled areas and stable
  coordinates. Current groups are blue circle, orange square and green triangle.
- Quantity stage increases only if every human required at round start submits
  exact counts manually and on time. Missing/invalid/auto receipts or departure
  prevent the increase. CPUs never qualify a round; new matches reset stage 0.
- Current Pitch questions have 3/4 tones and one reference in a valid position.
  Each adjustable tone has a wheel and starts at **440 Hz**. Fixed references
  do not dilute RMS. Legacy five-tone/two-reference interfaces remain supported.
- CPU profiles and model version freeze at Start. Difficulty 1–4 changes seeded
  answer error/delay distributions. Actual CPU receipts pass through the same
  scoring, deadline and HP settlement as human receipts.
- CPU ownership is device/controller based. Leaving removes that human and its
  CPUs; other clients do not take them over. Same-tab refresh can recover the
  existing human and CPUs while their membership still exists (see below).

## Same-tab recovery

`js/games/memory/recovery.js` owns the browser session location/identity;
`memory-online.js` awaits shared lazy `rooms.ready()` initialization and Firebase
Auth restoration before using it, and
`memory-room.js` resumes membership transactionally. The sessionStorage key
`gamebox:memory:recovery:v1` stores only `{version, uid, sessionId, room}`. The UID
binds the random controller suffix to the restored account; it is not a credential.
No tokens, questions, snapshots, answers, CPU plans or audio confirmation are
stored. Storage is tab/origin scoped, with no identity in localStorage or URLs.

On reload, an existing room location triggers automatic initialization. Resume
checks the original controller's membership and human seat inside a transaction;
it never calls Join or inserts participants. Removed membership or a missing room
clears the stale location and explains how to join normally. Temporary network
errors retain it; opening Room retries. Names, human/CPU IDs, CPU difficulties,
roster, match ID and frozen settings remain authoritative. The existing view
shows the current phase/timestamps and accepted receipt. It resets an **unsent**
draft to the normal initial answer; no answer period is extended. CPU scheduling
resumes only for owned, eligible actors with no accepted receipt, using the same
seeded plan/nonce and transaction/deadline guards.
After Auth and any original-room recovery complete, online initialization starts
one best-effort background cleanup per authenticated page identity. It does not
delay create/join, retry initialization, or replace the normal host maintenance.
Clock calibration, conservative expiry and transaction guards belong to the
[shared cleanup contract](../ROOMS.md#cleanup-time-and-entry-points).

An exclusive Web Lock fences each effective controller for the document lifetime.
A copied sessionStorage tab cannot acquire an already held lock: it receives a
fresh ID, loses the copied room location and displays an explanation. Independent
tabs normally start with different IDs. Without Web Locks, stored IDs are never
reused; ordinary room entry remains available with a fresh page identity, but
automatic refresh recovery is unsupported. Blocked sessionStorage similarly
prevents durable same-tab recovery. These checks avoid accidental concurrent
control, not malicious ownership transfer. Different devices/accounts, cleared
storage, already-removed seats and browser-restored/closed sessions are not
guaranteed recovery paths.

`pagehide` detaches local listeners/control and releases the lock; it does **not**
Leave or withdraw. A BFCache `pageshow` reloads to revalidate Auth, lock ownership,
membership and audio. Explicit Leave removes the human and owned CPUs under the
existing departure policy and clears the saved room. Auth changes detach and
clear recovery rather than claiming the previous account's seat.

Memory opts out of the shared `onDisconnect(...presence/uid).set(-1)` handler:
an old connection cannot then erase a refreshed connection's newer presence.
It retains 3s heartbeats and the existing **15s observer grace** with a random
initial counter per page. Peers recheck the observed beat during removal, so a
successful resume pulse protects a still-seated member from stale cleanup.
Other games retain native disconnect markers. Long suspensions can legitimately
lose membership; no client-side mechanism can promise recovery after reaping.
If everyone disconnects, cleanup requires a later online client; the existing
5-minute inactivity cleanup remains client-driven, not a server TTL job.

Valid general Ready/revision records survive recovery. Audio confirmation is
document-local: Resume removes only this controller's old audio acknowledgement,
preserving general Ready and other players' records. A Pitch-enabled lobby cannot
Start until this page completes the normal test-tone/confirmation again. During
an active match, playback recovery uses the audio setup UI without changing the
shared phase or timer; missed memorization time is not replayed or extended.
The existing guard still defers test-tone playback until memorization ends, and
the active-match setup explains that it neither restarts nor pauses the round.
Ordinary same-page rematches still retain usable audio. Analytics remains RAM-only;
a refresh may lose earlier observations, so incomplete captures stay skipped.

## Audio and results

Pitch-enabled categories require **Play test sound → I can hear it** for every
human. Guests then Ready; the host does not need a separate Ready action. CPUs
and Pitch-Off rooms are exempt. Confirmation survives ordinary lobby edits and
rematches while audio is usable. Mute, explicit reset or failed recovery require
another confirmation. A successful browser audio test does not prove audibility.

Round results replace the answer view. Scores, score-gap damage and HP reveal
over the existing first three seconds, followed by a stable result until the
shared result deadline. Reduced motion/short windows can show the final state
immediately. Opening Room or review never pauses canonical timers. Historical
Pitch playback yields to current-round audio and page visibility.

There is one Room button, in the **upper-right Memory card header**. Global
sound/language controls remain in the top bar. Online headers are sticky;
measured header heights drive mobile offsets and results scrolling. Small screens
use internal result scrolling with hints and minimum 44px Room touch height.

## Final ranking and rematch

`game.winners` determines victory. V14 placement compares survivors first, then
remaining integer HP; eliminated actors compare later elimination round and then
higher unclamped remaining HP. Exact ties share competition ranks (1,2,2,4).
Seat order stabilizes a tied display only. A living withdrawal is unranked unless
already a declared winner; an earlier elimination retains its rank after leaving.
Ranking first must never manufacture victory when `winners` is empty.

The summary shows win/shared-win or neutral **Match finished / 比賽結束**, plus
local placement. Empty winners gets **No winner this match / 本場沒有勝出者**.
The host selects **Prepare next match / 準備下一場**; all return to the same lobby,
guests Ready again, then the host explicitly Starts. A disconnected host gets
reconnect guidance. Room code, roster/CPU settings and usable audio remain;
Ready resets, and Start creates fresh match ID/seeds/HP/progression/submissions.

Lobby **View previous match results** reads the retained finished `game`, without
writes or Ready changes. **View last round** is separate. Contextual Back returns
to the appropriate standings or lobby; a new match dismisses historical views.

## Compatibility and storage limits

Frozen protocols **v1–v13** retain their own supported branches; active matches
are never migrated to new defaults. V14 records `{round, rawRemainingHpUnits}`
in `eliminations` atomically with settlement. V13+ can settle early only after
all eligible valid receipts are committed; v1–v12 retain deadline-only settlement.

RTDB stores current question/submissions, the latest result, frozen roster/config
and cumulative HP/eliminations, **not full round history**. Advance replaces
question/receipts, Start replaces the game, and last-controller departure deletes
the room. Do not join a new question with an old `lastResult`. Browser review is
bounded; only [analytics](ANALYTICS.md) attempts persistent full-match capture.
The RTDB browser trust model and deployment policy live in [ROOMS.md](../ROOMS.md).

For publication, use the [shared release gates](../ROOMS.md#release-gates), the
regression commands in [TESTING.md](TESTING.md), and the separate
[analytics upload/export verification](ANALYTICS.md#tests-and-deployment).
Confirm the integrated release branch and published Firebase configuration before
claiming readiness; a passing local Memory suite does not cover parallel changes
to other games or establish that production analytics permissions are deployed.
