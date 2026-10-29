# Contributing to Yukibana

## Prerequisites

- [Node.js v24+](https://nodejs.org/en/download/)
- [pnpm](https://pnpm.io/installation)
- [Python 3](https://docs.python.org/3/using/index.html)

Some additional tools and libraries are needed depending on your platform,
see Theia's [own documentation](https://github.com/eclipse-theia/theia/blob/master/doc/Developing.md#prerequisites).

On Windows, the Visual Studio Build Tools also need the
"MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)" component
(Visual Studio Installer > Modify > Individual components).

## Setting up the environment

1. Download the repository
  
   ```bash
   git clone https://github.com/ISC-HEI/yukibana.git
   ```

2. Go into the project directory

   ```bash
   cd yukibana
   ```

3. Install the dependencies, then build and start the app

   ```bash
   pnpm install
   pnpm start
   ```

   The first `pnpm start` also downloads the bundled plugins, which takes a while.

## Commands

All commands run from the repository root. The extensions compile incrementally,
so only the ones that changed are recompiled.

- `pnpm start [browser|electron]`: build in development mode, download the bundled
  plugins if needed, and start the app (Electron by default).
  Use `--prod` for a production build, and pass extra arguments to `theia start`
  after `--`, e.g. `pnpm start electron -- --log-config=../log-config.json`
- `pnpm build [browser|electron]`: build the extensions and the apps (both by default)
  in production mode, or in development mode with `--dev`
- `pnpm package`: build and package the Electron app into `electron-app/dist`.
  Use `--preview` for an unpacked directory
- `pnpm download:plugins`: download the plugins listed in `theiaPlugins`, again whenever
  that list changes (done automatically by `start` and `package`; delete `plugins` to download them again)
- `pnpm lint` / `pnpm lint:fix`: lint the whole project with oxlint
- `pnpm format` / `pnpm format:check`: format the whole project with oxfmt, or only check it
- `pnpm test`: run the unit tests (`*.spec.ts`) with Vitest, straight from the sources;
  `pnpm test:watch` reruns them on every change. What a spec imports from another extension
  or library comes from its compiled `lib`, so rebuild that one after changing it (`pnpm install`
  compiles them all). Filter by file name and test name, e.g.
  `pnpm test config-provider -t "should reload"`
- `pnpm test:e2e`: build both apps in development mode and run the Playwright end-to-end
  tests ([tests/e2e](tests/e2e)) in each of them. Pick one app with `--project=browser` or
  `--project=electron`, and filter like `pnpm test`: `pnpm test:e2e scala -g "language"`.
  Playwright's own options work too, e.g. `--headed`, `--debug` or `--ui`. Before the
  first run, install Playwright's Chromium: `pnpm --filter yukibana-tests exec playwright install chromium`
- `pnpm test:coverage`: run the unit tests and report their coverage, in `coverage/index.html`
- `pnpm clean`: remove what the extensions compiled and the apps bundled, e.g. after deleting
  or renaming source files, whose stale compiled files are otherwise left behind

To recompile the extensions on every change, run `pnpm watch`, and to rebundle an app,
`pnpm --filter yukibana-browser-app watch` (or `yukibana-electron-app`).

## Architecture

The project is separated into 4 main parts:
- the browser app ([browser-app](browser-app))
- the Electron app ([electron-app](electron-app))
- custom extensions ([theia-extensions](theia-extensions))
- libraries shared by the extensions ([packages](packages))

Each part is its own workspace, and the end-to-end tests ([tests](tests)) are one too.
The commands above, run from the root, build and start them.

Extensions that should be bundled with the IDE as builtin extensions
must be added as dependencies of the application (both [browser-app](browser-app)
and [electron-app](electron-app)).

More information can be found in [docs/architecture.md](docs/architecture.md).

## Troubleshooting

### `Could not resolve path of module: @vscode/windows-ca-certs`

This native module failed to compile during `pnpm install`, but since it is
an optional dependency, the installation did not report an error.
Install the Spectre-mitigated libraries (see [Prerequisites](#prerequisites)),
then run `pnpm install --force`.
