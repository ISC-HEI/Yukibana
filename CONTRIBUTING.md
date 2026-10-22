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

## Building the app

All commands run from the repository root. Each step is skipped when its output
is already up to date, so re-running a command after a small change only redoes
what is needed.

- `pnpm start [browser|electron]`: build in development mode, download the bundled
  plugins if needed, and start the app (Electron by default).
  Use `--prod` for a production build, and pass extra arguments to `theia start`
  after `--`, e.g. `pnpm start electron -- --log-config=../log-config.json`
- `pnpm build [browser|electron]`: build the extensions and the apps (both by default)
  in production mode, or in development mode with `--dev`
- `pnpm package`: build and package the Electron app into `electron-app/dist`.
  Use `--preview` for an unpacked directory, or `--publish` to publish the release
- `pnpm download:plugins`: download the plugins listed in `theiaPlugins`
  (done automatically by `start` and `package`; `--force` downloads them again)
- `pnpm lint` / `pnpm lint:fix`: run the linter on the whole project
- `pnpm test` / `pnpm test:coverage`: compile the extensions and run the unit tests
- `pnpm --filter yukibana-tests ui-tests`: run the Playwright UI tests against a running
  browser app (`pnpm start browser`); downloads Playwright's Chromium on first use
- `pnpm clean`: remove all build outputs, e.g. after deleting or renaming source files,
  whose stale compiled files are otherwise left behind

To recompile an extension on every change, run `pnpm --filter <extension> watch`.

## Architecture

The project is separated into 4 main parts:
- the browser app ([browser-app](browser-app))
- the Electron app ([electron-app](electron-app))
- custom extensions ([theia-extensions](theia-extensions))
- libraries shared by the extensions ([packages](packages))

Each part is its own workspace and contains its own build commands.
The top-level project also provides general commands.

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

### Invalid owner and permissions on `chrome-sandbox`

> The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now. You need to make sure that /path/to/node_modules/electron/dist/chrome-sandbox is owned by root and has mode 4755.

Simply run the following commands to set the appropriate permissions
for the `chrome-sandbox` executable (make sure to replace the path with the one shown in the error):

```bash
sudo chown root:root /path/to/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 /path/to/node_modules/electron/dist/chrome-sandbox
```
