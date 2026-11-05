# Plan: one repository for the Yukibana IDE, cloud and CLI

Status: revision 3 (after two adversarial reviews), 2026-11-05. Target repository: `ISC-HEI/Yukibana`. The work
lands as a series of PRs here, and the repository moves to a dedicated organisation later. **There are no users yet,
so breaking changes are allowed** until the first public release; from then on, the compatibility rules in §7, §8
and §11 apply.

## 0. Decisions

| Topic | Decision |
| --- | --- |
| Repositories | `tothambrus11/yukibana-cloud` (minus Light and the demo) moves into `ISC-HEI/Yukibana`. Light keeps the old repository, renamed `yukibana-light`. |
| History | Imported with git-filter-repo. **The final layout wins over preserving history or paths.** |
| Package manager | pnpm workspace with catalogs, everywhere. The CLI is published to the npm registry. |
| Node | 24, enforced. No matrix of Node versions. |
| Validation | zod 4 (ArkType measured and rejected: 48 KB vs 25 KB gzip for the same schema, no JIT on Workers, descriptions double as error messages). |
| `yukibana.json` | One strict, all-required zod schema per version; migrations between consecutive versions whose types the compiler checks; code only sees the latest type. |
| Release identity | `yukibana.release.json`, written by the build into starters, holds `projectId` and `releaseId`; `yukibana.json` has one shape everywhere. |
| Schema URLs | `https://cloud.yukibana.dev/schema/yukibana/v{N}.json`. |
| API | One definition in `packages/api`; `/api/v1/...`; old clients are warned, not refused, except through a rare emergency floor. |
| Releases | A tag `vX.Y.Z` releases the IDE and the CLI together. Versions exist only in tags. Everything stays in a draft until all tests pass. |
| Updates | electron-updater through `cloud.yukibana.dev/updates`; installs on quit, never restarts by itself. One channel. |
| Signing | None for now; electron-builder's signing hooks are where it plugs in later. |
| Previews | Maintainer-approved, only for PRs without database changes, against production data. |
| License | MIT, pending HES-SO's confirmation of the copyright holder. |
| Merging | Merge queue on `main`. |
| Demo | `demo/electron` is deleted. |

## 1. Why: the current setup and its problems

**Build-time drift (one repository fixes these):**

1. A schema change needs a PR in each repository plus a SHA bump in two places of `pnpm-workspace.yaml` (the `catalog`
   entry and the `allowBuilds` key both name the commit). Example: code lenses needed cloud PR #111, then this repo's
   `aa504f8 fix: update config test with codeLenses parameter`. Between the merges each `main` saw a different
   contract. The GitHub dependency is also built through `prepack` on every install.
2. The wire types exist twice: `app/src/lib/api.ts` and `cli/src/lib/wire.ts`, kept in sync by convention only.
3. Two toolchains: npm vs pnpm, Node 22 vs 24, TypeScript 6 (app) vs 7, different oxlint and `@types/node` versions,
   `min-release-age` 3 vs 7 days, two Dependabot configs, a hand-written `once` action vs nothing, 2 vs 4 spaces.
4. `demo/electron` duplicates what the real Theia extension does.

**Run-time drift (versioning fixes these):**

5. Installed IDEs and CLIs talk to the newest Worker, but `/api/*` has no version and nothing detects an old client.
6. `version: 1` of `yukibana.json` has covered several shapes (`features.codeLenses` and `telemetry` were added with
   defaults). The IDE's parser silently drops unknown fields, so an older IDE ignores e.g. `features.ai: false`.
7. The JSON Schema has one fixed URL whose contents change under existing files.
8. Course repositories use `tothambrus11/yukibana-cloud/action@main`, which builds the CLI from `main` on every run,
   on Node 22.
9. Cloudflare Workers Builds deploys every push to `main` even when CI fails, unordered with the database migration.

**Release and update gaps:**

10. A `v*` tag builds installers into Actions artifacts that expire after **1 day**; no GitHub Release exists.
11. `electron-app/package.json` is always `0.1.0`; nothing ties the tag to the app version.
12. `electron-builder.yml` publishes to `yukibana.isc-vs.ch`, which doesn't respond; Windows uses a `${version}` path,
    macOS and Linux `latest`; the macOS ARM build relies on a `sed` edit in CI.
13. No `electron-updater`: an installed IDE never updates.
14. Nothing is signed.

**Other:**

