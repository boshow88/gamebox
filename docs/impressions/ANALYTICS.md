# Impressions analytics operations

This is **client-best-effort**, **unverified-client-state** reference data for
balancing, not a trusted score service. No Functions, Cloud Run, billing upgrade,
durable retry queue or scheduled cleanup is required. The gameplay implementation
is in [README.md](README.md), and other diagnostics in [TESTING.md](TESTING.md).

## Capture contract

`js/games/impressions/analytics.js` automatically observes accepted online snapshots
for the current controller's frozen match, without `?playtest=1`. It caches
question/timeline/receipt data by match and round, then pairs results by round,
question ID and category. Previous `lastResult` and current `question` must not
be joined unless that identity matches the cached question.

One terminal record is eligible only after `game.status === 'over'` and every
round 1…`settledRound` was captured. Missing question/receipt data, no-settlement
matches, interrupted matches without a terminal state and oversized documents
are skipped. A missing answer keeps null/error-null and its actual settlement
zero score/damage; a valid zero-score answer keeps its receipt and `missing:false`.
Withdrawn actors absent from settlement are not invented as zero-score rows.

All online actor mixtures are supported, including one human with CPUs. Local
offline practice is excluded. CPU answers are actual receipts, not regenerated.
The separate developer playtest format is opt-in, local and described in
[TESTING.md](TESTING.md#human-playtest-workflow).

The document ID is lowercase SHA-256 of
`gamebox-memory-analytics-v1|<canonical matchId>`. Only the hash is uploaded;
new random match IDs give rematches distinct IDs. The transport in
`js/net/impressions-analytics.mjs` reuses existing Firebase Auth and makes a Firestore
commit with `currentDocument.exists=false` and server timestamp transform. There
is no read-before-write. First complete create wins; duplicates never overwrite.

An upload is not awaited by gameplay. Permission denial stops the attempt;
transient/unavailable failures get at most three session attempts (2s/10s delays,
10s request timeout). Capture errors, absent modules and upload errors do not
feed back into scoring, HP, Ready, audio, results or room transactions. Up to
eight match entries are kept in page memory; refresh/close loses pending data.

## Record format

Collection: **`memoryMatchAnalytics`**, one successful complete capture per match.

| Field | Meaning |
|---|---|
| `schemaVersion` | 1 |
| `protocolVersion`, `scoringVersion` | Frozen match protocol and Color curve identity; question-specific versions remain too |
| `captureMode`, `captureStatus`, `verificationStatus` | `client-best-effort`, `complete`, `unverified-client-state` |
| `createdAt` | Firestore server upload time, not an asserted match start/end time |
| `settings` | Known frozen generation/scoring, category/challenge/progression, CPU, timing and multiplier settings |
| `participants` | p1…p8 in frozen seat order, human/CPU, CPU difficulty/version, initial/final HP, elimination round, placement, winner/withdrawal flags |
| `rounds` | Question/seed/target/version/variant/parameters, challenge/stage, nominal durations, multiplier and observations |
| `finalResult` | Original terminal reason, last round, settled-round count and anonymous winner IDs |

Observations retain accepted raw answers, missing/source flags, elapsed receipt
time and its source, original error/score/damage/HP and component error metrics.
Canonical scores come from settlement rows. `ImpressionsPlaytest.metrics` reuses
existing graders for extra diagnostics; no second settlement engine is used.

- Score, HP and damage use integer units: **1,000 per point/HP**. Score is
  0…100,000 units; calculated damage may exceed 100 points.
- Color keeps RGB8 target/answer and Oklab errors. Retained HSL/Hue questions also
  retain target HSL/fixed palette data needed to interpret their raw answers.
- Quantity keeps scalar or per-group counts and relative/RMS errors. Group count
  is the ordered `groups` length (one for scalar questions).
- Pitch keeps original Hz precision, tone order/reference IDs, signed adjustable
  cents errors and RMS. Legacy arrays use their first tone as reference.
- Timing is milliseconds. `acceptedElapsedMs` is a **client-clock estimate**, not
  exact thinking time. `auto` can precede cutoff; missing receipts are not proof
  that a human waited until timeout. Rejected attempts are not captured.

The pre-upload limit is **700 KiB UTF-8 JSON**, below Firestore's 1 MiB document
limit. Oversized records are skipped without truncation/chunks. Representative
synthetic structural fixtures measured 21–56 KB for twelve rounds and 136–419 KB
for 100 rounds (2/8 actors, all categories). This is neither a maximum-size proof
nor human performance evidence; the runtime limit remains necessary. Large
settings/participants/rounds/finalResult fields are exempted from indexes.

## Security and privacy

Normal serialization excludes source IDs, controller IDs, names, emails, avatars,
room codes, receipt nonces and audio tokens. p1…p8 have no cross-match identity.
No rendering positions or audio files are uploaded. This reduces identity data;
it does not claim impossible re-identification. A bilingual explanation is in
Impressions's existing How to play section, without a new consent popup.

Firestore Rules allow constrained authenticated create; ordinary users cannot
get/list/update/delete. Existing verified-email `isOwner()` admins can read/delete;
browser updates remain forbidden. Rules check top-level/settings names and
boundary samples of participants/rounds/observations within evaluation limits.
They do not validate every nested field, actual completeness, byte size or scores.
Forged records, malicious nested identity data, deliberate ID occupation and
authenticated write abuse remain possible. RTDB's browser trust model is unchanged.

ADC/Admin SDK administration bypasses Rules and needs separately controlled IAM.
The browser `config/admins` roster does not automatically grant/restrict those
credentials. Never embed keys in browser code or commit them. Protect local
exports with the same retention policy as server data.

## Export and retention

Run from the repository root using supported Node.js and an authorized ADC/IAM
identity. Read-only IAM suffices for export; deletion additionally needs delete
permission. The tool always requires an explicit project.

```text
npm ci --prefix tools/impressions/analytics
gcloud auth application-default login
node tools/impressions/analytics/export.cjs --project games-7e19b --out .cache/impressions-export --page-size 200
```

Exports stream in cursor batches ordered by `createdAt` and document ID:
`matches.ndjson`, `matches.csv`, `rounds.csv`, `observations.csv`. Questions,
answers/settings JSON, versions and original results remain linked to document
IDs. Existing output is not overwritten. After a failure, rerun into a fresh
directory; there is no durable resume or snapshot service.

Recommended retention is **90 days**, administered manually. First dry-run, then
explicitly confirm deletion of this collection only:

```powershell
$analyticsCutoff = (Get-Date).AddDays(-90).ToUniversalTime().ToString('o')
node tools/impressions/analytics/export.cjs --project games-7e19b --delete-before $analyticsCutoff
node tools/impressions/analytics/export.cjs --project games-7e19b --delete-before $analyticsCutoff --confirm-delete
```

## Offline analysis

```text
node tools/impressions/analytics/analyze.cjs --input .cache/impressions-export/matches.ndjson
node tools/impressions/analytics/analyze.cjs --input .cache/impressions-export/matches.ndjson --rescore tools/impressions/analytics/candidate.example.json --rescored .cache/impressions-rescored.ndjson
```

Reports group category/variant, human/CPU and CPU difficulty, missing rates,
errors, score spreads, damage, Quantity stages and accepted receipt timing.
Alternative scoring uses the actual shared game modules. Original and experimental
scores/damages remain separate; the example file never changes game defaults.

This holds original questions and observed actors fixed. Different elimination,
missing later human answers, Quantity progression and unplayed rounds prevent
guaranteed full-match counterfactual outcomes. Do not invent missing answers or
use synthetic CPU data as human evidence. Complete-only capture also introduces
survivorship/connection bias and cannot measure all abandoned matches.

## Tests and deployment

```text
node tools/impressions/analytics-check.js
node tools/impressions/analytics-tools-check.js
firebase emulators:exec --config firebase.json --only firestore --project demo-gamebox "node tools/impressions/analytics-emulator-checks.cjs"
```

The emulator needs Java/Firebase CLI and the local npm dependencies above.
Tests require loopback/demo targets and cover create races, access rules,
100-round capture and actual admin export/deletion. Browser fault/isolation
commands are in [TESTING.md](TESTING.md#browser-checks). The real-room smoke
harness disables automatic analytics so synthetic tests do not populate it.

Publishing the website does not publish Rules. First compare the published
Firestore Rules/indexes with the reviewed candidate; a local Git diff does not
prove that a manually published update is missing. Skip deployment when they
already match. If analytics permissions are absent, unmatched-path Rules can
silently deny creates without interrupting gameplay. Production Rules deployment
or test writes require explicit approval; do not infer approval from this document.
After approval, deploy only the changed Firestore targets, for example:

```text
firebase deploy --only "firestore:rules,firestore:indexes" --project games-7e19b
```

No RTDB Rules redeployment, new paid backend, automatic deletion job or website
push is required by the analytics implementation.

After the website is published, verify one authorized, complete human-played
online match without refreshing away its capture. Confirm a single
`memoryMatchAnalytics` document with server `createdAt`, the frozen versions,
anonymous p1...p8 participants and complete settled rounds. A repeated upload must
not overwrite it. Ordinary accounts must still be unable to read/update records;
use a verified roster admin or separately authorized IAM identity for inspection.
Export that record through the actual Admin SDK tool, then run offline analysis
and check the linked match/round/observation rows. Emulator success and the live
room harness (which disables analytics) do not establish production upload/export
success. Incomplete, oversized or refreshed captures can legitimately be skipped.

Check the project's current plan, shared Firestore storage/read/write usage and
RTDB connections/downloads in Console; these are not determined by source config.
This design does not require a billing upgrade, but uploads, retries, exports and
manual retention consume the project's existing quotas. Index exemptions reduce
indexing of large payloads; keep `createdAt` available for export ordering. See
[Firebase pricing](https://firebase.google.com/pricing). Browser admin membership,
Firebase CLI deployment permission and ADC/IAM export permission are separate.
Ask for the required existing access rather than creating service-account keys,
changing billing/IAM or enabling automatic deletion as part of a release check.
