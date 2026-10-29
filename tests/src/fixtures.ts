/**
 * SPDX-License-Identifier: MIT
 */
import { _electron, test as base, Browser, Page, TestInfo } from '@playwright/test';
import { TheiaApp, TheiaAppFactory, TheiaWorkspace } from '@theia/playwright';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export { expect } from '@playwright/test';

/** A Theia app, in the folder `<app>-app`, and the Playwright project that tests it. */
export type App = 'browser' | 'electron';

/** Repository root. */
const root = path.resolve(__dirname, '..', '..');
/** Folder of the downloaded plugins. */
const plugins = path.join(root, 'plugins');
/** Returns `app`'s folder. */
const appDir = (app: App): string => path.join(root, `${app}-app`);

/**
 * A workspace in a new temporary folder, at a path without symbolic links.
 *
 * The Electron app opens a workspace at its real path, so on macOS, where the temporary folder is under /var, a
 * link to /private/var, the explorer's nodes would not have the IDs that TheiaApp looks for.
 */
export class Workspace extends TheiaWorkspace {
    /** Creates the folder, into which `initialize` copies `pathOfFilesToInitialize`. */
    constructor(pathOfFilesToInitialize?: string[]) {
        super(pathOfFilesToInitialize);
        this.workspacePath = fs.realpathSync.native(this.workspacePath);
    }
}

/**
 * Opens the app with `workspace`, a new one by default, or with none if `'none'`, closing the one opened before, and
 * returns it as a `factory` once initialized.
 */
export type Launch = <T extends TheiaApp = TheiaApp>(workspace?: Workspace | 'none', factory?: TheiaAppFactory<T>) => Promise<T>;

/**
 * Playwright's `test`, with `launch`, which opens the app of the test's project. Each worker has its own backend
 * and Theia config folder, and a failed test gets a screenshot of the app.
 */
export const test = base.extend<{ screenshotOnFailure: void }, { app: App, launch: Launch, launched: { page?: Page } }>({
    /** App of the test's project. */
    app: ['browser', { option: true, scope: 'worker' }],
    /** Page that `launch` opened last, if any. */
    launched: [async ({}, use) => use({}), { scope: 'worker' }],
    /** Opens the app of the test's project with a workspace. */
    launch: [async ({ app, playwright, headless, launchOptions, launched }, use) => {
        // Settings and recent workspaces of their own, instead of the developer's.
        const env = { ...process.env, THEIA_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'theia-config-')) };
        let browser: Promise<Browser> | undefined;
        let backend: Backend | undefined;
        /**
         * Closes what the last `launch` opened, even if it is still starting, e.g. after a timeout. What failed
         * to start has nothing to close, and its error was already reported by the test that launched it.
         */
        let close = async (): Promise<unknown> => undefined;
        /**
         * Opens the app with `workspace`, or with none if `undefined`, and returns its page. Without one, Theia would
         * reopen the workspace opened last, so the browser app is asked for an empty window, with Theia's `#!empty`,
         * and the Electron app, which cannot be, is given no recent workspaces.
         */
        const open = async (workspace: TheiaWorkspace | undefined): Promise<Page> => {
            if (app === 'browser') {
                browser ??= playwright.chromium.launch({ ...launchOptions, headless });
                backend ??= startBackend(env);
                const [started, url] = await Promise.all([browser, backend.url]);
                const tab = started.newPage({ viewport: { width: 1920, height: 1080 } });
                close = async () => (await tab.catch(() => undefined))?.close();
                await (await tab).goto(`${url}/#${workspace ? workspace.pathAsPathComponent : '!empty'}`);
                return tab;
            }
            if (!workspace) {
                fs.rmSync(path.join(env.THEIA_CONFIG_DIR, 'recentworkspace.json'), { force: true });
            }
            const electronApp = _electron.launch({
                args: [appDir('electron'), '--no-sandbox', '--no-cluster', `--plugins=local-dir:${plugins}`, ...(workspace ? [workspace.path] : [])],
                env: { ...env, THEIA_ELECTRON_DISABLE_NATIVE_ELEMENTS: '1', THEIA_ELECTRON_NO_EARLY_WINDOW: '1', THEIA_NO_SPLASH: 'true' },
            });
            // The Electron app is single-instance, so one left open would make the next launch, e.g. a retry, quit.
            close = async () => (await electronApp.catch(() => undefined))?.close();
            return (await electronApp).firstWindow();
        };

        await use(async (workspace = new Workspace(), factory = TheiaApp as TheiaAppFactory<never>) => {
            await close();
            const opened = workspace === 'none' ? undefined : workspace;
            opened?.initialize();
            const page = await open(opened);
            launched.page = page;
            // Shorter than the test timeout, so that an app that does not start fails here, where it can be
            // captured: the tests launch in beforeAll, which test-scoped fixtures like screenshotOnFailure skip.
            page.setDefaultTimeout(45 * 1000);
            // TheiaApp needs a workspace even for a window without one, where it never opens it
            const theiaApp = new factory(page, opened ?? new Workspace(), app === 'electron');
            try {
                await theiaApp.waitForShellAndInitialized();
            } catch (error) {
                await attachScreenshot(page, base.info());
                throw error;
            }
            return theiaApp;
        });

        try {
            await close();
        } finally {
            await backend?.stop();
            await (await browser?.catch(() => undefined))?.close();
        }
    }, { scope: 'worker' }],
    /**
     * Attaches a screenshot of the app to a failed test's report, since Playwright's own `screenshot` option only
     * covers the pages it creates for each test.
     */
    screenshotOnFailure: [async ({ launched }, use, testInfo) => {
        await use();
        if (testInfo.status !== testInfo.expectedStatus && launched.page) {
            await attachScreenshot(launched.page, testInfo);
        }
    }, { auto: true }],
});