15. No root `LICENSE` (only the installer's `electron-app/resources/LICENSE`); 24 of our packages declare no license.
16. Light (`light.yukibana.dev`) is same-site with the cloud, which the cloud defends against with `__Host-` cookies,
    the forgery check and the sibling tests.
17. `build.yml` ignores `**/*.md` changes in its triggers, which can't coexist with a required check.

## 2. Target layout

Grouped by product, so one path filter selects one area.

```
ide/
  browser/            @yukibana/ide-browser      (was browser-app)
  electron/           @yukibana/ide-electron     (was electron-app)
  extensions/*        Theia extensions           (was theia-extensions/*, incl. langs/scala)
  common/             @yukibana/ide-common       (was packages/yukibana-common; depends on @theia/core)
  e2e/                Playwright                 (was tests)
  scripts/            build/start/package/download:plugins (was scripts/cli.mts)
  package.json        @yukibana/ide: @theia/cli, theiaPlugins
cloud/
  web/                @yukibana/cloud-web        SvelteKit Worker, wrangler.jsonc, .dev.vars
  db/                 @yukibana/cloud-db         supabase/, ops/, .squawk.toml
  dev/                compose.yml, .devcontainer/, scripts (dev-vars, local-admin, smoke, oauth-client, preflight,
                      check-production-config), flake.nix, .env.example
packages/
  project-schema/     @yukibana/project-schema   (private) yukibana.json versions, migrations, JSON Schemas
  api/                @yukibana/api              (private) the API's zod schemas
  client/             @yukibana/client           (private) registry client, login and sessions, packing,
                                                 unpacking, assembly: the library the IDE and the CLI share
  cli/                @yukibana/cli              commands only; the only package published to npm
test-projects/        @yukibana/test-projects    (private) the migration corpus (§7.5)
action/               GitHub Action: runs the published CLI
docs/
package.json          shared tools only: typescript, oxlint, oxfmt, vitest
```

- The cloud's `cli/src` splits: today's library (`library.ts`, `client.ts`, `session.ts`, `lib/*`) moves to
  `packages/client`; the commands stay in `packages/cli`. The IDE imports `@yukibana/client` instead of `@yukibana/cli`;
  the npm package is a binary with no library export.
- `packages/*` build like `packages/yukibana-common` does today: composite `tsc --build` projects with `lib/` output and
  `.d.ts`, referenced from the root `tsconfig.json`. The Theia extensions consume the build output, not `.ts` sources
  (their own projects use `rootDir: src`).
- `packages/*` have no Theia dependency, so the CLI and the cloud never pull Theia in.
- Names: `ProjectFile` is a `yukibana.json` (latest version); `Project` stays the API's project record.
- Heavy tools belong to the one package that needs them: `@theia/cli` and Electron to `ide/`, the `supabase` CLI and
  `squawk-cli` to `cloud/db`, `wrangler` to `cloud/web`. The root has no `postinstall`.
- `app/src/lib/api.ts` and `cli/src/lib/wire.ts` are deleted; types come from `packages/api` with `z.infer`.
- Every package gets a scoped name, `"license": "MIT"`, `"version": "0.0.0-dev"`, and its own `lint`, `typecheck` and
  `test` scripts (the root vitest config is split per package).

### 2.1 Paths and files that change with the move

- **Theia tools assume the repository root.** `theia check:theia-version` only scans `cwd/node_modules`
  (`@theia/cli/lib/check-dependencies.js`), and with `nodeLinker: hoisted` every `@theia/*` package is in the root's
  `node_modules`. The IDE setup runs it from the root as `node node_modules/@theia/cli/bin/theia.js
  check:theia-version` (the root may have no `.bin/theia` once `@theia/cli` belongs to `ide/`). The PR checks that a
  deliberately mixed `@theia/*` version is reported.
- `ide/scripts/cli.mts`: `theiaPlugins` moves to `ide/package.json`, plugins download into `ide/plugins`, the stamp
  file stays in the root `node_modules`; the start command's `--plugins=local-dir:../plugins` and the CI cache key
  (`hashFiles('ide/package.json')`) follow.
- `ide/electron/electron-builder.yml`: `electronDist: ../../node_modules/electron/dist`; `extraResources` from
  `../plugins`; `nsis.license` uses the license generated from the root `LICENSE` (§13).
- `cloud/web/wrangler.jsonc`: `main`, `assets` and `$schema` relative to `cloud/web`; `vite.config.ts`'s
  `platformProxy.configPath` becomes `./wrangler.jsonc`; `dev-vars` writes `cloud/web/.dev.vars`.
- The schema route (`app/src/routes/schema/yukibana.json/+server.ts`) imports `docs/yukibana.schema.json` by a relative
  path; it's replaced by the per-version route of §7.4. The old `/schema/yukibana.json` URL is dropped (no users; the
  two course repositories are updated, §4.1).
