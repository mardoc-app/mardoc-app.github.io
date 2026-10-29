# WP-6: Settings screen and sign-in banner

**How to read this document.** This is the slice plan for one work package,
written in plan mode before product code. The bar: an engineer who has never
seen the conversation could implement the change from this plan alone. The
builder reads this file and the docs it links, not the planning conversation.

- **Status:** PENDING
- **Milestone:** M1. **Row:** [plan.md § M1 work packages](../plan.md#m1-work-packages)
- **Model / agent:** sdlc:builder (Sonnet), own worktree

## Goal

Two pieces of user-facing sign-in UI:

1. **Settings, GitHub Connection tab.** It offers **Sign in with GitHub**
   first and keeps the personal access token (PAT) form behind its own
   control. It shows the signed-in view, the saved-PAT notice and actions,
   and the install link. It shows every failure with the PAT option, and
   PAT instructions that match the guide. It never says "there is no
   server". It is hidden in embed mode.
2. **Sign-in banner.** It appears above the main pane for `expiring`,
   `expired` and `sign-in-again` (with the document to be opened), inside an
   `aria-live` region.

Design: [Settings screen](../design/github-sign-in/design.md#settings-screen),
[Sign-in banner](../design/github-sign-in/design.md#sign-in-banner),
[result codes](../design/github-sign-in/design.md#sign-in-result-codes).
The UI reads `session`, `sessionKey`, `hasCredential` and `startSignIn`
from the context (WP-4; the `StartSignIn` type is frozen) and never touches
a token.

**Requirements proved:** F-10, F-13, F-15, F-17, F-18, F-32, F-33, F-37,
F-38, F-41 to F-44, F-54, F-55, F-71, F-72, NF-13, NF-18, NF-22 (T-16 and
T-18's UI part).

## Files that change

| Path | Change | New? |
|---|---|---|
| `src/components/SettingsPanel.tsx` | The GitHub Connection tab as designed. Error text comes from the result-code table. The PAT instructions are rewritten from `docs/setup-github-pat.md`, with no `read:org` unless the guide lists it. The guide is linked. The help text uses the data-and-security.md wording (Q-10). The install link is `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`, opened with `rel="noopener noreferrer"` | no |
| `src/components/SignInBanner.tsx` | The banner: three states, Sign in again, and Continue without signing in. It calls `startSignIn()` inside the click handler | yes |
| `src/lib/auth/config.ts` | `GITHUB_APP_SLUG`, default `"mardoc-app"` (Q-36), overridable by `NEXT_PUBLIC_GITHUB_APP_SLUG` for the development App | yes |
| The component that renders the main pane (the builder finds it from `src/app/page.tsx`) | Mounts `SignInBanner` above the main pane, and shows F-37's "Sign in again to open `<path>`" instead of demo data in `sign-in-again`, and F-42's message for a deep-link 404 with a sign-in credential | no |
| The repository list component | F-44's empty-installations message | no |
| `e2e/sign-in-ui.spec.ts` | T-16, T-18 UI, keyboard and `aria-live` checks, using `e2e/fixtures/auth-mocks.ts` (WP-5) or its own route mocks if WP-5 hasn't merged | yes |

## Increments and proof points

**Riskiest assumption:** none unproven. This is UI against state that WP-4
proved. Increment 1 is the thinnest visible slice.

| Increment | Claim or bounded change | Prerequisite | Proof and PASS criterion | Result and evidence |
|---|---|---|---|---|
| 1 | The signed-out and PAT views (F-10, F-15, F-17, F-18, F-54, F-71, F-72) | WP-4 merged | `PLAYWRIGHT_PORT=3106 npx playwright test e2e/sign-in-ui.spec.ts -g "settings"`. With empty storage, the first button reads "Sign in with GitHub" and the token input is hidden until "Use a personal access token". With a seeded PAT, the view shows "Connected with a personal access token" and the sign-in button. `/?embed=true` has no sign-in control. `grep -n "there is no server" src/components/SettingsPanel.tsx` prints nothing. The full existing e2e suite still passes | PENDING |
| 2 | The signed-in views, installs and errors (F-13, F-41 to F-44, F-55, T-18 UI) | Increment 1 | Same spec with the session driven to each status through mocks or a test hook. "Signed in with GitHub as octo". The saved-PAT sentence and both remove actions. The install link's `href` and `rel`. F-44's empty message and F-42's message. Every result code shows its text and the PAT option | PENDING |
| 3 | The banner, keyboard and screen reader (F-32, F-33, F-37, F-38, NF-18, NF-22) | Increment 2 | The banner's three states and their texts. Continue without signing in shows demo data, and the next reload shows no prompt. A keyboard-only run reaches Sign in, Sign in again, the install link and every error. Prompts and errors sit in an `aria-live` region. With `/api/auth/*` returning 503, the PAT and demo specs pass (NF-13). Then `npm run ci` | PENDING |

## Interfaces touched

| Interface | Frozen? | Change |
|---|---|---|
| Context values from WP-4 | Consumed | None |
| `StartSignIn` | Frozen | Called only |

## Risks

- **What could break:** the existing Settings PAT flow and the e2e specs
  that drive it. The token form moves behind a control, so existing specs
  that type into it may need to open that control first. Any such spec
  change is listed in the report with the reason, F-17.
- **Options not taken:** a separate sign-in page. The design puts sign-in
  in Settings.

## Proof

| Test | Level | Proves |
|---|---|---|
| `t16_settings_*` | Playwright | F-10, F-13, F-15, F-17, F-18, F-41, F-44, F-71, F-72 |
| `t18_error_text_and_pat_option_*` | Playwright | F-51, F-52 (UI), NF-18, NF-22 |
| `f32_banner_*`, `f37_reload_prompt_names_file`, `f38_continue_without_signing_in` | Playwright | F-32, F-33, F-37, F-38 |
| `nf13_worker_down_pat_and_demo_unaffected` | Playwright | NF-13 |

```sh
PLAYWRIGHT_PORT=3106 npx playwright test e2e/sign-in-ui.spec.ts
npm run ci
```

## Relevant lessons

None apply.

## Done when

- [ ] Every increment has a recorded PASS and evidence inspected by the lead.
- [ ] `npm run ci` is green, apart from M1-1 and M1-2, with output pasted.
- [ ] The plan.md row is set to DONE.
