# Repository organization and maintenance

Keep one maintained implementation or reference for each responsibility. Reduce
duplication and unclear ownership, not file count for its own sake. These rules
apply to JavaScript, tools and documentation; they do not authorize a project-wide
refactor. Engine/UI-specific conventions remain in [DEV.md](DEV.md).

## Start from existing code

Before adding a file or abstraction, inspect comparable games and identify the
current owner of the behavior. Darts separates rules, room, HUD, history and CPU
modules; Unshackle groups `engine.js`, `view.js` and `game.js` under
`js/games/unshackle/`. Both are valid: use responsibility and dependency boundaries
to choose, rather than requiring one file per game or one file per feature phase.

Extend an existing owner when the responsibility is unchanged. Split when the
parts have distinct dependencies or lifecycles, or can be meaningfully tested
independently. Do not create a second implementation merely to avoid reading the
first, and do not combine unrelated code into one oversized file to reduce counts.

## JavaScript responsibilities

| Responsibility | Boundary |
|---|---|
| Rules and state transitions | Pure generation, grading, validation and settlement; no DOM, Firebase, timers or telemetry |
| Views and controls | Rendering, input, audio feedback and UI lifecycle; consume rule/state APIs |
| Online coordination | Authentication, transport, transaction guards, presence and subscriptions |
| Diagnostics and analytics | Observe gameplay and reuse canonical modules; failures must not feed back into gameplay |
| Shared infrastructure | Game-independent mechanisms with real shared callers; game-specific policy stays with the game |

Keep scoring, generation defaults and damage arithmetic with their owning modules.
Local practice, multiplayer and offline tools should call those implementations
instead of copying formulas. Serialized matches retain explicit frozen parameters;
today's defaults must not silently replace them. A backend or export tool may
adapt data formats without becoming another scoring engine.

Extract shared code when actual callers need the same contract. Similar-looking
functions can represent different game rules; do not force them into a generic
framework or introduce dependencies solely to reorganize files.

## Directories and entry points

Small games can retain the existing `js/games/<game>.js` entry. As a game grows,
related implementation modules can live under `js/games/<game>/`; keep its public
entry easy to find. Larger diagnostic/admin tool sets belong under
`tools/<game>/`, and substantial game documentation under `docs/<game>/`.
Shared engines and transports remain in their shared locations.

This is a direction for deliberate changes, not an instruction to move existing
Memory/Darts files now. Existing flat modules can stay until a focused migration
is justified. Directory names and filenames describe responsibilities, not phase
numbers, dates or `new`/`final`/`v2-final` development iterations. Explicit version
names are appropriate when they represent a real supported data/algorithm contract.

Preserve relative URLs, static hosting and existing IIFE/UMD/ES-module loading
contracts. Check HTML script order, imports, browser globals, dynamically assembled
paths, test-fixture source hooks and cached clients before moving files. A small
compatibility entry that delegates to the canonical implementation can be useful;
it must not grow into an independent copy.

## Legacy code and deletion

Age alone does not make a branch obsolete. Frozen match protocols, saved data,
older scoring curves, public entry points and regression fixtures can depend on
it. State which version/caller requires a compatibility path and retain the
associated tests. Do not remove it based only on a static unused-code search.

Remove abandoned experiments, unreachable duplicate implementations and stale
comments only after checking callers, dynamic loading and compatibility needs.
Keep one current implementation where behavior is the same; retain explicit
versioned behavior where it differs. Delete obsolete references with the code
rather than leaving several competing explanations of the current system.

## Documentation ownership

| Reference | Owns |
|---|---|
| [CONVENTION.md](CONVENTION.md) | Organization, module boundaries, documentation ownership and refactoring method |
| [DEV.md](DEV.md) | Shared engine/UI conventions, architecture and implementation contracts |
| [DEBUG.md](DEBUG.md) | Test commands, fixtures and debugging procedures |
| [rules.md](rules.md) | Current player-facing rules and controls |
| [ROOMS.md](ROOMS.md) | Shared room API, network policies and Firebase deployment |
| [UNSHACKLE.md](UNSHACKLE.md) | Isolated 3D subsystem contracts |
| [memory/](memory/README.md) | Maintained Memory implementation, tests/tools and analytics operations |

Update the owning reference instead of creating one report per phase or feature.
Give substantial independent topics a dedicated directory and a small set of
files organized by use. Link to shared setup/contracts rather than duplicating
them. When consolidating, verify current behavior against code, remove superseded
claims, retain operational/compatibility details and repair incoming links.

Implementation history belongs in version control; reproducible test reports and
scratch output can remain in ignored `.cache/`. Summarize changes, validation and
remaining limitations directly in the user reply. Users should not need to open
a new Markdown report to understand completed work.

## Focused refactoring workflow

1. Inventory responsibilities, entry points, consumers and supported versions.
   Explain the concrete maintenance problem; identify what should be reused,
   moved, consolidated or deleted before a broad structural change.
2. Choose the owner and dependency direction. Keep gameplay rules, UI, transport
   and optional observers separate. Preserve public contracts unless a migration
   is explicitly part of the task.
3. Make a bounded change. Update paths/callers together, and remove replaced
   duplicates. Keep structural cleanup separate from gameplay tuning or new
   features. Avoid unrelated formatting churn.
4. Validate the affected boundary: documentation links for document changes;
   pure/frozen regression checks for rules; browser loading/input/lifecycle for
   moved scripts; network/emulator checks when transport or permissions change.
   Do not claim unchanged behavior from syntax checks alone.
5. Update the existing reference and report what changed and what was verified.
   Source cleanup does not authorize Firebase deployment, production test writes,
   website publication or a new feature phase.