- Every Supabase command runs as `pnpm --filter @yukibana/cloud-db exec supabase … --workdir cloud/db`
  (`config.toml`'s `content_path` is relative to it), including the scripts that call `npx --yes supabase` today
  (`dev-vars`, `smoke`, `oauth-client`), which would otherwise download an unpinned CLI. `check-production-config`
  reads `cloud/web/wrangler.jsonc` and `cloud/db/supabase/config.toml`.
- `.gitignore` gets the cloud's entries: `.env`, `.env.local`, `.dev.vars`, `.wrangler/`, `.svelte-kit/`,
  `cloud/web/build/`, `supabase/.temp/`, `supabase/.branches/`, `cloud/dev/data/`, `.direnv/`, and `.nyc_output/`.
  `.dev.vars` holds secrets and this repository is public.
- The cloud docs that mention Light (`architecture.md`, `design.md`, `CLAUDE.md`, `README.md`) are edited.

## 3. Toolchain and dependencies

### 3.1 Versions

Policy: the newest version that is at least 14 days old, unless something blocks it. Checked 2026-11-05 (the cutoff is
2026-10-22).

| Dependency | Target | Note |
| --- | --- | --- |
| pnpm | 12.15.0 | |
| Node | 24.x | `devEngines.runtime: { name: node, version: 24.x, onFail: download }` (S5) |
| @types/node | 24.19.2 | match the runtime, not 26 |
| typescript | 7.0.2 | |
| typescript (named catalog `ts6`) | 6.0.3 | `cloud/web` only: `svelte-check` declares `typescript: ^5 \|\| ^6` |
| svelte-check | 4.7.7 | |
| @theia/* | 1.76.0 | |
| electron | 42.8.1 | `@theia/electron` 1.76 requires exactly this; stays outside the catalog (Theia's CLI checks it as plain semver) |
| vitest, @vitest/coverage-v8 | 5.0.5 | |
| oxlint / oxfmt / oxlint-tsgolint | 1.89.0 / 0.74.0 / 7.0.2004 | |
| @sveltejs/kit / adapter-cloudflare | 3.1.0 / 8.0.1 | |
| wrangler | 4.151.3 | |
| @cloudflare/workers-types | removed | `wrangler types` generates the runtime types from the compatibility date |
| supabase CLI | 2.121.0 | 3.0.0 is a new major: revisit |
| postgres | 3.4.9 | 4.0.0 is a new major: revisit |
| zod | 4.6.7 | |
| electron-updater | 6.8.11 | new |
| tsdown | 0.23.1 | new; bundles the CLI binary |
| git-cliff | newest ≥ 14 days | new, release notes |

All versions go through the strict catalog (`catalogMode: strict`), except `electron` (above); other exceptions get
named catalogs. Spike S2 also checks that the hoisted `svelte-check` uses `cloud/web`'s TypeScript 6, not the root's 7.

### 3.2 Supply-chain rules

- `minimumReleaseAge` and the Dependabot cooldown: **14 days** for both (recommendation, matching the two-week rule for
  new dependencies; today 7 here and 3 in the cloud; **O1** confirms).
- Dependabot: `npm` at `/` (pnpm catalogs supported since Feb 2025), `github-actions` at `/`, `devcontainers` and
  `docker` for `cloud/dev`. `cooldown: { default-days: 14 }`. Groups: theia **including `electron`** (a new Theia needs
  its exact Electron), vitest, react, svelte+vite, oxc, supabase-js+ssr, wrangler. Commit prefixes: `build` for npm,
  `ci` for actions (`include: scope`). Ignore `typescript` majors (the `ts6` catalog); the main catalog is bumped by
  hand.
- Security updates skip Dependabot's cooldown but still wait for `minimumReleaseAge`. Default: the update waits.
- `minimumReleaseAgeExclude` is a reviewed exception: only for a vulnerability that affects us and is being
  exploited, only after checking the release's diff, provenance and announcement, pinned to the exact version
  (`pkg@1.2.3`). A CI check fails once an excluded version is older than the window, so the entry gets removed.
- **Spike S1:** does Dependabot's pnpm resolution honour `minimumReleaseAge`, and does `pnpm ci` refuse a too-young
  lockfile entry? Only if a too-young version can reach `main` unnoticed do we add a lockfile age check.
- License allowlist check in CI (§13).

## 4. Moving the code

### 4.1 Order

1. **Freeze the old repository's cloud parts:** no merges outside `light/` from now until step 6 (if one is needed,
   it's re-imported by hand). Move its open cloud issues to this repository.
2. In a fresh clone of yukibana-cloud, run git-filter-repo (4.2). Merge into a branch of this repo with
   `--allow-unrelated-histories`, fetching with `--no-tags` (the cloud's `light-*`, `haskell-inputs-*` and
   `kotlin-graalvm-*` tags must not reach this repository; the local clone already has some: check
   `git ls-remote --tags origin` after every push). PR 1 is merged with **"Create a merge commit"**, never squashed.
3. PRs 2–4 (§17) land the code in its final layout. The cloud keeps deploying from the old repository meanwhile.
4. PR 5 adds the deploy workflow here. Then: disconnect Workers Builds from the old repository, remove its deploy
   secrets, and run the first deploy from here. From now on only this repository deploys the cloud.
5. PRs 6–10. The API change (PR 8) breaks the old Action, and the schema change (PR 7) makes existing starters
   invalid. Both are accepted (no users). Right after PR 10 publishes the first release: purge the existing releases
   in production (or re-publish them), update the two course repositories (`LordBaryhobal/yukibana-template-scala`,
   `LordBaryhobal/demo-project`) to the strict `yukibana.json` and `ISC-HEI/Yukibana/action@action-v0`.
6. Last: in the old repository, delete everything except `light/`, the `light-*` workflows and `.github/actions/once`,
   and rename it `yukibana-light`. Renaming keeps its GitHub Releases (which Light's build scripts download) and
   redirects the old URLs; update the hard-coded URLs anyway.

### 4.2 git-filter-repo

```sh
git clone https://github.com/tothambrus11/yukibana-cloud cloud-import && cd cloud-import
git filter-repo \
  --path app/ --path cli/ --path supabase/ --path ops/ --path dev/ --path scripts/ --path action/ --path docs/ \
  --path .devcontainer/ --path wrangler.jsonc --path .squawk.toml --path .env.example --path .dev.vars.example \
  --path flake.nix --path flake.lock --path .envrc --path CLAUDE.md \
  --path-rename app/.dev.vars.example:cloud/web/.dev.vars.example \
  --path-rename app/wrangler.jsonc:cloud/web/wrangler.jsonc \
  --path-rename app/:cloud/web/ \
  --path-rename cli/:packages/cli/ \
  --path-rename supabase/:cloud/db/supabase/ --path-rename ops/:cloud/db/ops/ \
  --path-rename .squawk.toml:cloud/db/.squawk.toml \
  --path-rename wrangler.jsonc:cloud/web/wrangler.jsonc \
  --path-rename .dev.vars.example:cloud/web/.dev.vars.example \
  --path-rename dev/:cloud/dev/ --path-rename .devcontainer/:cloud/dev/.devcontainer/ \
  --path-rename scripts/:cloud/dev/scripts/ \
  --path-rename flake.nix:cloud/dev/flake.nix --path-rename flake.lock:cloud/dev/flake.lock \
  --path-rename .envrc:cloud/dev/.envrc --path-rename .env.example:cloud/dev/.env.example \
  --path-rename docs/:docs/cloud/ --path-rename CLAUDE.md:docs/cloud/CLAUDE.md \
  --message-callback '
import re
return re.sub(rb"(?<![\w/])#(\d+)\b", rb"tothambrus11/yukibana-cloud#\1", message)'
```

- Renames apply in order, so the files that moved in history (`app/.dev.vars.example`, `app/wrangler.jsonc`) are
  renamed before the `app/` directory rule.
- The callback rewrites every bare `#N` (subjects, `Merge pull request #N`, "Fixes #N" in bodies), so old numbers don't
  link to this repository's PRs and issues.
- Left out: `light/`, `demo/`, npm lockfiles, `.npmrc`, `.github/` (rewritten), `README.md` (merged by hand),
  `.gitattributes` (this repo's applies), `.gitignore` (merged by hand, §2.1), and the history of directories already
  deleted on the cloud's `main` (e.g. `integrations/moodle/`).

### 4.3 Conventions

- One oxfmt config: this repo's (4 spaces, single quotes, 180 columns). The cloud's code is reformatted once in its own
  PR, listed in `.git-blame-ignore-revs`.
- One contributor guide: the cloud's `CLAUDE.md` rules (database only through migrations, authorisation in Postgres,
  same-site rules, contract documentation, testing) merge with `CONTRIBUTING.md`, by area.
- SPDX headers stay the convention for source files (the cloud's files get them in the reformat PR). No extra tooling.
- Conventional commits for every commit and PR title.

## 5. Working on one area without the others

```jsonc
// root package.json
"scripts": {
  "setup:ide":   "pnpm --filter \"{ide/**}...\" install && node node_modules/@theia/cli/bin/theia.js check:theia-version",
  "setup:cloud": "pnpm --filter \"{cloud/**}...\" install",
  "setup:cli":   "pnpm --filter @yukibana/cli... install"
}
```

- `...` adds workspace dependencies (`packages/*`). An IDE developer never installs the Supabase CLI or needs Docker; a
  cloud or CLI developer never downloads Electron, Theia or its plugins.
- IDE developers point `YUKIBANA_REGISTRY` at the deployed cloud.
- The lockfile is shared, so versions can't drift between areas.
- `nodeLinker: hoisted` stays workspace-wide (Theia needs it). oxlint's import rules catch packages used without being
  declared.
- **Spike S2:** with pnpm 12 and the hoisted linker, does a filtered install leave out the other areas (older pnpm had
  a bug that installed everything, pnpm#6300), does `{ide/**}...` select what we expect, are the root's devDependencies
  installed, and does `svelte-check` find TypeScript 6? If the Supabase CLI leaks into other areas, it comes from
  `cloud/dev/flake.nix` or the devcontainer instead of npm.

## 6. CI

### 6.1 What runs

```sh
pnpm --filter "...[$BASE]" run "/^(lint|typecheck|test)$/"   # changed packages and everything depending on them
```

- Checkout with `fetch-depth: 0` (or fetch `$BASE`), since `[$BASE]` needs the base commit.
- `$BASE`: the PR's base for `pull_request`, `github.event.merge_group.base_sha` in the merge queue.
- `changedFilesIgnorePattern` ignores `**/*.md`; `testPattern` limits test-only changes to their own package.
- No `paths`/`paths-ignore` on the CI workflow's triggers: the `plan` job decides, so the required check always
  reports.
- The `plan` job lists the affected packages once (`pnpm --filter "...[$BASE]" list --json`) and each heavy job runs
  when its target package is in that list. Path lists are not maintained by hand. It runs everything when shared files
  change: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, the root `package.json` and configs, `.github/**`.

| Job | Runs when this package is affected |
| --- | --- |
| lint, typecheck, unit tests | any (per affected package) |
| test-project corpus (§7.5) | `@yukibana/test-projects` |
| cloud stack: squawk, `db reset`, pgTAP, `cloud/web` integration tests | `@yukibana/cloud-web` or `@yukibana/cloud-db` |
| IDE e2e (3 OS × browser/electron) | `@yukibana/ide-electron` or `@yukibana/ide-browser` |
| devcontainer build | files under `cloud/dev/.devcontainer/` changed |
| license allowlist | lockfile or `ide/package.json` (plugins) changed |
| expired `minimumReleaseAgeExclude` entries | always (cheap) |
| frozen files: released corpus projects, released JSON Schemas | `@yukibana/test-projects` or `@yukibana/project-schema` |

### 6.2 Merging

- Merge queue on `main` (available: public repository in an organisation). The CI workflow adds `merge_group:` (the
  deploy and release workflows don't). The commit that lands is the commit that was tested.
- One required check, `ci-ok`. It `needs` `plan` and every job, fails if any of them failed or was cancelled, and
  passes when each passed or was skipped as unaffected.
- Previews are not part of `ci-ok`.
- An org admin turns this on.

## 7. `yukibana.json`

### 7.1 Versions

```ts
// packages/project-schema/src/v1.ts: frozen once it is released
export const v1 = z.strictObject({
    $schema: z.literal('https://cloud.yukibana.dev/schema/yukibana/v1.json'),
    version: z.literal(1),
    kind: z.enum(['rust-cargo', 'scala-sbt']),
    hidden: globs,
    submission: z.strictObject({ include: globs, exclude: globs /* ... */ }),
    /* every field required */
});
export type V1 = z.output<typeof v1>;
```

- **v1 is strict and all-required from the start** (no users yet).
- Every field is required, `$schema` included (a literal per version, so the URL can't disagree with `version`).
  Unknown keys are rejected: a misspelt `"hiden"` is an error.
- No nullable fields where a value can say the same thing: `submission.include` is a list, `["**"]` meaning
  everything.
- No transforms in versioned schemas: a type test checks `z.input<typeof vN>` equals `z.output<typeof vN>`, so what
  `config upgrade` writes always parses back.
- Any change in meaning is a new version: a new, removed or renamed field, a changed default, a new enum value.
- `parseProjectFile` reads `version`, parses with that version's schema, then runs the migrations up to the latest.
  A version newer than this program knows fails with "This project needs yukibana.json v3; this IDE reads up to v2",
  and the IDE offers to install the update now (§11). A missing `version` fails naming the field.
- A folder without `yukibana.json` opens with `NO_PROJECT_FILE`, one literal of the latest type, checked by the
  compiler. It's what a plain folder gets, not a set of defaults for files.
- `yukibana config init` writes a complete latest-version file (every field). `yukibana config upgrade` rewrites a file
  to the latest version.
- Versions are dropped only deliberately, after a stated support window, with an explicit error for them.

### 7.2 Migrations are checked by the type checker

```ts
// v2.ts
export const v2 = v1.extend({ $schema: z.literal('.../v2.json'), version: z.literal(2), features: v1.shape.features.extend({ hints: z.boolean() }) });
export type V2 = z.output<typeof v2>;

