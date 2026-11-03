# Birthday-only proceedings

The birthday feature is a standalone game at `games/birthday.html`, with a
prominent, personalized entry above the homepage search. It is deliberately
outside the ordinary game manifest and filters. Both Chinese and English use
the same mock-official register: a formal letter, findings, resolution and seal.

On mobile, the complete letter comes before the portrait, seal and candle start
button, matching DOM and reading order. Desktop retains the letter and sticky
ceremony column side by side. Mobile notice pages show a small, non-interactive
cue near the bottom safe area while content remains below the viewport. Its short
caption points toward the candle ceremony after the letter, or to repeat
proceedings after completion, in both languages. There is no separate jump link
below the page heading. The cue hides at the end
of the reading path, when the final start button is fully visible, and during
the candle game or a dialog. Scrolling, viewport changes and content resizing
refresh it without a permanent animation loop; reduced motion disables its nudge.

## Profile setup and local test

In **Firestore Database > Data > profiles > your actual account UID**, add:

| Field | Firestore type | Example |
| --- | --- | --- |
| `birthday` | string | `2000-11-03` |

Use `YYYY-MM-DD`, including leading zeroes. For a local test, set the month/day
to today in your browser's local calendar, keeping a valid past birth year. This
is a field on the existing document, not a subcollection or RTDB path. Existing
owner-only profile rules suffice; no new Firebase permissions or rules are needed.

1. Start the usual local server and open `http://localhost:8000/`.
2. Sign in with the account whose profile you edited, then reload the homepage.
3. The first eligible visit that day automatically opens the birthday game.
4. Read the official notice, privately make a wish, and start the candle procedure.
5. Return home. The highlighted birthday entry remains available for repeat play;
   later homepage visits do not force another automatic entry that day.
6. The game itself can be switched between Chinese/English at any time. Changing
   language during blowing preserves extinguished candles and current progress.

There is no preview page, wish field, wish submission, birthday feedback category
or birthday score. No birthday interaction writes to Firebase. The earlier wish
collection prototype has been removed. The word "wish" refers to a private wish
before the candle ceremony.

## Eligibility and navigation

`CloudSync.onProfile` delivers the existing account profile read. The homepage
and game do not add birthday queries or realtime listeners. Opening another page
still performs that page's normal profile load. Names are rendered as text and
the existing Google avatar has an initial fallback. Anonymous/signed-out players,
missing/invalid dates and future birth dates do not qualify. February 29 matches
only on an actual leap day. No age is displayed.

Automatic entry happens from the homepage, after eligibility is known; existing
record-claim dialogs are allowed to finish first. The per-account/browser/local-day
marker is `gamebox:birthday:entered:<uid>:YYYY-MM-DD`. It is written before
navigation, so returning home cannot create a redirect loop. Manual entry and
direct eligible game visits also mark the day as entered. Web Locks coordinate
simultaneous homepage tabs where supported. Session storage is a fallback; if
both storage APIs are unavailable, manual entry remains and automatic navigation
is suppressed. There is no server-side/global-device attendance record.

To repeat a first-entry test on the same day, remove that marker from **both**
localStorage and sessionStorage, then reload the homepage. The old one-off card's
`gamebox:birthday:<uid>:<date>` markers are unused.

Completing all five candles sets a separate marker,
`gamebox:birthday:completed:<uid>:YYYY-MM-DD`, in localStorage and sessionStorage.
Merely entering, partially blowing or abandoning a replay does not set or erase it.
Once completed, the homepage banner and game notice, seal, instructions and start
button acknowledge the finished ceremony and authorize optional replay in both
languages. Reloads, returning home and other tabs in the same browser keep that
wording; the next birthday starts fresh. This record is local to the browser and
account, does not sync across devices and adds no Firebase reads or writes. Remove
the completed marker from both storage APIs to test first-play copy again.

The homepage entry disappears at local midnight using a local timer. Visibility
and page-restoration checks handle backgrounded or suspended tabs and clock
changes. The game checks the same eligibility: at midnight/sign-out it removes
the playable scene, cancels wind animation and shows the unavailable/identity
screen. Direct URLs outside the birthday do not expose a playable cake. This is
client-side event presentation, not server-authoritative reward authorization.

## Candle procedure

