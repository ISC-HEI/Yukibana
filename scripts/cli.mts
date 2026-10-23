/**
 * SPDX-License-Identifier: MIT
 */

// Entry point of the root `build`, `start`, `package`, `download:plugins` and `clean` scripts.
//
//   pnpm build [browser|electron] [--dev]      both apps by default, production unless --dev
//   pnpm start [browser|electron] [--prod]     electron by default, builds in development mode
//              [-- <theia start arguments>]
//   pnpm package [--preview|--publish]         packages the electron app into electron-app/dist
//   pnpm download:plugins [--force]
//   pnpm clean
//
// The native modules (node-pty, keytar, drivelist, native-keymap) use Node-API, so the builds that pnpm installs
// for Node.js also load in Electron, and are not rebuilt for it with `theia rebuild:electron`.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

type App = 'browser' | 'electron';
const APPS: App[] = ['browser', 'electron'];

const root = path.resolve(import.meta.dirname, '..');
// The extensions and the libraries they share.
const extensions = ['packages', 'theia-extensions'].flatMap(parent =>
    fs.readdirSync(path.join(root, parent))
        .map(entry => path.join(root, parent, entry))
        .filter(dir => fs.existsSync(path.join(dir, 'package.json'))));
const theia = createRequire(import.meta.url).resolve('@theia/cli/bin/theia.js');
// The TypeScript hoisted to the root is the older one that @typescript-eslint needs, so use the extensions' own.
const tsc = createRequire(path.join(root, 'packages', 'yukibana-common', 'package.json')).resolve('typescript/bin/tsc');

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

function build(apps: App[], dev: boolean): void {
    // Incremental: tsc only recompiles the projects that changed.
    exec(root, tsc, ['--build']);
    for (const app of apps) {
        exec(appDir(app), theia, ['build', `--app-target=${app}`, ...(dev ? ['--mode', 'development'] : [])]);
        if (app === 'electron') {
            exec(appDir(app), path.join(appDir(app), 'scripts', 'fix-chrome-sandbox.js'), []);
        }
    }
}

/** Downloads the plugins, unless the same list of plugins was downloaded before. */
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
