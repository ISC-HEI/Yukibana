/**
 * SPDX-License-Identifier: MIT
 */

// Entry point of the root `build`, `start`, `package` and `download:plugins` scripts.
//
//   pnpm build [browser|electron] [--dev]      both apps by default, production unless --dev
//   pnpm start [browser|electron] [--prod]     electron by default, builds in development mode
//              [-- <theia start arguments>]
//   pnpm package [--preview|--publish]         packages the electron app into electron-app/dist
//   pnpm download:plugins [--force]
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
/**
 * The extensions' tsc script. The TypeScript hoisted to the root is the older one that @typescript-eslint needs,
 * which fails to parse the extensions.
 */
const tsc = createRequire(path.join(root, 'packages', 'yukibana-common', 'package.json')).resolve('typescript/bin/tsc');

/** Returns `app`'s folder. */
const appDir = (app: App): string => path.join(root, `${app}-app`);

/** Runs `script` with `args` in Node.js in `cwd`, and exits with its status if it fails. */
function exec(cwd: string, script: string, args: string[]): void {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/** Runs the package script `script` in `cwd`, and exits with its status if it fails. */
function pnpmRun(cwd: string, script: string): void {
    // pnpm is a .cmd shim on Windows, which can only be started through a shell.
    const result = spawnSync(`pnpm run ${script}`, { cwd, stdio: 'inherit', shell: true });
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
        if (app === 'electron') {
            exec(appDir(app), path.join(appDir(app), 'scripts', 'fix-chrome-sandbox.js'), []);
        }
    }
}

/** Downloads the plugins listed in package.json, unless the same list was downloaded before and not `force`. */
function downloadPlugins(force: boolean): void {
    const pluginsDir = path.join(root, 'plugins');
    const stampFile = path.join(pluginsDir, '.download-inputs');
    const { theiaPlugins, theiaPluginsExcludeIds } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const inputs = JSON.stringify({ theiaPlugins, theiaPluginsExcludeIds });
    if (!force && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === inputs) {
        console.log('Plugins: up to date');
        return;
    }
    fs.rmSync(stampFile, { force: true });
    exec(root, theia, ['download:plugins', '--rate-limit=15', '--parallel=false']);
    makeWritable(pluginsDir);
    fs.writeFileSync(stampFile, inputs);
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
interface Parsed { values: Record<string, unknown>; positionals: string[]; passthrough: string[] }

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
            downloadPlugins(false);
            exec(appDir(app), theia, ['start', '--plugins=local-dir:../plugins', ...passthrough]);
        },
    },
    package: {
        options: { preview: { type: 'boolean' }, publish: { type: 'boolean' } },
        run: ({ values }) => {
            if (values.preview && values.publish) {
                fail('Use either --preview or --publish, not both');
            }
            build(['electron'], false);
            downloadPlugins(false);
            pnpmRun(appDir('electron'), values.preview ? 'package:preview' : values.publish ? 'deploy' : 'package');
        },
    },
    'download:plugins': {
        options: { force: { type: 'boolean' } },
        run: ({ values }) => downloadPlugins(!!values.force),
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
