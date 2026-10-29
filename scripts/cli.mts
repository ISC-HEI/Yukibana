/**
 * SPDX-License-Identifier: MIT
 */

// Entry point of the root `build`, `start`, `package`, `download:plugins` and `watch` scripts.
//
//   pnpm build [browser|electron] [--dev]      both apps by default, production unless --dev
//   pnpm start [browser|electron] [--prod]     electron by default, builds in development mode
//              [-- <theia start arguments>]
//   pnpm package [--preview]                   packages the electron app into electron-app/dist
//   pnpm download:plugins                      downloads the plugins listed in package.json
//   pnpm watch                                 recompiles the extensions on every change
//
// The native modules (node-pty, keytar, drivelist, native-keymap) use Node-API, so the builds that pnpm installs
// for Node.js also load in Electron, and are not rebuilt for it with `theia rebuild:electron`.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

/** A Theia app, in the folder `<app>-app`. */
type App = 'browser' | 'electron';
/** Every app. */
const APPS: App[] = ['browser', 'electron'];

/** Repository root. */
const root = path.resolve(import.meta.dirname, '..');
/** Theia CLI's script. */
const theia = createRequire(import.meta.url).resolve('@theia/cli/bin/theia.js');
/** TypeScript's tsc script, which its package exports only as a bin. */
const tsc = (() => {
    const manifest = createRequire(import.meta.url).resolve('typescript/package.json');
    return path.join(path.dirname(manifest), JSON.parse(fs.readFileSync(manifest, 'utf8')).bin.tsc);
})();

/** Returns `app`'s folder. */
const appDir = (app: App): string => path.join(root, `${app}-app`);

/** Runs `script` with `args` in Node.js in `cwd`, and exits with its status if it fails. */
function exec(cwd: string, script: string, args: string[]): void {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/**
 * Compiles the extensions, and bundles `apps` in development mode iff `dev`, else in production mode.
 *
 * Compiling is incremental; bundling takes a few seconds per app.
 */
function build(apps: App[], dev: boolean): void {
    exec(root, tsc, ['--build']);
    for (const app of apps) {
        exec(appDir(app), theia, ['build', `--app-target=${app}`, ...(dev ? ['--mode', 'development'] : [])]);
    }
}

/**
 * Downloads the plugins listed in package.json, unless the same list was downloaded into the plugins folder before.
 *
 * Theia skips every plugin that is already there, so the plugins downloaded before are deleted first.
 */
function downloadPlugins(): void {
    const pluginsDir = path.join(root, 'plugins');
    // Outside the plugins folder, where Theia would take it for a plugin.
    const stampFile = path.join(root, 'node_modules', '.plugins-download-inputs');
    const { theiaPlugins, theiaPluginsExcludeIds } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const inputs = JSON.stringify({ theiaPlugins, theiaPluginsExcludeIds });
    if (fs.existsSync(pluginsDir) && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === inputs) {
        console.log('Plugins: up to date');
        return;
    }
    fs.rmSync(pluginsDir, { recursive: true, force: true });
    exec(root, theia, ['download:plugins', '--rate-limit=15', '--parallel=false']);
    makeWritable(pluginsDir);
    fs.writeFileSync(stampFile, inputs);
}

/** Packages the Electron app into electron-app/dist, as an unpacked folder iff `preview`. */
function packageElectron(preview: boolean): void {
    const dir = appDir('electron');
    fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true });
    const electronBuilder = createRequire(path.join(dir, 'package.json')).resolve('electron-builder/cli.js');
    // electron-builder.yml only publishes to generic servers, to which electron-builder uploads nothing anyway.
    exec(dir, electronBuilder, ['-c.mac.identity=null', ...(preview ? ['--dir'] : ['--publish', 'never'])]);
}

/**
 * Makes every read-only file under `dir` writable.
 *
 * Some plugin archives contain read-only files, which could not be updated or deleted otherwise.
 */
function makeWritable(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            makeWritable(file);
        } else if (entry.isFile()) {
            const { mode } = fs.statSync(file);
            if ((mode & 0o200) === 0) {
                fs.chmodSync(file, (mode & 0o111) !== 0 ? 0o755 : 0o644);
            }
        }
    }
}

/** Prints `message` and exits with status 1. */
function fail(message: string): never {
    console.error(message);
    process.exit(1);
}

/** Returns the app named by `positionals`, or `fallback` if they are empty; exits if they name anything else. */
function parseApp(positionals: string[], fallback: App[]): App[] {
    if (positionals.length === 0) {
        return fallback;
    }
    const [app, ...extra] = positionals;
    if (extra.length > 0 || !APPS.includes(app as App)) {
        fail(`Expected one of ${APPS.join(', ')}, got: ${positionals.join(' ')}`);
    }
    return [app as App];
}

/** A command's arguments: its options, its positional arguments, and the arguments after `--`. */
interface Parsed {
    values: Record<string, unknown>;
    positionals: string[];
    passthrough: string[];
}

/** Each command, by name: its options, and how it runs. */
const commands: Record<string, { options: ParseArgsOptionsConfig; run: (args: Parsed) => void }> = {
    build: {
        options: { dev: { type: 'boolean' } },
        run: ({ values, positionals }) => build(parseApp(positionals, APPS), !!values.dev),
    },
    start: {
        options: { prod: { type: 'boolean' } },
        run: ({ values, positionals, passthrough }) => {
            const [app] = parseApp(positionals, ['electron']);
            build([app], !values.prod);
            downloadPlugins();
            // As the packaged Linux app and the tests do: Electron's sandbox helper would need root's ownership.
            const sandbox = app === 'electron' && process.platform === 'linux' ? ['--no-sandbox'] : [];
            exec(appDir(app), theia, ['start', '--plugins=local-dir:../plugins', ...sandbox, ...passthrough]);
        },
    },
    package: {
        options: { preview: { type: 'boolean' } },
        run: ({ values }) => {
            build(['electron'], false);
            downloadPlugins();
            packageElectron(!!values.preview);
        },
    },
    'download:plugins': {
        options: {},
        run: () => downloadPlugins(),
    },
    watch: {
        options: {},
        run: () => exec(root, tsc, ['--build', '--watch']),
    },
};

/** The command to run, and its arguments. */
const [commandName, ...rest] = process.argv.slice(2);
const command = commands[commandName];
if (!command) {
    fail(`Unknown command '${commandName}', expected one of: ${Object.keys(commands).join(', ')}`);
}
/** Index of `--` in the arguments, after which they pass through to `theia start`. */
const separator = rest.includes('--') ? rest.indexOf('--') : rest.length;
/** The arguments before `--`, parsed against the command's options. */
let parsed: ReturnType<typeof parseArgs>;
try {
    parsed = parseArgs({ args: rest.slice(0, separator), options: command.options, allowPositionals: true });
} catch (error) {
    fail((error as Error).message);
}
command.run({ ...parsed, passthrough: rest.slice(separator + 1) });
