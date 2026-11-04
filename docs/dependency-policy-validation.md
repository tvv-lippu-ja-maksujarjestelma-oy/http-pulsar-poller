# Seed validation record

Task: c3b2f03f-c0c2-4fee-8ade-1ce6a6705a9c. Scope: http-pulsar-poller only.
Base: `421bb296111221e0402c58fb8d6c9f00a24521e3`, branch
`codex/policy-a-c3b2f03f`. The shared main checkout was not modified.
No repository settings, production services, other apps or board state changed.

## Acceptance specification

Every dependency update starts in HUMAN unless every changed manifest/lock delta
is explicitly covered and low risk. HUMAN needs pnupu's current-head approval.
Neither lane can pass a hold, draft, conflict, request for changes or absent/failed
required CI. Queue entry and merge use the same live Mergify conditions, including
manual queue commands. Privileged evaluation executes only trusted default code.
Missing required protection adoption keeps activation disabled. Native migration
requires a merge-time veto executor, not an optional asynchronous status alone.

## Reproducible real-data proof

Original Dependabot PR #734 head:
`f2a98521e487b5b0f6568c334f2b24134e350f71`.
Parent: `c0efaff034636f27caa3522a572b397ed21bd702`.
GitHub API reports Dependabot author, web-flow committer and verified signature.
The classifier accepted **AUTO** on both complete, unmodified historical
manifest/lockfile pairs and its grouped trailer. No metadata was fabricated.
This proves actual npm v2 AUTO eligibility, not only synthetic semver logic.
The committed `prettier-group.fixture.json` preserves that message and the
changed package/root projection; unrelated unchanged lock entries are omitted.
Offline tests exercise that fixture through both classifier and API runner.

To reproduce the full proof, fetch the commit with GitHub's commits API and the
four immutable blobs with its contents API (head/parent × package.json/lockfile).
Decode base64 JSON and call `classify({head,files,before,after,commits:[commit]})`.
Use the original PR head: its merged main-branch counterpart was rewritten by
GitHub Actions and is unsigned; it correctly requires HUMAN.

## Checks and boundaries

- `node --test .github/dependency-policy/*.cases.cjs`: 63 tests. Includes real
  grouped/v2 data, sensitive/mixed/transitive changes, stale/missing metadata,
  pnupu/foreign/bot/dismissed approvals, late holds, failed/pending/missing CI,
  activation, foreign publishers, API error revocation and status deduplication.
- `npm run check-and-build`: TypeScript, Prettier, ESLint, Jest and build.
  Dependencies installed with `npm ci --ignore-scripts` in the isolated checkout.
  Existing tests use mocks; no production services or native install scripts ran.
- Official Mergify Draft 2020-12 JSON schema: valid. Parsed YAML confirms identical
  queue, merge and PR-rule eligibility. Semantic service evaluation is unverified.
- actionlint 1.7.12 on changed workflows: valid. Full workflow scan separately
  flags three pre-existing obsolete CodeQL v2 actions. CodeQL was not upgraded
  or removed; its required status remains mandatory.
- Read-only branch inspection: strict CodeQL and build checks required, zero
  required reviews, stale-dismissal and last-push approval disabled, admin
  enforcement enabled, Mergify review bypass present; effective rules list empty.
  These facts explain the separate activation prerequisites in the contract.
- Live queue hold/review revocation, app-qualified statuses and remote required
  checks are not exercised by local mocks. Activation remains disabled until
  separately authorized settings adoption and live veto verification. No real
  approval or merge is used as a test.

## Review disposition

Round 1 used independent Codex Sol xhigh and Claude Fable reviewers. Fixes cover
CI token restriction, publisher qualification, closed lint directives, actual
v2/grouped metadata coverage, runner AUTO decoding, cached-success revocation,
per-PR failure isolation, and duplicate status suppression. Conservative
Mergify-rebased/base-drift fallback is documented. No existing test, assertion,
timeout, CI/security check or error handling was weakened. Round 2 Codex reported no findings; Claude found one v3 test-helper defect.
The helper now tolerates v3, with a migration regression test. Status-write cache
consistency also has a regression test. Round 3 reviews these final corrections. Rounds 1–3 review the original seed. The manual-status availability correction
and six mechanically ported variants are staged for the aggregate round 4 review.

## Manual PR status availability correction

- The trusted evaluator runs while dependency AUTO activation is disabled.
- Fresh GitHub reads confirm the non-Dependabot author, open state, current
  default branch, head SHA and base SHA before publishing general policy success.
- Regression tests cover manual success without AUTO status, stale heads,
  unsupported targets/states, and repository, pull and status API errors.
- Manual policy success states that the manual merge process applies; it does
  not approve or merge the PR.

- Bot API/publication error paths revoke AUTO, Dependabot readiness and general bot status.

## Final focused static validation

Actionlint 1.7.12 passes for all changed workflows.

Changed policy scripts pass Node syntax and repository-locked ESLint. Changed
JS, YAML, Markdown and JSON pass Prettier 3.9.10 after formatting-only fixes.
Focused policy suites pass 63 tests, including S1 manual reporting and S2 shared
SHA isolation. No app build or production service was needed for this pass.

## Round 4 availability and contract corrections

The actual runner reproduced 1,000 general-context writes across 500 unchanged
shared-head bot/manual scans before the fix. With active bot ownership, the same
500 scans make one general-context write; valid current-head pnupu approval then
recovers readiness without exhausting the status cap. Tests also cover closed
bot associations, wrong heads/targets, lookup errors, and manual error deferral.
All workflow filenames are scanned for the old broad approval path; the six
retained legacy approval workflows are removed. Adoption uses only the trusted
activation file after host prerequisites and live-veto checks.