/**
 * Attaches a screenshot of `page` to `testInfo`'s report, if `page` can be captured within 5 seconds.
 *
 * Best effort: a page that closed or hangs cannot be captured, and the test's own error is what matters.
 */
async function attachScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
    const screenshot = page.isClosed() ? undefined : await page.screenshot({ timeout: 5000 }).catch(() => undefined);
    if (screenshot) {
        await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
    }
}

/** A running backend of the browser app. */
interface Backend {
    /** URL it listens on, once it does; rejected if it exits first. */
    url: Promise<string>
    /** Stops it, with its child processes, and resolves once it exited. */
    stop: () => Promise<unknown>
}

/** Starts the browser app's backend on a free port, with `env`. */
function startBackend(env: NodeJS.ProcessEnv): Backend {
    const backend = spawn(process.execPath, ['lib/backend/main.js', '--port=0', `--plugins=local-dir:${plugins}`], {
        cwd: appDir('browser'),
        env,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exited = new Promise(resolve => backend.on('exit', resolve));
    const url = new Promise<string>((resolve, reject) => {
        let output = '';
        const onData = (data: Buffer): void => {
            output += data;
            // The whole line, so that a URL split across two chunks of output is not cut short.
            const listening = /Theia app listening on (\S+)\.\r?\n/.exec(output);
            if (listening) {
                backend.stdout!.off('data', onData).resume();
                resolve(listening[1]);
            }
        };
        backend.stdout!.on('data', onData);
        exited.then(code => reject(new Error(`The backend exited with ${code}:\n${output}`)));
    });
    return {
        url,
        stop: () => {
            if (process.platform === 'win32') {
                // Killing a process on Windows skips its exit handlers, so end its children too, e.g. the
                // plugin host, as Theia does.
                spawnSync('taskkill', ['/f', '/t', '/pid', String(backend.pid)]);
            } else {
                backend.kill();
            }
            return exited;
        },
    };
}