export const fromV1: Migration<V1, V2> = p => exact<V2>()({ ...p, $schema: '.../v2.json', version: 2, features: { ...p.features, hints: true } });
```

- Each migration is a pure function, typed `Migration<A, B> = (a: A) => Checked<B>`. `Checked<B>` is a brand that only
  `exact<B>()` produces, so a migration can't return without going through it; the type itself enforces this (oxlint
  has no `no-restricted-syntax`).
- `exact<T>()` rejects keys that `T` doesn't have, because TypeScript doesn't check excess properties that come from a
  spread: a removed or renamed field would otherwise be carried into the next version. It recurses into objects,
  arrays and records, distributes over unions (discriminated unions included), and stops at brands and primitives.
  It has its own type tests for each of those cases.
- Refinements TypeScript can't see (uuid, non-empty relative globs) use zod brands, so a migration can only create
  such a value through the validating constructor.
- No runtime test re-validates migration output. Unit tests next to each migration give an input and assert things
  about the output.

### 7.3 Course repositories, starters and release identity

- `yukibana.json` has one shape in course repositories and in starters. The starter's copy is the teacher's file with
  `hidden: []` (the starter must not name what it hides), at the **teacher's** version: the teacher decides when a
  class needs a newer IDE.
- `yukibana.release.json` at the starter's root: `{ "version": 1, "projectId": "…", "releaseId": "…" }`, strict, all
  required, versioned like every persisted format, written only by `yukibana build`/`publish`. A course repository has
  none; a preview build (`build` without `--project`) writes none, so a student can't submit from it by accident.
- It is **the student's claim**, as `releaseId` is today: it's submitted, it isn't protected, and the registry keeps a
  release id only when it names a release of the same project. `collect` and assembly read the claim from the
  submission's `yukibana.release.json` (today `claimedRelease` reads the submission's `yukibana.json`). Assembly takes
  `yukibana.json` and the protected files from the teacher's release; the course repository's tree never has a release
  file (`ALWAYS_EXCLUDED`).
- Call sites that move from `yukibana.json`'s ids to the release file: `cli/src/bundle.ts` (`config.projectId`,
  `config.releaseId`), `cli/src/commands/common.ts` (the default project), `cli/src/commands/collect.ts`
  (`claimedRelease`), `lib/yukibana.ts` (`starterConfig`, `sameStudentConfig`, `ALWAYS_EXCLUDED`, `NEVER_SUBMITTED`,
  `protectedPaths`), and in the IDE `theia-extensions/yukibana-cloud/src/browser/welcome/welcome-model.ts`
  (`projectIdOf`) and `project-locations.ts`, which recognise a folder by its project id.
- The IDE and the CLI read the same parsed `ProjectFile`.

### 7.4 JSON Schemas

- Generated from zod (`z.toJSONSchema`, draft 2020-12, descriptions from `.describe()`) for the version that isn't
  released yet. A released version's file (`packages/project-schema/schemas/yukibana.v{N}.json`) is then a static
  file: CI fails if it changes, and nothing regenerates it, so a zod upgrade can't change it.
- Served by the Worker at `https://cloud.yukibana.dev/schema/yukibana/v{N}.json`, immutable. The deploy trigger
  follows the package graph (§9), so a new schema version is deployed with the code that writes it.
