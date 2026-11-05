# Monorepo plan: summary

Two pages on [the full plan](monorepo-plan.md), and what deserves attention before work starts.

## What we're doing

**One repository.** The cloud (SvelteKit Worker, Supabase), the CLI and the IDE all move into `ISC-HEI/Yukibana` as a
pnpm workspace. Light stays in the old repository, which is renamed `yukibana-light` and keeps its GitHub Releases.
The cloud's history comes over through git-filter-repo, into a layout grouped by product:

- `ide/`: the apps, the Theia extensions, `ide/common`, e2e tests.
- `cloud/`: `web` (the Worker), `db` (Supabase), `dev`.
- `packages/`: `project-schema`, `api`, `client` (the library the IDE and the CLI share), `cli`.
- `test-projects/`: the migration corpus.

The demo is deleted.

**Developers install only their area.** `pnpm setup:ide` never installs Supabase, and the cloud setup never downloads
Electron. CI runs only what the change affects, decided by pnpm's dependency graph. A merge queue tests the exact
commit that lands on `main`, with one required check.

**`yukibana.json` versioning.**

- Every version is a strict zod schema with all fields required, including `$schema`.
- Migrations go one version at a time, are checked by the compiler, and the rest of the code only sees the latest
  type.
- The released JSON Schemas are frozen files at `cloud.yukibana.dev/schema/yukibana/vN.json`.
- A growing corpus of synthetic test projects is migrated in CI and checked with hand-written tests typed against the
  latest version.
- Starters keep the teacher's version. `projectId` and `releaseId` move to a separate `yukibana.release.json`.

**API.** One zod definition in `packages/api` replaces the two hand-synced type files. Routes move to `/api/v1`.
Clients send their version; `minClient` is only a warning. The single hard stop is `blockBelow`, an emergency floor set
on the admin page.

**Deploys.** GitHub Actions deploy the cloud after the merge: migrations first, then the Worker. Workers Builds is
retired. Previews need a maintainer's approval and only exist for PRs without database changes.

**Releases.** Pushing a tag `vX.Y.Z` is the only way to release. Versions exist only in tags and are written into the
files in CI.

- Everything is built, tested, smoke-tested and installed while the release is still a **draft**.
- The CLI is published to npm and the draft is made public only after all of that passes.
- The IDE and the CLI always share one version.

**Updates.** electron-updater checks through `cloud.yukibana.dev/updates`, downloads in the background and installs on
quit. There's no forced restart and no other rules.

**License.** MIT. No signing for now; electron-builder's sign hook is where Windows signing goes later.

## Worth your attention

**1. Decisions only you can make**

- **O1:** 14 days for both `minimumReleaseAge` and the Dependabot cooldown (recommended), or 7. Today it's 7 here and 3
  in the cloud.
- **O2:** HES-SO has to confirm the copyright holder and MIT. Contributors outside HES-SO's employment, including the
  other main committer (about 200 commits), own their code and need to agree. This blocks the first npm publish.
- **O3:** Is `browser-app` deployed anywhere?

**2. Accounts and admin work outside the code**

- Register the `yukibana` npm organisation.
- An org admin enables the merge queue, the required check, the tag ruleset and the `production`, `preview` and
  `release` environments.
- Create a Cloudflare API token and move the Supabase secrets to this repository.

**3. Steps that are hard to undo**

- **PR 1 must be merged as a merge commit.** A squash flattens the imported history.
- **The old repository is frozen from day one.** Anything merged there afterwards has to be re-imported by hand.
- **The first npm publish (`v0.1.0`) is permanent.** It uses a short-lived token, because npm can only set up trusted
  publishing for a package that already exists. The trusted publisher must be configured just before the *second*
  release, because npm discards a setup that goes unused for 48 hours.
- **Purge the existing production releases** after `v0.1.0`: their starters won't parse under the strict v1.

**4. Breakage we're accepting (no users)**

- PR 7 makes existing starters invalid, and PR 8 breaks the old GitHub Action, until `v0.1.0` ships.
- The two course repositories (`LordBaryhobal/yukibana-template-scala`, `demo-project`) need updating right after that.
  Someone should tell their owner.

**5. Spikes to run before any PR**

Each one could change the design:

- **S2: pnpm 12 filtered install with the hoisted linker.** The "don't install the other area" promise depends on it.
  If it fails, the Supabase CLI comes from Nix or the devcontainer instead of npm.
- **S4: electron-updater through the Worker's redirects.** It has to work for full and partial updates. If it fails,
  the fallback is GitHub as the update provider, which ties installed apps to the repository's location.
- **S6: logging in on a preview URL.** If it can't work, previews only help for public pages, and a staging Supabase
  project becomes the real fix.
- **S3: the `exact<T>()` helper.** It's what makes migrations type-safe. A simple version breaks on discriminated
  unions, so it needs a careful implementation with type tests.
- **S1** (release age in Dependabot and `pnpm ci`) and **S5** (pnpm fetching Node 24 itself) are smaller.

**6. Things that are more complex than they look**

- **Splitting the CLI's library into `packages/client`,** and moving project and release ids out of `yukibana.json`,
  touch about ten files across the CLI and the IDE. They're listed in §7.3 of the plan.
- **`ide/scripts/cli.mts` assumes the repository root** for plugins and the theia version check. Moving the IDE into
  `ide/` needs care there (§2.1).
- **`cloud/web` stays on TypeScript 6** in a named catalog, because `svelte-check` doesn't support 7 yet.
- **Installer names keep the version** so partial updates work. The Worker provides stable `/download/<os>` links for
  the website.

**7. Deferred on purpose, but with real consequences**

- **macOS doesn't auto-update until it's signed** ($99 a year). Apple Silicon users also see "app is damaged" until they
  run `xattr -cr`. If many students use Macs, this is the first thing to fund.
- Windows SmartScreen warns on first install until it's signed (SignPath is free for open source).
- An update can land right before a deadline or during an exam.
- Previews use production data.
- Light still shares a site with the cloud, so the cloud's same-site defences have to stay.

**8. Supply-chain policy that is now written down**

- Security fixes wait out the release-age window by default.
- `minimumReleaseAgeExclude` is only for vulnerabilities that affect us and are being exploited, pinned to the exact
  version. CI fails once such an entry has passed the window, so it gets removed.

## PR order

1. Import the history.
2. Move to the new layout.
3. Convert to pnpm.
4. Reformat the cloud code.
5. CI, merge queue and cloud deploys, then cut the deploys over.
6. Merge the contributor guides.
7. Versioned `yukibana.json`.
8. `/api/v1`.
9. License (needs O2).
10. Release pipeline and `v0.1.0`.
11. Updater.
12. Rename the old repository to `yukibana-light`.
