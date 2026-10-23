# GameBox - Game Rules

Full player-facing rules for every game, arcade first then puzzles.

---

# Arcade Games

A central reference for the games in this arcade collection. Each game
page already shows a short *How to play* footer; this document is the
long form.

Every game here fits the same "arcade" mould:

- Needs real-time input / reaction.
- Has countdown, speed, or rhythm pressure.
- Chases score, time, or combo.
- Simple rules, understood within seconds of starting.
- Suited to short, repeated play.
- Instant retry after a failed run.

## Shared conventions

All games share the same chrome and lifecycle:

- **Start**: from the overlay button, or press `Space` / `Enter`.
- **Pause / Resume**: `P` or `Esc` (also the Pause button). Switching
  browser tabs auto-pauses.
- **Restart**: `R` or the Restart button. Some games (e.g. Colour
  Ladder) return to the ready screen first; others restart instantly.
- **Sound**: `M` toggles mute (also the speaker button). The choice is
  remembered across games.
- **HUD**: a row of stat pills plus any per-game gauges. Each game owns
  its own HUD and scoring. **Best** is the local high score, stored in
  the browser via `localStorage`.
- **Language**: EN / 中 toggle in the top-right of every page.

---

## Colour Ladder

A real-time **ghost leg** (amidakuji). Colour-coded balls fall down a
ladder of vertical lanes; you **move** a fixed set of horizontal **rungs**
to steer each ball into the basket of its own colour.

### The board

- **Lanes**: vertical lines the balls fall down.
- **Rung zone**: on each lane the brighter segment (with a cap at the top and
  bottom) marks where rungs live; a rung can sit between any two neighbouring
  lanes, at any height within that band.
- **Baskets**: one per lane at the bottom, each a **distinct** colour in a
  **fixed order** every run (lanes = colours). Every ball's colour matches one.

### Rungs

- A **rung** is a bar joining two neighbouring lanes; a ball that meets it
  **steps across** to the next lane. You have a fixed set you **move** (never add
  or remove), so you redirect the falls by repositioning them.
- On **Easy / Normal** the rungs are **plain** (colour-agnostic) — they step
  *every* ball. On **Hard** the rungs are **colour-coded** and a rung lets its
  **own colour pass straight through** (a "safe gate"), so you juggle the whole
  set's side-effects.
- After you move a rung it briefly **recharges** (the end-rings sweep back to
  full) before it can move again — so you can't just shuffle one rung for
  everything. The lock shortens as the **wave rate** climbs, keeping pace late.
- A few **fixed obstacle rungs** (thin, muted grey cross-bars) are scattered
  near the top each run. They **block every colour**, can't be moved, and you
  route around them.
- **Pick up / drop**: press and hold a rung (mouse or touch), drag it, and
  release to drop it. You can place it at **any height** — not just on a node.
  While you hold it the rung stays where it was (still steering balls) and a
  translucent **ghost** shows where it will land.
- **Auto-dodge**: if the ghost gets too close to another rung that shares a
  lane, it slides to the nearest free height to make room, so rungs never
  conflict. Only if a column is completely full does the ghost turn red (and
  the rung snaps back on release).

### Goal & scoring

- Steer each falling ball into the basket matching **its colour**. Each correct
  delivery scores **one point** (so the score is simply the number of balls
  delivered), capped at 999999.
- A **wrong basket** costs one **life** (shown as **pips**, not a number); the
  run ends when lives reach zero and the score goes to the per-difficulty
  **Best**.
- A **heal ball** (marked `+`, and faster than normal) is a bonus that arrives
  **on its own timing** — about one every dozen waves, a bit more often as it
  gets busier — and never replaces a normal ball. Land it in its matching
  colour to **regain a life** (max 5); misplacing or ignoring one costs nothing.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best).
Each difficulty has one **fixed layout** (lanes = colours, so every basket is
a distinct colour). **Every ball falls at the same constant speed** — the same
across all three difficulties — so difficulty comes from the layout, how often
balls spawn, and the wave makeup:

- **Easy**: 3×3. Every wave is a single ball.
- **Normal**: 4×4. A wave is **occasionally two** balls; same spawn-rate curve
  as Easy.
- **Hard**: 5×5. Two-ball waves come **more often**, and the overall spawn rate
  is a little higher.

A wave is never more than **two** balls. In a two-ball wave each ball picks a
lane independently (always different colours), so they sometimes land **stacked
in one lane** — peel one off with its colour's rung — and sometimes on two. The spawn rate
**rises over time** on an unbounded, ever-gentler curve — it never plateaus but
keeps slowing, so the late game stays fair; the rhythm itself stays even. Each run opens with a short
**3‑2‑1 countdown** over the frozen board, and a ball or two is seeded at the
top of the ladder, so the first moments aren't a scramble.