- Offline: the npm package ships `schemas/*`, and the IDE registers them for `yukibana.json` through Theia's JSON
  schema contribution, picking the file by `$schema`.

### 7.5 Test-project corpus

```
test-projects/
  scala-basic-v1/
    project/            a complete course repository at v1
    submissions/        optional sample student folders
    project.test.ts     hand-written checks against the latest `ProjectFile`
```

```ts
projectTest('scala-basic-v1', ({ project, starter, assemble }) => {
    expect(project.features.ai).toBe(false);
    expect(starter().files).not.toContainEqual(expect.stringMatching(/^src\/test\/scala\/hidden\//));
    expect(assemble('edited-readonly').modified).toEqual(['README.md']);
});
```

- The harness reads the project at its own version, migrates it to the latest, and runs the test. Parsing or
  migration failure fails the test.
- Tests are typed against the latest `ProjectFile`. When a later version changes a field, the affected tests stop
  compiling and are updated by hand.
- No snapshot files.
- **Only synthetic projects and submissions.** Real course repositories contain hidden tests, and real submissions are
  personal data; this repository is public. A real repository's structure may inspire a new corpus project, rewritten
  by hand.
- **`project/` and `submissions/` freeze once their version is released** (`packages/project-schema/released.json`
  lists released versions; CI checks). The test file never freezes. A PR labelled `corpus-override` by a maintainer
  may change a frozen project anyway (a leak, licensing, a bug in the project itself), with the reason in the PR.
