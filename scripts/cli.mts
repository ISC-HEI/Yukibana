/**
 * SPDX-License-Identifier: MIT
 */

// Entry point of the root `build`, `start`, `package`, `download:plugins` and `clean`
// scripts. Every step is skipped when its output is already up to date, so running a
// command again after a small change (or none) only redoes the work that is needed.
//
//   pnpm build [browser|electron] [--dev]      both apps by default, production unless --dev
//   pnpm start [browser|electron] [--prod]     electron by default, builds in development mode
//              [-- <theia start arguments>]
//   pnpm package [--preview|--publish]         packages the electron app into electron-app/dist
//   pnpm download:plugins [--force]
//   pnpm clean
//   node scripts/cli.mts compile               only compiles the extensions

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

type App = 'browser' | 'electron';
const APPS: App[] = ['browser', 'electron'];

const root = path.resolve(import.meta.dirname, '..');
// The extensions and the libraries they share.
const extensions = ['packages', 'theia-extensions'].flatMap(parent =>
    fs.readdirSync(path.join(root, parent)).map(entry => path.join(root, parent, entry)));
const theia = createRequire(import.meta.url).resolve('@theia/cli/bin/theia.js');
// The TypeScript hoisted to the root is the older one that @typescript-eslint needs, so use the extensions' own.
const tsc = createRequire(path.join(extensions[0], 'package.json')).resolve('typescript/bin/tsc');

const appDir = (app: App): string => path.join(root, `${app}-app`);

