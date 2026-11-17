# Temporary iPhone Home Screen login A/B test

Added to investigate Google login returning to an iOS Home Screen Web App without
a signed-in user. This is a diagnostic experiment, not a confirmed fix.

## What changed

- `js/net/auth-ab-test.mjs`: a temporary panel below the homepage account controls.
  Open the homepage menu, then **登入 A/B 測試（暫時）**. It identifies a browser
  versus a standalone Web App and shows the current mode, account state, and the
  last 20 timestamped events. Logs contain only state labels and Firebase error
  codes, never email, name, user ID, credentials, tokens, or error messages.
- `js/net/net.js`: imports the module, branches Auth initialization, observes the
  original Google login promise, and connects the panel to the account facade.
- `tools/auth-startup-audit.js`: checks both branches with the actual test module
  and a fake Firebase SDK; still checks startup isolation and account permissions.
- `tools/auth-ab-browser-check.js`: tests the panel, mode reload/persistence,
  diagnostics and removal of the test setting in a real local Chrome browser.
- This document and the link in `docs/DEBUG.md` describe usage and removal.

**A (also the default without a setting):** the current `initializeAuth()` setup,
with the popup resolver supplied only when Google login is requested.

**B:** `getAuth(app)`, restoring the Firebase SDK's default initialization used
before commit `6897781`. Firestore and rooms still load independently. The Google
provider, popup call, account storage fallbacks and security rules are unchanged.
There are no added sign-in timeouts or automatic retries, so they cannot mask the
behavior being compared. The panel offers reload if the original login hangs.

## Test on the affected iPhone

1. Open the **existing Home Screen icon**, return to the game homepage, and open
   the menu. Seeing the panel confirms that the new files loaded. Expand it and
   check that the environment reads **主畫面 Web App**.
2. Choose **選 A：目前方式**. The page reloads. Reopen the panel and confirm **A（測試中）**.
3. If signed in, sign out using the normal account button. Then use the normal
   Google login button. Return from Google and note the visible account state,
   whether the login button remains disabled, and the panel's latest events.
   Wait about 30 seconds on a failure; do not treat a pending operation as success.
4. Fully close the Web App from the app switcher, then reopen the same icon.
   Record whether the account is still signed in and confirm the mode is still A.
5. Choose **選 B：原本方式** and repeat steps 3–4. Switching modes itself does not
   sign out or clear any existing Google session; explicitly sign out before each
   login attempt so that restoration is not mistaken for a new successful login.
6. If practical, repeat A once more to distinguish a repeatable difference from
   a temporary connection issue. Use the same phone, network and Google account;
   avoid other open copies of this site while comparing.
7. Report A/B outcomes and screenshots or copied text of the panel. **A fails,
   B succeeds repeatedly** supports the initialization hypothesis. Both failing
   needs further callback/transport investigation; successful login followed by
   logout after reopening points toward persistence/restoration instead.

Use **結束測試並回 A** afterward. It deletes the sole test key and reloads with A.
No need to delete the icon, clear Safari data, or change tracking protection.

## Storage and scope

Only `localStorage['gamebox:auth-ab-test:v1']` is used, containing `{mode, events}`.
The choice survives reload, app closure and navigation to games on this origin.
It is local to this browser/Web App and never sent to Firebase. A mode change
requires reload because a Firebase App must not be initialized twice with
different Auth dependencies. If storage is unavailable the default remains A,
and the panel reports that it could not switch. The panel is visible temporarily
to all homepage visitors, but diagnostics start only after selecting A or B.

## Clean removal

Keep this diagnostic change in its own commit. Before unrelated work lands,
`git revert <the diagnostic commit>` removes the entire experiment. Later, manual
removal allows preserving subsequent work:

1. In `js/net/net.js`, delete the `authABTest` import and `authABTest.connect(account)`.
2. Remove `getAuth` from the Auth imports. Restore the initialization line to
   `const auth = initializeAuth(app, {`, keeping its existing persistence array.
   Remove the temporary A/B comment above it.
3. Restore the login method to:
   `signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver); },`
4. Delete `js/net/auth-ab-test.mjs` and `tools/auth-ab-browser-check.js`.
5. Remove only the experiment-specific changes from `tools/auth-startup-audit.js`:
   the `abSource` read, `abMode` option, fake `getAuth` and its counter, fake local
   test storage, prepended module source, and the A/B loop. Keep the original
   startup and permission checks.
6. Delete this document and its temporary section in `docs/DEBUG.md`.
7. Run `node tools/auth-startup-audit.js` and the existing browser startup check.

If B proves to be the desired permanent fix, keep `getAuth(app)` as an explicit
production change and update the startup checks accordingly; remove the module,
panel, diagnostic wrapper, key handling and documentation in the same way.

Users can press **結束測試並回 A** before removal to erase their local log. Any key
left behind afterward is inert: with the import and branch removed, no code reads
it. It neither affects login nor requires deleting any unrelated site data.
