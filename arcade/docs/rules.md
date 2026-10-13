# Game Rules

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

## Rune Clash

A two-phase orb-spinning **versus match** — a bounded clash, not an endless climb.
You and the rival each hold an HP pool; it's a race to zero. Play **vs a
real-spinning computer opponent** (Easy / Normal / Hard) or **online** against
another person by room code. **Best** = the fewest rounds you've taken to beat the
computer (per difficulty); online matches are honor-system and record nothing.

### Board & spinning

- A **6×5** board, 6 elements (**fire · water · wood · light · dark · heart**).
  Drag one rune; it swaps along its path (diagonals allowed). The **spin timer
  starts on the first swap** and resolves on release or timeout.
- On resolve, every horizontal/vertical run of **3+** of a colour clears; groups
  cascade as runes fall and new ones drop in. The pre-fall groups are the **first
  wave**.
- **Enhanced runes**: when a colour clears **5+** in a wave, the **next batch of
  dropped runes** includes one **enhanced** rune of that colour (bright rim).
  Cleared later it counts **×1.5** and satisfies "enhanced" shields.
- **Heart** groups **heal** you instead of dealing damage.

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
heart heal, combo step, enhanced ×), `AI_LEVELS` (per-difficulty solver `tries` /
`pathLen` / `skill` / shield stacking), and the `CARDS` pool built in `buildCards()`
(each card's `cost` / `weight` / `cat`). Damage/shield math lives in
`computeSpinResult()` / `simResolve()` / `shieldUnmet()`.