- Every schema version has at least one project written at it (checked by a test).
- The IDE's e2e and release smoke tests open the oldest and newest corpus projects.

## 8. The API

### 8.1 One definition

`packages/api` holds a zod schema per endpoint (request and response). The Worker's handlers are typed against it;
`@yukibana/client` decodes with it. Types come from `z.infer`. If the Worker's bundle size ever matters, the package can
switch to `zod/mini`.

### 8.2 Versions

- Routes move to `/api/v1/...` now, without aliases (no users).
- Requests: the server rejects unknown fields. Responses: clients ignore unknown fields. Adding a response field is
  allowed within a version; renaming, retyping, removing a field or making it nullable needs `/api/v2`. How `/api/v1`
  is then kept (an adapter over v2 or its own handlers) is decided when v2 exists.
- **Submitting keeps working in every API version that exists.** The submit flow (login and refresh, `/me`, the
  project lookup, `POST /submissions`) is the last thing an old version may lose.
- An API version is retired only when the usage counts (§8.3) show no client using it for a whole term.

### 8.3 Clients and `minClient`

- Every request sends `Yukibana-Client: ide/1.4.0` or `cli/1.4.0`. The host injects its version into
  `@yukibana/client` (Electron's `app.getVersion()`, the CLI's version inlined at build), because the client package
  itself stays `0.0.0-dev`.
- The Worker counts requests per client and version per day in a database table, so retiring an API version is based
  on data; Workers logs don't keep a term's history.
- Settings in a database row, edited on the admin page (an emergency can't wait for a PR and a deploy):
  `minClient`, `blockBelow`. `GET /api/v1/meta` returns them.
- **`minClient` is advice.** Below it:
  - IDE: a status-bar warning that offers to restart into the downloaded update. On macOS (no auto-update, §15) it
    links to the download page.
  - CLI: a warning on stderr with `npm i -g @yukibana/cli@latest`.
- **`blockBelow` is the emergency floor**, for a client that is dangerous to keep (a security hole, corrupting
  submissions). Below it the server answers `426` with a sentence for the user, for every request. It's unset normally,
  setting it is logged in the audit log.
- Dev builds (`0.0.0-dev`) ignore both.

## 9. Cloud deployment

`deploy-cloud.yml` on `push: main` when `@yukibana/cloud-web` or `@yukibana/cloud-db` is affected (the pnpm package
graph, so `packages/api` and `packages/project-schema` count), and by hand (`workflow_dispatch`):

1. `concurrency: { group: deploy-cloud, cancel-in-progress: false }`.
2. `check-production-config` as today.
3. `supabase db push --workdir cloud/db` (a no-op when nothing is pending), `ops/bootstrap.sql`, Supabase config push.
4. `wrangler deploy` from `cloud/web`.
5. A failed deploy is re-run by hand; the next deploy includes everything anyway.
6. The database rules from the cloud's guide stay: migrations only add; removing a column is expand/contract (stop
   reading it, deploy, drop it in a later migration). The old Worker keeps working between steps 3 and 4.
7. Secrets in a `production` environment: the Supabase token, project ref and database URL, the auth secrets, and a
   Cloudflare API token.
8. `drift.yml` runs nightly as today.

**Previews,** only for PRs from branches of this repository that don't touch `cloud/db`:

- A `preview` job builds the PR's `cloud/web` without any secret and uploads the build as an artifact.
- A second workflow, triggered by `workflow_run` and running `main`'s workflow code, takes the artifact and runs
  `wrangler versions upload` with the Cloudflare token. The token lives in a `preview` environment with **required
  reviewers**: a maintainer approves each preview, because a Cloudflare token can't be limited to uploads, and the
  preview runs the PR's code against production's database and bucket. The PR comment with the URL says so.
