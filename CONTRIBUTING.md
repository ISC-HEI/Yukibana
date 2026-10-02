# Contributing to Yukibana

## Prerequisites

- [Node.js v24+](https://nodejs.org/en/download/)
- [pnpm](https://pnpm.io/installation)
- [Python 3](https://docs.python.org/3/using/index.html)

Some additional tools and libraries are needed depending on your platform,
see Theia's [own documentation](https://github.com/eclipse-theia/theia/blob/master/doc/Developing.md#prerequisites).

## Setting up the environment

1. Download the repository
  
   ```bash
   git clone https://github.com/ISC-HEI/yukibana.git
   ```

2. Go into the project directory

   ```bash
   cd yukibana
   ```

3. Download dependencies

   ```bash
   pnpm install
   ```

## Building the app

Several commands are provided to build, package and run different
parts of the project (see [Architecture](#architecture)).
Here are some of the most useful ones:

### General

- `pnpm install`: install dependencies
- `pnpm run lint`: run the linter on the whole project
- `pnpm run lint:fix`: run the linter on the whole project and apply fixes
- `pnpm run start:electron` or `pnpm run electron start`:
  (after building) start the electron application
- `pnpm run start:browser` or `pnpm run browser start`:
  (after building) start the browser application

### Development

- `pnpm run build:dev`: build extensions and both apps in development mode
- `pnpm run download:plugins`:
  (only once and after changing `theiaPlugins` in a `package.json`) download
  bundled plugins specified in the `theiaPlugins` section of `package.json`
- `pnpm run package:applications:preview`:
  (optional) package the electron application in preview mode\
  The packaged application will be located in `electron-app/dist`

### Production

- `pnpm run build`: build extensions and both apps in production mode
- `pnpm run download:plugins`: see [Development](#development)
- `pnpm run package:applications`:
  (optional) package the electron application in production mode\
  The packaged application will be located in `electron-app/dist`

> [!WARNING]
> While there are some `watch` commands to recompile when changes are made,
> running them does consume quite a lot of memory.

## Architecture

The project is separated into 3 main parts:
- the browser app ([browser-app](browser-app))
- the Electron app ([electron-app](electron-app))
- custom extensions ([theia-extensions](theia-extensions))

Each part is its own workspace and contains its own build commands.
The top-level project also provides general commands.

Extensions that should be bundled with the IDE as builtin extensions
must be added as dependencies of the application (both [browser-app](browser-app)
and [electron-app](electron-app)).

More information can be found in [docs/architecture.md](docs/architecture.md).

## Troubleshooting

### Invalid owner and permissions on `chrome-sandbox`

> The SUID sandbox helper binary was found, but is not configured correctly. Rather than run without sandboxing I'm aborting now. You need to make sure that /path/to/node_modules/electron/dist/chrome-sandbox is owned by root and has mode 4755.

Simply run the following commands to set the appropriate permissions
for the `chrome-sandbox` executable (make sure to replace the path with the one shown in the error):

```bash
sudo chown root:root /path/to/node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 /path/to/node_modules/electron/dist/chrome-sandbox
```