Because each rung deflects every colour but its own, every rung on the board
acts on the balls at once — you juggle the whole set, dropping a ball's
own-colour rung in its path when you need it to pass straight through.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/colour-ladder.js`.

---

## Bullet Storm

An omnidirectional **bullet-dodge survival**. Dots stream in from every edge
of the field; you fly a single dot and avoid them. You have a few **lives**;
your **score is simply how long you last**.

### Bullets

- Dots spawn just outside a **random edge** and cross the field. Their spawn
  point runs a little **past the corners**, so shots can enter diagonally and
  bullet density stays **even across the whole board** (no calm corners to camp).
- Most are **straight** shots (soft round dots) fired inward at a random angle,
  **at a mix of speeds** (some fast, some slow).
- Some are **homing**, shown in **red** — they **track you**, turning at a capped
  rate (a sharp juke makes them overshoot). The red stays solid while tracking,
  then **fades to white near the end**; once white they **commit to a straight
  line** and are just a plain bullet. They appear on **Hard** only, phasing in
  over time toward a fixed share of the bullets.
- **Lasers** (Easy & Normal) flash a thin **warning line**, then fire a lethal
  **beam** across the field for a moment — reposition before it fires. They grow
  more frequent over time, toward a fixed share of the bullets, and several can
  be on screen at once.
- Every hitbox is a **circle you can see**: a bullet's hitbox is its visible
  circle, and your dot's is its **solid disk** (the glow is cosmetic). Collision
  uses **swept** (continuous) tests, so even fast shots — or fast dodges — can't
  tunnel through in a single frame.
- Bullets are **type-driven** (`kind`), and lasers are a separate telegraphed
  beam, so new behaviours can be added for late game without touching the rest.

### Controls

- **Mouse (desktop)**: the dot **follows the cursor** — it *is* your pointer (the
  OS cursor is hidden over the board). Nothing to press, so you can never "whiff".
- **Touch (mobile)**: **relative drag** — press on the board **or the margin
  around it** and the dot moves with your finger's **motion**, not to it. Lift and
  press again to **re-anchor**. Starting in that margin means your hand never hides
  the board, and a tap just outside it never whiffs. (Only this play zone ignores
  scroll gestures; the rest of the page scrolls normally.)
- There is **no speed cap** — the dot moves 1:1 with your input, so dodging is
  pure skill. The swept collision test keeps this fair: a fast dodge still
  collides if its path crosses a bullet, so you can't phase through them.

### Lives

- You start with **three lives** (every difficulty). A hit **costs one life** and
  grants a brief **invulnerability** (the dot flashes) so a single dense cluster
  can't drain several at once. At **zero lives** the run ends.

### Difficulty

Pick **Easy / Normal / Hard** on the game page (each keeps its own Best). Both
the **spawn rate** and **bullet speed** rise over time on a **softplus** curve
(`a + ln(B + e^(c·t))`): flat-ish early, then roughly linear with slope `c`, so a
run keeps escalating without end. Difficulty changes that rate/speed curve, its
special attack (Easy & Normal get telegraphed **lasers**, Hard gets **homing**
shots), and bullet size — Hard's bullets are smaller,
and on every difficulty sizes **skew small** so big ones are rare. Each run opens
with a short **3‑2‑1 countdown** so the first moment isn't a scramble.

### Tuning

All balance values live in `CONFIG` + `DIFFICULTIES` at the top of
`js/games/bullet-storm.js`.

---

## Rune Stones

An orb-spinning game with two modes that share one core — **drag a rune, line up
3+ of a colour, chain combos**. **Sandbag** is a solo damage run: no cards, no
defence, just score. **Versus** is a two-phase, HP-to-zero clash against a
**real-spinning computer** (Easy / Normal / Hard) or **online** against another
person by room code. Each mode keeps its own **bests, per difficulty**; online
matches are honor-system and record nothing.

### Board & spinning

- A **6×5** board in Versus (**6×6** in Sandbag), 6 elements (**fire · water ·
  wood · light · dark · heart**). Drag one rune; it swaps along its path
  (diagonals allowed). The **spin timer starts on the first swap** and resolves
  on release or timeout.
- On resolve, every horizontal/vertical run of **3+** of a colour clears; groups
  cascade as runes fall and new ones drop in. The pre-fall groups are the **first
  wave**.
- **Enhanced runes**: when a colour clears **5+** in a wave, the **next batch of
  dropped runes** includes one **enhanced** rune of that colour (bright rim).
  Cleared later it counts **×1.5** and satisfies "enhanced" shields.
- **Heart** groups **heal** you instead of dealing damage.

### Sandbag (solo)

A no-frills damage run: **no cards, no defence, no HP bar of your own** — just
spin and hit. The board is **6×6** with a fixed **6-second** spin window (neither
scales with difficulty). You get **30 spins**; chase the highest **total** and
**single-spin** damage. Between rounds you **draft** power-ups (see below).

- **Three enemies** stand as targets, each a single element. Every colour you
  clear strikes the matching enemy through an **elemental multiplier** — **×1.5**
  where strong, **×0.5** where weak, ×1 otherwise. Clearing **5+** of a colour in
  a wave makes that element **hit all three** at once.
- **Spirit** replaces **Heart** as a plain attack rune — there is no healing
  here.
- Enemy HP scales in **three 10-round stages** — **200–1600** (rounds 1-10),
  **400–3200** (11-20), **800–6400** (21-30). Each spawn rolls a random tier within
  the current stage, and tougher tiers look a little bigger. Drop one to **0** and a
  fresh enemy takes its place.
- **Difficulty only widens the element pool**: Easy uses 5 elements, Normal adds
  **Spirit**, Hard adds **Spirit + Steel** — more attributes on the board, more
  restraints in play. **Hover / long-press** an enemy to read your multipliers
  against it.
- **Best** = your highest total damage and best single spin, kept **per
  difficulty**.

### Sandbag draft

**Three picks at the start, then 1 of 3 every 5 rounds** (after rounds 5 / 10 / 15 /
20 / 25). Most cards **stack** (more attack / element damage, longer spins, bigger
combos, harder first-wave / cascade hits, an extra attack target). A few are
limited: **per element** (an element's attacks reach one more enemy, up to twice —
two makes it hit all three) or **one-time** build-definers (every colour AoEs at
**4**; **flood** the board with one element; an element that clears at **2**; or
**keep rearranging** runes until the timer runs out). Rarer cards appear less often, and one-time cards are flagged in the draft;
card **frames are colour-coded** by how rare they are. Some cards target a
**specific** element, others let you **choose** one. A **Powers** button (top-left)
opens a list of everything you currently own. All values live in `DRAFT` /
`DRAFT_CARDS` at the top of `js/games/rune-stones.js`.

The remaining sections describe **Versus**.

### A round — two phases

1. **Defense** — play **shield cards** (they cost **energy**). Each shield is a
   condition the **rival's spin must satisfy to damage you**; raise as many as you
   can afford, then press **To attack →**. (Your shields stay hidden until the
   rival reaches its own attack.)
2. **Attack** — play **attack cards** (fresh energy) to reshape your board or
   break the rival's shields, then **drag a rune to spin**. You must satisfy
   **every** shield the rival raised, or your hit is **blocked** (0 damage).
   Heart healing is never blocked.

Both sides act each round; the exchange resolves together — **damage first, then
healing**, capped at max HP.

### Hand, energy & clocks

- You hold a **mixed hand** (defense + attack cards), opening with four. **Energy**
  refills at the start of each phase. A card is only playable in its own phase.
- **Draw** pulls one more card from the current phase's pool for **1 energy** (hand
  capped at 10). Unplayed cards carry over.
- Each phase has a decision clock — **Defense 30s, Attack 40s**. If the attack
  clock runs out before you spin, it **opens the spin window**: you can still spin
  within the spin time (doing nothing scores 0 for that strike).

### Shields (what a spin must satisfy)

| Shield | Requirement |
| --- | --- |
| **Need colour** | Clear the named colour |
| **Ban colour** | Do **not** clear it — clearing it blocks the hit |
| **Need enhanced** | Clear an enhanced rune (optionally of a named colour) |
| **Combo ≥ N** | Reach N+ combos |
| **First wave ≤ N** | Keep the first wave to N combos or fewer |

In the HUD, redundant shields **collapse** (e.g. **≥8** absorbs **≥6**; **need X
enhanced** absorbs **need X** and **need enhanced**), and stacked **time-shorten**
shows as **×N**. Tap any shield / played-card chip to read its full effect.

### Time & break

- **Shorten** (defense) trims the **rival's** spin time; **Extend** (attack)
  lengthens **your own**. Both **stack** and cancel each other out.
- **Break** (attack) removes one of the rival's **shields** — or one stack of its
  **time-shorten** on you.

### Cards

Cards are drawn **weighted** within their phase's pool (higher weight = more
common). Element families have one card per element.

#### Defense pool (34 cards)

| Card | Effect | Cost | Weight | Count |
| --- | --- | ---: | ---: | ---: |
| Need colour | Must clear that colour | 2 | 2 | 6 |
| Ban colour | Clearing it blocks the attack | 2 | 2 | 6 |
| Need colour enhanced | Must clear that colour's enhanced rune | 6 | 1 | 6 |
| Need random / chosen | A random / chosen colour you must clear | 2 / 4 | 4 | 1 + 1 |
| Ban random / chosen | A random / chosen colour you must not clear | 2 / 4 | 4 | 1 + 1 |
| Need enhanced (any) | Clear any enhanced rune | 4 | 6 | 1 |
| Need enhanced random / chosen | A random / chosen colour's enhanced | 6 / 8 | 2 | 1 + 1 |
| Combo ≥ 5 / 6 / 7 / 8 | Reach that many combos | 2 / 3 / 5 / 7 | 6 / 8 / 8 / 4 | 1 each |
| First wave ≤ 4 / 3 / 2 / 1 | Keep the first wave within N | 2 / 4 / 6 / 8 | 6 / 8 / 8 / 4 | 1 each |
| Shorten | Cut the rival's spin time (stacks) | 3 | 15 | 1 |

#### Attack pool (54 cards)

| Card | Effect | Cost | Weight | Count |
| --- | --- | ---: | ---: | ---: |
| Transmute A → B | Turn every A rune into B (all ordered colour pairs) | 3 | 1 | 30 |
| Transmute from colour | Turn every rune of this element into a picked colour | 5 | 2 | 6 |
| Transmute to colour | Turn a picked colour into this element | 5 | 2 | 6 |
| Transmute any → any | One chosen colour into another | 7 | 4 | 1 |
| Enchant colour | Enhance 3 runes of that colour | 5 | 3 | 6 |
| Enchant random | Enhance 3 random runes | 6 | 6 | 1 |
| Enchant chosen | Enhance 3 runes of a chosen colour | 7 | 4 | 1 |
| Extend | Lengthen your own spin time (stacks) | 4 | 15 | 1 |
| Break random | Remove a random rival shield / time-shorten | 5 | 10 | 1 |
| Break chosen | Remove a chosen rival shield / time-shorten | 8 | 5 | 1 |

### Versus the computer

Pick **Easy / Normal / Hard** on the game page (kept per browser). The computer has
**its own board and really spins** — a beam-search solver searches drag paths and
keeps the best spin that still meets your shields. It also **reads your board** to
raise shields (e.g. demands a colour you're short on) and **plays attack cards from
its own hand** to meet yours or boost its spin. Difficulty scales its search and
skill; your **Shorten** cramps its spin.

### Online PvP

Press **Online**, sign in with **Google** or as a **guest**, then **create a room**
(share the 4-letter code) or **join** one. Both players press **Ready**; the host
starts once both are ready. Rounds play the same two phases: shields reveal at the
attack phase, and each player's cards and board changes show **live** as they act.
Leaving frees your seat — the room **persists** for the other player and can be
rejoined by code. Honor-system MVP (anti-cheat would need server validation); state
syncs through Firestore (see `firestore.rules`).

### Win / lose

Reduce the rival to **0 HP** to win. At the round cap, higher HP wins (equal = a
draw). Online, an opponent who leaves or times out forfeits. The end screen states
the reason.

### Tuning

All at the top of `js/games/rune-stones.js`: `DUEL` (HP, round cap, energy, hand size,
`phaseTimeDef` / `phaseTimeAtk`, resolve pause), `BALANCE` (spin time, base damage,
heart heal, combo step, enhanced ×), `AI_LEVELS` (per-difficulty spin search `beamW` /
`beamD`, card-judging `evalW` / `evalD`, and `skill`), and the `CARDS` pool built in `buildCards()`
(each card's `cost` / `weight` / `cat`). Damage/shield math lives in
`computeSpinResult()` / `simResolve()` / `shieldUnmet()`.


---

## Beam

**Goal.** The mirrors flash up for a moment, then vanish. A laser fires in — tap
the edge cell where it **exits** before the clock runs out. It's a memory-and-
geometry race: read the layout fast and outlast your rivals.

### A round

Each round runs in four short beats:

1. **Get ready** — a brief countdown (3s on the opening round, 2s after).
2. **Memorise** — the mirrors appear; the time given scales with how many there
   are and how far the beam bounces.
3. **Where does it exit?** — the mirrors vanish, the laser fires from one edge,
   and you have a few seconds to tap the edge cell it leaves from.
4. **Replay** — the beam is traced in full, revealing who hit and who missed.

### Mirrors & the beam

- Two mirror orientations — `/` and `\` — each deflect the beam 90°.
- The beam enters from one edge, bounces off every mirror it meets, and leaves
  from exactly one edge cell. That exit is the answer.
- Grids start small (2×2) and grow with difficulty; more mirrors and longer bounce
  paths make a layout harder to hold in memory.

### Lives & winning

- Everyone starts with **three lives**. In a round where **some hit and some
  miss**, only those who **missed lose a life** (a round everyone gets right — or
  everyone gets wrong — costs nothing).
- Reach **0 lives** and you're out, watching the rest play on. **Last one standing
  wins.**
- A long match **gradually speeds up** (memorise time shrinks fastest) so it always
  resolves; if it still drags on, a **sudden-death** rule makes even a tie cost a
  life.

### Modes & difficulty

- **Solo** — you versus **3 CPU rivals**. The difficulty bar (16 steps across
  **Easy / Normal / Hard / Insane**) sets how strong those rivals are; dragging it
  previews the new setting and commits on the next Start. Best = your best finishing
  place, kept per difficulty.
- **Online** — **2–4 real players** by room code; the host starts once everyone is
  ready. Difficulty is shared and adapts to the group's results, so the picker is
  locked for the duration of an online match.
- Difficulty is **adaptive**: do well and the next grid grows / gains mirrors; do
  badly and it eases off.

### Tuning

All at the top of `js/games/beam.js`: `DIFF` (the 16 solo-bot `{mean,std}` strength
notches), `paramsForLevel` (grid size + mirror density per level), the round
timings (`ANSWER_SEC`, `countSec`, memorise scaling), and the late-match speed-up
(`ACCEL_START`, `MEMO_DECAY`, `ANSWER_DECAY`, `SUDDEN_DEATH_ROUND`).

---

# Puzzle Games

A central reference for the eight puzzles in this collection. Each game
page already shows a short *How to play* footer; this document is the
long form — the complete rule set and the controls that map to them.

This is intentionally rule-focused. Implementation notes (generators,
algorithms, file layout) live elsewhere.

## Shared conventions

All eight games share the same chrome and the same control vocabulary,
so the rule sections below only mention game-specific deviations.

- **Difficulty** (Easy / Medium / Hard): controls how heavily the
  generator constrains the puzzle. The rules themselves never change.
- **Board size**: ranges and increments differ per game (see each
  section). Changing size always starts a fresh puzzle.
- **New Game**: regenerates a puzzle at the current difficulty and
  size, clearing the timer.
- **Reset**: clears everything the player has placed / drawn, but
  keeps the same puzzle.
- **Undo** (all games): steps back through your recent moves — up to
  ~20, and a Reset counts as one step. `Ctrl`/`⌘`+`Z` also works.
  Cleared on New Game.
- **Reveal**: toggles a faint overlay of the intended solution.
  In the cell-toggle games (Queens, Tango, Sudoku) it shows a small
  hint glyph in the corner of each editable cell; in Zip it draws the
  canonical path under the player's line; in Patches it outlines the
  solution rectangles; in Nonogram it overlays the solved filled cells;
  in Guards it overlays the solution guards; in Hashi it draws the
  solution bridges.
- **Timer**: starts on New Game / size / difficulty change; stops on
  win.
- **Violation feedback** (Queens, Tango, Sudoku, Guards, Hashi): rule breaks
  are shown as red marks on the offending cells, held back briefly so
  rapidly cycling a cell doesn't strobe red. Queens/Tango/Sudoku keep
  unrelated conflicts visible and debounce only the ones your last move
  touched; Guards clears a conflict the instant you resolve it and
  reveals newly-created ones once you pause.
- **Win**: every game shows a "You Win!" badge in the status row and
  tints the placed symbols / path gold.

---

## Queens

**Goal.** Place exactly N queens on an N×N board so that every row,
every column, every coloured region, and every 8-cell neighbourhood
contains exactly one queen.

### Board

- N×N grid, with N from **5×5** to **12×12**.
- The board is partitioned into **N coloured regions** — irregular
  connected shapes that tile the whole board. Region colours are
  just labels; they have no other meaning.

### Rules

1. Each **row** contains exactly one queen.
2. Each **column** contains exactly one queen.
3. Each **coloured region** contains exactly one queen.
4. No two queens are **8-neighbours** (orthogonally OR diagonally
   adjacent). This is stricter than standard N-Queens, where queens
   attack along full diagonals — here only the immediately adjacent
   8 cells are forbidden, but queens on the same row/column still
   conflict (rules 1–2 cover that).

### Controls

- **Click a cell** to cycle through `empty → × → ♛ → empty`.
  - `×` is a personal "I think no queen goes here" marker. It is
    *not* a rule; the solver ignores it.
  - `♛` is an actual placement.
- **Drag** to bulk-toggle × marks:
  - Starting on an empty cell paints × onto every empty cell the
    pointer passes over (`♛` cells are left alone).
  - Starting on a × cell clears the × from every × the pointer
    passes over — including the starting cell. Releasing without
    ever leaving the starting cell falls back to a normal cycle,
    so a still tap on × still goes to `♛`.
- **Reveal (?)** draws a small grey queen in the top-left of every
  empty cell, showing the intended solution.

### Win

All N queens placed and no rule violated. There are no required
empty cells — finishing the board automatically satisfies all four
rules.

---

## Tango

**Goal.** Fill every cell of an N×N board with a sun (☀) or a moon
(☾) so that the row/column counts, the run-length, and the wall
constraints all hold.

### Board

- N×N grid, with N from **6×6**, **8×8**, **10×10** (N must be even
  so the half/half count works out).
- Some cells are **pre-filled** (slightly darker background) and
  cannot be changed.
- Some cell **boundaries** carry a wall glyph:
  - `=`  the two adjacent cells must contain the **same** symbol.
  - `×`  the two adjacent cells must contain **different** symbols.

### Rules

1. Each row contains exactly **N/2 suns and N/2 moons**.
2. Each column contains exactly **N/2 suns and N/2 moons**.
3. **No three identical symbols in a row** — neither three suns
   nor three moons may appear consecutively in any row or column.
4. Every `=` wall: the two cells it sits between must agree.
5. Every `×` wall: the two cells it sits between must differ.
6. Pre-filled cells cannot be modified.

### Controls

- **Click a cell** to cycle through `empty → ☀ → ☾ → empty`.
- **Reveal (?)** shows a small sun/moon hint in the top-left of
  every player-editable cell.

### Win

Every cell is filled and rules 1–5 all hold (rule 6 is enforced by
the input itself).

---

## Sudoku

**Goal.** Fill every cell of an N×N board with a digit from 1..N so
that each row, column, and box contains each digit exactly once.

### Board

- N×N grid, with N from **6×6**, **9×9**, or **12×12**.
- Boxes:
  - 6×6 → 2×3 boxes (2 rows × 3 cols of cells per box, giving
    3 boxes per row, 2 per column → six 2×3 boxes total).
  - 9×9 → 3×3 boxes (the classic Sudoku layout).
  - 12×12 → 3×4 boxes (3 rows × 4 cols per box). Digits run 1..12;
    10, 11, 12 are drawn hex-style as **A**, **B**, **C**.
- Some cells are **pre-filled** (locked, dark digits); the rest are
  empty.

### Rules

1. Each **row** contains every digit in 1..N exactly once.
2. Each **column** contains every digit in 1..N exactly once.
3. Each **box** contains every digit in 1..N exactly once.
4. Pre-filled digits cannot be modified.

### Controls

- **Select a cell** by clicking it. Same-row, same-column and
  same-box cells get a soft tint to help you spot conflicts; cells
  with the same digit as the selected one are tinted slightly more.
- **Arrow keys** move the selection.
- **Type a digit** (`1`–`9`, plus `A`–`C` for 10–12 on a 12×12) on
  the keyboard, or click a digit on the on-screen keypad, to fill
  the selected cell.
- **Backspace**, **Delete**, **0**, or **Erase** on the keypad
  clears a player-placed digit. Pre-filled digits are protected.
- **Notes mode** (`N` key, or the **Notes** button on the keypad):
  digits you enter go in as small **pencil marks** in a sub-grid
  arranged in the same shape as a box. Toggle the digit again to
  remove it from the notes. Entering a real digit while a cell has
  notes wipes the notes for that cell.
- **Reveal (?)** shows a small green digit in the top-left of every
  player-editable cell — the intended solution.

### Win

Every cell is filled and rules 1–3 all hold (rule 4 is enforced by
the input).

---

## Zip

**Goal.** Draw a single continuous path that visits every open cell
exactly once, passing through the numbered checkpoints **in
numerical order**.

### Board

- N×N grid, with N from **5×5** to **12×12**.
- **Holes** (grey cells): unreachable. The path may never enter
  them. (The current generator produces hole-free boards, so in
  practice every cell is open.)
- **Walls** (thick black segments on cell borders): the path may
  never cross one.
- **Checkpoints** (numbered circles): K cells are labelled
  `1, 2, …, K`. They sit on open cells.

### Rules

1. The path is a sequence of orthogonally-adjacent (4-neighbour)
   cells; diagonals are not allowed.
2. The path **covers every open cell exactly once** (i.e. a
   Hamiltonian path over the set of open cells).
3. The path **starts at the cell labelled 1**.
4. The path **ends at the highest-numbered checkpoint** (`K`).
5. The path visits the checkpoints in order: `1 → 2 → 3 → … → K`.
   Non-checkpoint cells may appear between checkpoints in any
   arrangement, as long as the numbered ones still appear in order.
6. The path may not pass through a hole or cross a wall.

### Controls

- **Press and drag** with the mouse (or finger) to draw.
  - From an empty state, the drag must start on cell `1`.
  - Otherwise, the drag must start on a cell that is already on
    the path. Doing so **truncates** the path back to that cell
    (anything drawn after it is dropped).
- While dragging the head, moving onto an adjacent open cell
  **extends** the path. Moving onto the cell immediately *before*
  the head **retracts** by one step. Moving onto any other cell on
  the existing path during a drag does nothing — that protects you
  from accidentally lopping off long sections.
- Releasing keeps the current state. To rewind further or to start
  over, release and press again on the cell you want to continue
  from.
- Trying to cross a wall, enter a hole, or reach a non-adjacent
  cell briefly flashes the offending cell red.
- **Reveal (?)** draws the canonical solution path as a faint green
  line under your own.
- **Hint (💡)** either spotlights the stretch of your path that has
  left the unique solution — dimming every other cell so you can see
  how far to retrace — or, if you're still on track, draws a green
  connector to the next step(s). Press again to dismiss.
- **Undo (↶ / Ctrl+Z)** steps back one drag gesture at a time (up to
  20). Reset is undoable too, until you win.

### Mistake feedback

You're allowed to visit a checkpoint with the wrong number, but the
path from that checkpoint onward is highlighted red (cell tint plus
red path stroke that picks up where the blue gradient left off).
The win check requires the order to be correct, so you'll need to
retract back past the offending checkpoint to clear the red.

The path **head** also turns red when you run *past* the final
checkpoint, or park on it before every cell is covered — both are
dead ends you must back out of.

### Win

The path covers every open cell, visits the checkpoints in order,
and ends at checkpoint `K`.

---

## Patches

**Goal.** Cover the whole N×N board with non-overlapping rectangles —
exactly one per clue — where each rectangle matches its clue's shape
(and size, if the clue gives one).

### Board

- N×N grid, with N from **5×5** to **12×12**.
- Most cells are blank. A few carry a **clue** glyph; each clue is the
  seed of exactly one rectangle. The glyph states the required shape:
  - **Square** — the rectangle must be a square (width = height).
  - **Wide** — wider than tall (width > height).
  - **Tall** — taller than wide (height > width).
  - **Any** (dashed composite glyph) — any rectangle shape.
- If the glyph also shows a **number**, the rectangle's **area** must
  equal it (e.g. `6` → 1×6, 2×3, 3×2 or 6×1, subject to the shape). No
  number means any size.
- Each clue (and its rectangle) has its own colour; blank cells are
  neutral until a rectangle is drawn over them.

### Rules

1. Every clue is covered by exactly **one** rectangle, and every
   rectangle contains exactly **one** clue (a one-to-one pairing).
2. Each rectangle satisfies its clue's **shape** (square / wide / tall
   / any).
3. If the clue carries a **number**, the rectangle's area equals it.
4. **No 1×1 rectangles** — every rectangle covers at least two cells.
5. Rectangles **never overlap**.
6. The rectangles **fill the whole board** — no cell left uncovered.

### Controls

- **Drag from a blank cell** to draw a rectangle. A grey preview grows
  toward the pointer (within one gesture it only ever grows). When it
  covers exactly one clue it tints to that clue's colour; the drag
  refuses to grow so that it would cover a **second** clue or **overlap
  an existing rectangle**.
- **Release**:
  - preview covering **no** clue → discarded (nothing placed);
  - preview covering **one** clue → placed.
  - Shortly after placing, a rectangle that already breaks its clue
    (too big for the stated size, or a shape it can no longer become)
    flashes **red** with a small bubble explaining why.
- **Drag from inside a placed rectangle** to resize it — grow-only;
  releasing replaces the old rectangle.
- **Click a placed rectangle** (a tap, no drag) to remove it.
- Each placed rectangle shows a small **size badge** (current W×H).
- **Hint**: highlights the next deduction (conflict-first, then the
  forced placement / cell). Press again to dismiss.
- **Reveal (?)**: shows the intended solution rectangles.

### Win

Every clue owns one valid rectangle and the rectangles tile the grid
with no gaps or overlaps.

---

## Nonogram

**Goal.** Fill cells on an N×N grid so that every row and column matches
its number clues, revealing a hidden picture.

### Board

- N×N grid, with N from **6×6** to **16×16**.
- Each **row** and **column** carries a clue: the ordered run-lengths of
  its filled cells. `3 1` means a run of 3 filled cells, then a gap of at
  least one empty cell, then a run of 1. A clue of `0` (shown faint) means
  the line has no filled cells.
- Every generated board is **line-solvable**, so it has a unique solution
  reachable by pure single-line logic — no guessing required.

### Rules

1. In each **row**, the filled cells form runs whose lengths match the
   row's clue, **in order**, each pair of runs separated by at least one
   empty cell.
2. The same holds for every **column**.
3. Exactly **one** arrangement satisfies all the clues.

### Controls

- **Four input modes** (icon buttons below the board): **Cycle**, **Fill**,
  **Mark** (`✗`), **Erase**. Keyboard: `1` cycle, `2`/`F` fill, `3`/`X`
  mark, `4`/`E` erase.
  - **Cycle** steps a cell `empty → fill → ✗ → empty`.
  - `✗` is a personal "this cell is empty" marker — it has no effect on the
    win check, it just helps you reason.
- **Tap** a cell to apply the active mode; **drag** to paint, with the first
  cell deciding whether you add or clear.
- **Hint (💡)**: if anything you've placed contradicts the solution, it
  rings those cells in red. Otherwise it spotlights the next row/column
  that single-line logic can advance, and shows per highlighted cell
  whether to **fill** (solid square) or **mark `✗`** (cross), with a
  banner summarising the counts. Press again to dismiss.
- **Reveal (?)**: overlays the solved picture.
- A row's or column's **clue lights up** (a soft purple band) the instant its
  filled runs match it exactly — a quick "this line's numbers are accounted
  for" cue. It clears again if you change the line so it no longer matches.
  (It reflects only the clue, not the hidden solution, so a coincidental match
  still lights up. Empty `0` lines are never marked.)
- **Undo (↶ / Ctrl+Z)**: steps back one brush action at a time (up to 20);
  Reset is undoable too, until you win.

### Difficulty

Every board is still solvable by pure logic, but the generator grades how
*hard the techniques* are, not just how deep the chain goes. Each single-line
deduction is classed by the simplest technique that finds it:

1. **Overlap** — cells forced by a run's length alone (the "obvious" fills a
   beginner sees at a glance).
2. **Squeeze** — cells forced only by using already-known cells to pin a run
   against an edge or a gap.
3. **Case analysis** — cells that need enumerating all of a line's
   arrangements (genuinely rare at these sizes).

Boards are scored on how much they lean on the harder techniques **and how
many back-and-forth row/column rounds the deduction takes**, then banded Easy /
Medium / Hard as the low / median / high scorers of a line-solvable pool — so
Easy boards are almost all overlap and fall in a wave or two, while Hard boards
mostly need squeezing and many rounds of cross-referencing. Hints follow the
same ladder, always offering the simplest next step first.

### Win

Every filled cell matches the solution — i.e. all row and column clues are
satisfied. `✗` marks are ignored by the win check.

---

## Guards

**Goal.** Post guards on the floor so that every floor cell is watched, no
two guards can see each other, and every numbered pillar has exactly as many
guards beside it as its number. (This is the Akari / "Light Up" puzzle,
reskinned — guards instead of bulbs, pillars instead of walls.)

### Board

- N×N grid; the size slider steps through a fixed set — **6, 8, 10, 12, 16,
  20, 25**.
- **Floor** cells are white and playable; **pillars** are the dark blocks.
- Some pillars carry a **number 0–4**: how many guards must stand on the (up
  to four) floor cells directly above, below, left and right of it.

### Rules

1. A guard **watches** its whole row and column outward in all four
   directions, until the line of sight meets a pillar or the board edge.
2. **Every floor cell must be watched** by at least one guard.
3. **No two guards may see each other** — a guard may not stand on a cell
   another guard already watches.
4. Each **numbered pillar** has exactly that many guards on its orthogonally
   adjacent floor cells. Unnumbered pillars constrain nothing.

Every board has a unique solution. Easy and Medium are solvable by pure
step-by-step logic; Hard also needs exactly one "assume a cell → hit a
contradiction → rule it out" step. Easy reveals the most clues, Hard the fewest.

### Controls

- **Four input modes** (icon buttons below the board): **Cycle**, **Guard**,
  **Mark** (`✗`), **Erase**. Keyboard: `1` cycle, `2`/`B` guard, `3`/`X`
  mark, `4`/`E` erase.
  - **Cycle** steps a cell `empty → guard → ✗ → empty`.
  - `✗` is a personal "no guard here" marker; it has no effect on the win
    check.
- **Tap** a cell to apply the active mode; **drag** to paint, with the first
  cell deciding what the drag lays down.
- **Hint (💡)**: if the board currently breaks a rule it flags that first;
  otherwise it surfaces the next forced guard / `✗`. On Hard, when nothing is
  directly forced, it walks through an "assume → contradiction" step: the
  assumed guard, the numbered cells it forces, and the pillar / dark cell where
  a rule breaks. Press again to dismiss.
- **Reveal (?)**: overlays the solution guards.
- **Undo (↶ / Ctrl+Z)**: steps back one action at a time (up to 20); Reset
  is undoable too, until you win.

### Win

Every floor cell is watched, no two guards see each other, and every numbered
pillar is exact.

---

## Hashi

**Goal.** Connect all the numbered **islands** with **bridges** so that each
island has exactly its number of bridges and every island ends up joined into
one connected network. (Also known as Hashiwokakero or Bridges.)

### Board

- N×N grid; the size slider steps through a fixed set — **7, 9, 11, 13, 15, 17,
  21 or 25** (default 11).
- **Islands** are the numbered circles; everything else is open water a bridge
  may span.

### Rules

1. A **bridge** runs horizontally or vertically between two islands that face
   each other along a row/column with a clear gap (no island in between).
2. A pair of islands may be joined by **0, 1 or 2 bridges**.
3. Bridges are straight and may **never cross** each other (a horizontal and a
   vertical bridge can't share a cell).
4. Each island's **total number of bridges equals its number**.
5. All islands must form a **single connected network** — you can travel from
   any island to any other over the bridges.

Every board has a unique solution. **Easy** solves by pure step-by-step logic.
**Medium** may also need a short "assume a connection → hit a contradiction → rule
it out" step. **Hard** needs a longer one — the contradiction only shows after
several more forced steps. It is always a single assumption at a time, never a
guess inside a guess.

### Controls

- Two input modes, chosen with the **Build / Mark** toggle below the board.
- **Build** — lay bridges: **drag** from one island toward an adjacent one, or
  **click the gap** between two islands. **Left** cycles the connection up
  (`0 → 1 → 2 → 0`), **right** cycles down. A faint preview (and, with a mouse, a
  hover preview) shows what the next click lays. A corridor an existing bridge
  would cross is inert — it can't be clicked or dragged onto.
- **Mark** — a personal memo (undoable, never changes the puzzle): click a
  corridor to lock its count as confirmed (it greys out; a confirmed-empty
  corridor shows a dotted ghost), or click a **full** island to mark it complete,
  which greys all of its connections at once. Editing a connection clears the
  completion flag on its islands.
- **Left (Σ)** toggle (on by default): each island shows how many bridges it
  still needs — a faint italic count, a faint `0` once met, or `−N` in red if it
  has too many — instead of its printed number.
- **Hint (💡)**: flags a broken rule first (a crossing, or an island with too
  many bridges); otherwise it names the simplest next move in plain technique
  terms (a single-direction island, a saturated island, "one short of full", …)
  and ghosts the bridge(s) to lay. When only harder reasoning applies, it walks
  through an "assume → contradiction" chain with numbered steps.
- **Reveal (?)**: overlays the solution bridges.
- **Undo (↶ / Ctrl+Z)**: steps back one action at a time (up to 20); Reset is
  undoable too, until you win.

### Win

Every island's number is satisfied, no bridges cross, and all islands are
connected.

---

## Unshackle (prototype)

Remove every coloured piece. Each piece slides in one fixed direction, toward
its white end cap, and cannot pass through any remaining piece. There is no
countdown or penalty for trying a blocked piece.

- Drag the puzzle to rotate the view; pinch or use the wheel to zoom.
- Tap a piece or its numbered button to attempt a pull. A blocked piece nudges
  back, turns red, and highlights its blockers in amber.
- Hint highlights one piece with a clear exit path. Undo restores the last
  removed piece, including after a win. Reset restores the current puzzle.
- Difficulty and piece count (6, 8, 10, 12, 16, 20 or 24) are staged: choose them, then press
  New Game to generate a fresh puzzle. After solving, Next puzzle generates
  another at the selected settings. Reset keeps the same puzzle.
- Both horizontal and vertical rotation support unlimited full turns.
  Rotations follow the current screen axes, including after tilting or flipping.
- Share copies a link containing the running puzzle's size, difficulty and seed,
  so a friend can play the same puzzle. Staged changes do not change that link.
- Keyboard: arrows rotate while the board is focused, Home restores the view,
  +/− zoom, 1–9 attempt a piece, Ctrl/Cmd+Z undoes. The numbered buttons cover
  all pieces, including 10–24. Undo keeps up to 32 actions.

Puzzles are generated by assembling pieces in reverse removal order and validating
their actual geometric blockers. Easy uses shallow dependency chains; Medium and
Hard require deeper dependencies and fewer initial exits. All piece orientations
stay fixed; only the camera rotates. Clear every piece to finish a puzzle.