- **Spike S6:** can one log in on a preview URL (Supabase's `site_url` and `SITE_URL` point at `cloud.yukibana.dev`),
  and does `wrangler.jsonc` need `preview_urls`/`workers_dev`? If login can't work, previews only help for public
  pages, and the staging project (§15) is the real fix.

## 10. Releases

### 10.1 Versions come from tags

- Every `package.json` in git says `0.0.0-dev`. Dev builds show it and keep the updater off.
- A maintainer pushes `vX.Y.Z` (a tag ruleset limits `v[0-9]*` tags to maintainers). The release workflow triggers on
  `v[0-9]+.[0-9]+.[0-9]+` only. The first release is `v0.1.0`.
- The release job runs `ide/scripts/release-version.mts "$V"`, which writes the version into `ide/electron`,
  `ide/browser` and `packages/cli` in the CI checkout only, before building. Nothing is committed.
- **The IDE and the CLI always release together under one version.** One tag, one `minClient` number. The cost: CLI
  versions also go up when only the IDE changed.
- Release notes: git-cliff from the conventional commits. No changelog file in git.
- No prerelease channel for now.

### 10.2 Pipeline (`release.yml`)

```
verify ─ tag on main? valid semver? higher than the last release?
 ├─ test ─ lint, typecheck, unit tests, test-project corpus: whole workspace
 ├─ cli  ─ set version → tsdown build → pnpm pack → drop devDependencies from the packed manifest
 │         smoke: npm i -g the tarball in an empty folder; yukibana --version;
 │                check, build and assemble on corpus projects;
 │                tarball has no workspace:/catalog: and only dist, schemas, LICENSE, notices
 └─ ide (windows | linux | macos-arm64 | macos-x64) ─ set version → electron-builder --publish never → upload to DRAFT
        smoke: install (NSIS /S, AppImage, macOS zip), start with Playwright, wait for the workbench,
               open the oldest and newest corpus projects, check settings applied, quit
        update test (Windows, Linux): start the installed app with YUKIBANA_UPDATE_FEED pointing at a local server
               serving a fake vX.Y.(Z+1); check it finds and downloads it (AppImage: APPIMAGE set)
publish ─ needs all jobs · environment "release"
  1. attest-build-provenance on every file
  2. npm publish the tested tarball (OIDC); skipped if already published
  3. publish the draft release; skipped if already published
  4. move the action-v<major> tag to this commit
```

- **Nothing is public until every job passed.** Builds go only to a draft release, which collaborators can inspect.
  The update feed and download links only see published releases. The npm tarball waits as a workflow artifact.
- npm before the GitHub release: if npm fails, the release stays a draft. Re-running `publish` finishes whatever is
  missing.
- A failed run leaves a draft to delete. A bad release found after publishing is fixed by a new patch release.
- `YUKIBANA_UPDATE_FEED` is an environment variable: whoever can set it already controls the machine.

### 10.3 Packaging and the update feed

- Artifact names keep the version (`Yukibana-Setup-1.4.0.exe`, `Yukibana-1.4.0-arm64.zip`, `Yukibana-1.4.0.AppImage`):
  electron-updater finds the previous version's blockmap by replacing the version in the file name, which is what makes
  differential updates work.
- Installed apps use electron-builder's `generic` provider with `https://cloud.yukibana.dev/updates/`, so they don't
  depend on where the repository lives. The Worker redirects:
  - `/updates/latest.yml`, `latest-linux.yml`, `latest-mac.yml` → the newest published release's file;
  - `/updates/<file with version X>` → that exact file in release `vX` (deterministic, so a release published in
    between can't mix two versions);
  - `/download/windows|linux|macos-arm64|macos-x64` → the newest installer, for the website.
  It finds the newest release through GitHub's API, cached for a few minutes.
- The `yukibana.isc-vs.ch` addresses and the `sed` edit go away.
- Linux: AppImage only (the `.deb` can't auto-update).
- macOS: two runners as today (native modules are copied from the host architecture: `nodeGypRebuild: false`,
  `npmRebuild: false`). Each uploads its own zip and dmg. Merging their `latest-mac.yml` files waits until macOS builds
  are signed (§14), since unsigned macOS can't auto-update anyway.
- Windows: NSIS, per-user (`perMachine: false`).
- **Spike S4:** electron-updater's generic provider through these redirects, including a differential update.

## 11. Updates in the IDE

New extension `ide/extensions/updater`, using electron-updater in Electron's main process (Theia's `theia-ide` has an
updater extension to learn from).

- Checks at startup and every 6 hours; downloads in the background; installs on quit. It never restarts the app by
  itself, so nobody is interrupted mid-work.
- A status-bar item "Restart to update" lets the user install now; the "this project needs a newer IDE" error offers
  the same.
- The release smoke test checks that each new build can update to a newer one.

## 12. The CLI

- `packages/cli` holds the commands; `@yukibana/client`, `@yukibana/project-schema` and `@yukibana/api` are bundled into
  it with tsdown. The published manifest lists only real runtime dependencies (zod, modern-tar, ignore, uuid);
  devDependencies are removed in the pack step.
- `engines.node: ">=24"`. Ships `schemas/*`, `LICENSE` and third-party notices.
- npm: you register the organisation `yukibana`. The first release (`v0.1.0`) publishes with a short-lived granular
  token stored as a one-off secret, because npm can only configure trusted publishing on an existing package.
  Immediately before the second release, configure the trusted publisher (`ISC-HEI/Yukibana`, workflow `release.yml`,
  environment `release`; unvalidated configurations expire after 48 hours), delete the token secret, and turn token
  publishing off. When the repository moves organisation, the trusted publisher must be updated.
- A daily "newer version available" line on stderr (cached; off when `CI` is set or stderr is not a terminal).
- The Action (`action/action.yml`): `setup-node` 24, then `npx -y @yukibana/cli@<major> publish …`. Course
  repositories use `ISC-HEI/Yukibana/action@action-v<major>` (`action-v0` for 0.x), a tag the release moves; it doesn't
  match the release trigger.

## 13. License

- **MIT** for our code: it's what the code already says, and every dependency allows it. Alternatives: Apache-2.0
  (adds a patent grant), EPL-2.0 or MPL-2.0 (per-file copyleft), AGPL-3.0 for `cloud/` only. GPL-3.0 is ruled out:
  Theia is EPL-2.0 or GPL-2.0-only, neither compatible with GPL-3.0.
- Production dependencies (IDE: 942 packages walked): permissive except Theia (EPL-2.0 OR GPL-2.0 w/ Classpath),
  `jschardet` (LGPL-2.1+), `@vscode/codicons` (CC-BY-4.0), `font-awesome` (OFL-1.1 + MIT), `dompurify` (MPL-2.0 OR
  Apache-2.0, used as Apache). Bundled plugins: Metals (Apache-2.0), `redhat.java` (EPL-2.0; check whether it bundles a
  JRE and under which license), the rest MIT. Cloud and CLI: all permissive.
- `jschardet`: the production bundles are minified, so to keep the LGPL's "user can replace it" promise it's marked
  external in the bundler and shipped as its own unminified file.
- Deliverables: a root `LICENSE`; `"license": "MIT"` everywhere; the installer's license (today
  `electron-app/resources/LICENSE`) generated from the root one; a generated `ThirdPartyNotices.txt` in the app and the
  npm package, with the EPL source offer pointing at the exact Theia version and the LGPL notice; the CI license
  allowlist for npm dependencies plus a checked list of the bundled plugins and their licenses.
- **O2:** HES-SO confirms the copyright holder and the license before the first publish. Contributors outside HES-SO's
  employment (including the other main committer, with about 200 commits) hold copyright in their contributions and
  need to agree.

## 14. Signing (later, when there is budget)

- Windows: electron-builder's custom sign hook (`win.signtoolOptions.sign`, a script that sends each file to the
  signing service). It signs the app executable, the installer and the uninstaller during packaging, so `latest.yml`
  and the blockmaps are right without recomputation. SignPath Foundation (free for open source) needs a "Code signing
  policy" page with team roles, named approvers, a privacy statement disclosing the typing telemetry, MFA, manual
  approval per release, and an unsigned public release first; the publisher shown is "SignPath Foundation". Ask
  SignPath about signing the renamed Electron executable. Paid alternatives: Azure Trusted Signing (check whether it
  accepts Swiss organisations), a Certum open-source certificate.