The local SVG cake has five candles. Hold mouse/touch over its area and move to
aim a breeze from the bottom-center wind icon. Direction and held time determine
which candles go out. Keyboard users focus the cake as one control, use Left/Right
to steer at 0.95 radians/second, and hold Space to blow along that direction.
There is no per-candle focus, target lock, Enter shortcut or stationary keyboard
mode. Steering alone previews the direction without blowing. Release, focus loss
or page hiding clears held inputs. Visible instructions stay short and do not
reveal the evasion or recovery mechanics; keyboard instructions label the control.
Candles repeatedly choose destinations outside the current wind cone and avoid
crowding their neighbors. Motion is limited to 52 SVG units horizontally and 12
vertically around each home position, at 110 units/second with a 0.55-second
decision cooldown. Players must follow the candles rather than park the breeze
at the original positions. A short initial reaction delay and a generous wind
cone keep the pursuit approachable.
Destinations also stay inside an inset ellipse of the cake's top, with room for
the entire wax base. The five candles initially form a level horizontal row, with
equal heights and aligned bases. Dodging can then move them forward or backward
on the top surface. SVG groups are drawn
back to front by current base height. Input targets the shared stage rather than
individual candle buttons.
Flame strength decreases at 1.1/second while hit. Recovery begins on the first
missed frame at 0.18/second and ramps linearly to 1.5/second over 0.65 seconds of
uninterrupted misses, including after releasing the wind. A new hit resets the
recovery rate. The curve is integrated over frame time, so frame rates do not
change the recovery amount. Repeated broad sweeping is checked against sustained
target tracking to preserve the need to pursue candles.
Opacity and size show both weakening and recovery. Fully extinguished candles
remain out for the current round; replay starts with five fresh candles.
Visual candle groups and flame hit detection use the same moving positions.
Mouse, touch, keyboard and reduced-motion mode all use the same moving-candle
simulation. Reduced motion removes only decorative motion, preserving gameplay.
There is no microphone permission. Remaining candles are announced accessibly.
After all candles are extinguished, a formal completion dialog offers return to
the homepage or another candle procedure with five fresh flames. The formal
letter can also be revisited without leaving the game.
All five extinguished candles remain visible for 1.2 seconds before the dialog
opens; completion is recorded immediately. The delay restarts on returning from
a hidden tab, and leaving the cake, restarting, signing out or navigating away
cancels a pending dialog. Initial dialog focus goes to its heading so a held
blowing key cannot activate a return/replay button. Cake controls suppress key
scrolling throughout the finished pause. Keyboard focus uses the small wind-source
icon rather than an outline around the whole cake.
The completion dialog is centered in the viewport, with internal scrolling when
needed on short mobile screens.

Confetti falls continuously using a bounded set of CSS particles and pauses in a
hidden tab. Reduced-motion mode omits confetti/decorative animation while retaining
the candle interaction. Pointer release/cancellation, blur, visibility changes,
navigation and cleanup stop active wind. Movement/recovery frames run only while
needed; a fully recovered idle cake has no animation loop. Hidden tabs pause the
simulation, and returning resumes any outstanding recovery without a time jump.
The standalone page carries the same iOS double-tap guard as the arcade shell;
the cake stage also suppresses touch gestures while steering the wind.

## Files and checks

- `js/birthday.js`: date validation, daily entry markers, homepage controller and confetti.
- `js/games/birthday.js` + `games/birthday.html`: formal letter, eligibility gate, game and replay.
- `js/birthday-cake.js`: reusable directional candle interaction.
- `css/birthday.css`: homepage entry, official letter and game styling.

```text
node tools/birthday-check.js
node tools/birthday-browser-check.js
node tools/birthday-browser-check.js --reduced-motion
```

The browser check requires Chrome and Node 22+ and uses actual pages with local
account/clock stubs. It verifies automatic/manual/repeat navigation, bilingual
copy before/after completion, safe names, candle pursuit/recovery/replay, account isolation, midnight timers and
zero feedback calls. No production Firebase data is read or written.

## Disable/remove later

Delete `birthday` from the profile and reload the homepage. Full removal entails
the homepage section/assets and birthday hooks in `launcher.js`, the standalone
page/game, shared birthday/cake scripts and styles, and their checks/docs. The
CloudSync profile notification API may remain or be removed if unused. Room
networking, score data and Firebase rules need no migration. Daily entry markers
can simply remain unused.