function exec(cwd: string, script: string, args: string[]): void {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function pnpmRun(cwd: string, script: string): void {
    // pnpm is a .cmd shim on Windows, which can only be started through a shell.
    const result = spawnSync(`pnpm run ${script}`, { cwd, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

/**
 * Hashes `extra` with the path and content of every file under `paths`. Contents rather than
 * modification times, since `theia rebuild:electron` rewrites the app's package.json in place.
 */
function fingerprint(paths: string[], extra: unknown): string {
    const hash = createHash('sha1').update(JSON.stringify(extra));
    const visit = (file: string): void => {
        const stat = fs.statSync(file, { throwIfNoEntry: false });
        hash.update(`${path.relative(root, file)}\n`);
        if (stat?.isDirectory()) {
            fs.readdirSync(file).sort().forEach(entry => visit(path.join(file, entry)));
        } else if (stat) {
            hash.update(fs.readFileSync(file));
        }
    };
    paths.forEach(visit);
    return hash.digest('hex');
}

/** Runs `step` unless `stampFile` shows it already ran with the same `inputs`. */
function unlessUpToDate(stampFile: string, inputs: string, description: string, step: () => void): void {
    if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === inputs) {
        console.log(`${description}: up to date`);
        return;
    }
    console.log(`${description}...`);
    fs.rmSync(stampFile, { force: true });
    step();
    fs.mkdirSync(path.dirname(stampFile), { recursive: true });
    fs.writeFileSync(stampFile, inputs);
}

function compile(): void {
    console.log('Compiling extensions...');
    exec(root, tsc, ['--build']);
}

function build(apps: App[], dev: boolean): void {
    compile();
    const mode = dev ? 'development' : 'production';
    for (const app of apps) {
        const inputs = fingerprint([
            ...extensions.flatMap(dir => ['package.json', 'src', 'lib'].map(entry => path.join(dir, entry))),
            path.join(appDir(app), 'package.json'),
            path.join(appDir(app), 'esbuild.mjs'),
            path.join(root, 'pnpm-lock.yaml'),
            path.join(root, 'node_modules', '.modules.yaml'),
        ], mode);
        // The bundle carries its own copies of the native modules, so they only need to match the app while bundling.
        unlessUpToDate(path.join(appDir(app), 'lib', '.build-inputs'), inputs, `Bundling the ${app} app (${mode})`, () => {
            rebuildNativeModules(app);
            exec(appDir(app), theia, ['build', `--app-target=${app}`, ...(dev ? ['--mode', 'development'] : [])]);
        });
        if (app === 'electron') {
            exec(appDir(app), path.join(appDir(app), 'scripts', 'fix-chrome-sandbox.js'), []);
        }
    }
}

// Theia backs up the browser builds of native modules in .browser_modules while they are built for Electron, but
// discards the Electron builds when switching back. Those are kept in .electron_modules, so that switching to
// Electron again is a copy instead of a rebuild from source.
const browserModules = path.join(root, '.browser_modules');
const electronModules = path.join(root, '.electron_modules');

type ModuleLocations = Record<string, { originalLocation: string }>;

function readJson<T>(file: string): T {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Identifies what the Electron builds were built from, so that they are only reused for the same versions.
 * Undefined when a module is missing, e.g. after it was uninstalled or the repository moved.
 */
function electronModulesKey(modules: ModuleLocations): string | undefined {
    try {
        const electron = createRequire(path.join(appDir('electron'), 'package.json')).resolve('electron/package.json');
        return JSON.stringify([readJson<{ version: string }>(electron).version, ...Object.entries(modules).map(([name, { originalLocation }]) =>
            [name, originalLocation, readJson<{ version: string }>(path.join(originalLocation, 'package.json')).version])]);
    } catch {
        return undefined;
    }
}

function rebuildNativeModules(app: App): void {
    const current: App = fs.existsSync(browserModules) ? 'electron' : 'browser';
    if (current === app) {
        return;
    }
    if (app === 'browser') {
        const modules = readJson<ModuleLocations>(path.join(browserModules, 'modules.json'));
        fs.rmSync(electronModules, { recursive: true, force: true });
        for (const [name, { originalLocation }] of Object.entries(modules)) {
            fs.cpSync(originalLocation, path.join(electronModules, name), { recursive: true });
        }
        fs.writeFileSync(path.join(electronModules, 'modules.json'), JSON.stringify(modules, undefined, 2));
        const key = electronModulesKey(modules);
        if (key) {
            fs.writeFileSync(path.join(electronModules, 'key.json'), key);
        }
    } else if (fs.existsSync(path.join(electronModules, 'key.json'))) {
        // Same layout as Theia's backup, so that `theia rebuild:browser` can switch back.
        const modules = readJson<ModuleLocations>(path.join(electronModules, 'modules.json'));
        if (fs.readFileSync(path.join(electronModules, 'key.json'), 'utf8') === electronModulesKey(modules)) {
            console.log('Restoring native modules built for electron...');
            // Back up all browser builds before replacing any, and write the manifest first, as Theia does, so
            // that an interrupted restore can still be switched back by `theia rebuild:browser`.
            fs.mkdirSync(browserModules);
            fs.writeFileSync(path.join(browserModules, 'modules.json'), JSON.stringify(modules, undefined, 2));
            for (const [name, { originalLocation }] of Object.entries(modules)) {
                fs.cpSync(originalLocation, path.join(browserModules, name), { recursive: true });
            }
            for (const [name, { originalLocation }] of Object.entries(modules)) {
                fs.rmSync(originalLocation, { recursive: true });
                fs.cpSync(path.join(electronModules, name), originalLocation, { recursive: true });
            }
            return;
        }
    }
    console.log(`Rebuilding native modules for ${app}...`);
    exec(appDir(app), theia, [`rebuild:${app}`, '--cacheRoot', '..']);
}

function downloadPlugins(force: boolean): void {
    const pluginsDir = path.join(root, 'plugins');
    const stampFile = path.join(pluginsDir, '.download-inputs');
    if (force) {
        fs.rmSync(stampFile, { force: true });
    }
    const { theiaPlugins, theiaPluginsExcludeIds } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    unlessUpToDate(stampFile, JSON.stringify({ theiaPlugins, theiaPluginsExcludeIds }), 'Downloading plugins', () => {
        exec(root, theia, ['download:plugins', '--rate-limit=15', '--parallel=false']);
        makeWritable(pluginsDir);
    });
}

/** Some plugin archives contain read-only files, which would make them impossible to update or delete. */
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

function clean(): void {
    for (const dir of extensions) {
        fs.rmSync(path.join(dir, 'lib'), { recursive: true, force: true });
        fs.rmSync(path.join(dir, 'tsconfig.tsbuildinfo'), { force: true });
    }
    for (const app of APPS) {
        exec(appDir(app), theia, ['clean']);
    }
    // The Electron builds of the native modules, which a reinstall of node_modules can make stale.
    fs.rmSync(electronModules, { recursive: true, force: true });
}

function fail(message: string): never {
    console.error(message);
    process.exit(1);
}

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

interface Parsed { values: Record<string, unknown>; positionals: string[]; passthrough: string[] }

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
    compile: {
        options: {},
        run: () => compile(),
    },
    'download:plugins': {
        options: { force: { type: 'boolean' } },
        run: ({ values }) => downloadPlugins(!!values.force),
    },
    clean: {
        options: {},
        run: () => clean(),
    },
};

const [commandName, ...rest] = process.argv.slice(2);
const command = commands[commandName];
if (!command) {
    fail(`Unknown command '${commandName}', expected one of: ${Object.keys(commands).join(', ')}`);
}
const separator = rest.includes('--') ? rest.indexOf('--') : rest.length;
let parsed: ReturnType<typeof parseArgs>;
try {
    parsed = parseArgs({ args: rest.slice(0, separator), options: command.options, allowPositionals: true });
} catch (error) {
    fail((error as Error).message);
}
command.run({ ...parsed, passthrough: rest.slice(separator + 1) });