- **Don't set `win.publisherName` while builds are unsigned**: electron-updater would reject every update.
- macOS: Apple Developer ID ($99/year), with electron-builder's `identity` and `notarize`; then merge the two
  `latest-mac.yml` files in the publish job.
- Linux: no OS signing; GitHub artifact attestations on every file from day one (`gh attestation verify`).

## 15. Future concerns (accepted for now)

- **macOS without signing can't auto-update** (Squirrel.Mac requires a signed app), and Apple Silicon calls a
  downloaded unsigned app "damaged" until `xattr -cr`. Mac users update by hand from the download page.
- Windows SmartScreen warns on first install of the unsigned installer.
- Machines that don't auto-update: labs with updates off, per-machine installs, students offline for weeks.
- A Linux distro package would need an APT repository and its own signing key.
- Light should move to its own registrable domain; until then the cloud's same-site defences stay.
- Previews share production's database and bucket; a staging Supabase project (free tier allows two) would remove
  that.
- A beta channel and gradual rollouts (`stagingPercentage`) once there are many users.
- Updates around deadlines and exams: an update installed on quit can still change the IDE right before a deadline
  or during an exam. If that becomes a problem, options include holding back installs shortly before a student's
  deadlines, and a machine-level switch to turn updates off for managed labs.
- A job that runs the previous release's CLI against a PR's cloud, once API compatibility matters (after `v1.0.0`).
- SchemaStore registration of the JSON Schema.

## 16. Open questions

- **O1:** 14 days for both `minimumReleaseAge` and the Dependabot cooldown (recommended), or 7?
- **O2:** copyright holder and license confirmed by HES-SO, and agreement of outside contributors.
- **O3:** Is `browser-app` deployed anywhere? If yes, it needs a deploy job.

## 17. Spikes and PR sequence

Spikes first, each a throwaway branch:

- **S1** release age: Dependabot's pnpm resolution and `pnpm ci` with a too-young lockfile entry.
- **S2** filtered install on pnpm 12 with the hoisted linker, the `{ide/**}...` selector, root devDependencies,
  `svelte-check` with TypeScript 6.
- **S3** `exact<T>()` and `Checked<B>` with the real schemas (unions, brands, records, arrays) on TypeScript 7.
- **S4** electron-updater's generic provider through the Worker's redirects, with a differential update.
- **S5** `devEngines.runtime` with `onFail: download` in pnpm 12.15.
- **S6** logging in on a preview URL.

PRs, each with a conventional title:

1. `chore: import yukibana-cloud history` (filter-repo merge, moves only; merge commit).
2. `refactor: move to the ide/, cloud/, packages/ layout` (+ `packages/client` split, `ide/common`, demo deletion, §2.1
   paths and `.gitignore`).
3. `build: convert the cloud and CLI to the pnpm workspace` (catalog, ts6 catalog, `workspace:*`, drop the `github:`
   entry and its `allowBuilds` key, Node 24, versions from §3.1, per-package scripts).
4. `style: format the cloud with the shared oxfmt config` (+ `.git-blame-ignore-revs`, SPDX headers).
5. `ci: affected-only CI, merge queue support and cloud deploys from Actions` (+ Dependabot, license and exclude
   checks); then cut over the deploys (§4.1 step 4).
6. `docs: merge the contributor guides`.
7. `feat(project-schema)!: strict versioned yukibana.json with typed migrations` (+ `yukibana.release.json`, corpus,
   JSON Schemas served per version, `config init`/`upgrade`).
8. `refactor(api)!: one API definition and /api/v1` (+ `/api/v1/meta`, settings row and admin page, usage counts,
   `Yukibana-Client`).
9. `chore: add the MIT license and third-party notices` (after O2).
10. `ci: tag-driven release of the IDE and CLI` (+ smoke tests, drafts, npm publishing, the Action, the `/updates` and
    `/download` routes); release `v0.1.0`; §4.1 step 5.
11. `feat(updater): auto-update on quit`.
12. Rename and strip the old repository (§4.1 step 6).
