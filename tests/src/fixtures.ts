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

export type App = 'browser' | 'electron';

const root = path.resolve(__dirname, '..', '..');
const plugins = path.join(root, 'plugins');
const appDir = (app: App): string => path.join(root, `${app}-app`);

/**
 * A workspace in a temporary folder, at a path without symbolic links. The Electron app opens a workspace at
 * its real path, so on macOS, where the temporary folder is under /var, a link to /private/var, the explorer's
 * nodes would not have the IDs that TheiaApp looks for.
 */
export class Workspace extends TheiaWorkspace {
    constructor(pathOfFilesToInitialize?: string[]) {
        super(pathOfFilesToInitialize);
        this.workspacePath = fs.realpathSync.native(this.workspacePath);
    }
}

export type Launch = <T extends TheiaApp = TheiaApp>(workspace?: Workspace, factory?: TheiaAppFactory<T>) => Promise<T>;

/**
 * `launch` opens the app of the test's project with a workspace, closing the
 * app it opened before. Each worker has its own backend. When a test fails,
 * a screenshot of the app is attached to its report.
 */
export const test = base.extend<{ screenshotOnFailure: void }, { app: App, launch: Launch, launched: { page?: Page } }>({
    app: ['browser', { option: true, scope: 'worker' }],
    // The page that `launch` opened last.
    launched: [async ({}, use) => use({}), { scope: 'worker' }],
    launch: [async ({ app, playwright, headless, launchOptions, launched }, use) => {
        // Settings and recent workspaces of their own, instead of the developer's.
        const env = { ...process.env, THEIA_CONFIG_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'theia-config-')) };
        let browser: Promise<Browser> | undefined;
        let backend: { url: Promise<string>, stop: () => Promise<unknown> } | undefined;
        /**
         * Closes what the last `launch` opened, even if it is still starting, e.g. after a timeout. What failed
         * to start has nothing to close, and its error was already reported by the test that launched it.
         */
        let close = async (): Promise<unknown> => undefined;
        /** Opens a page of the app. */
        const open = async (workspace: TheiaWorkspace): Promise<Page> => {
            if (app === 'browser') {
                browser ??= playwright.chromium.launch({ ...launchOptions, headless });
                backend ??= startBackend(env);
                const [started, url] = await Promise.all([browser, backend.url]);
                const tab = started.newPage({ viewport: { width: 1920, height: 1080 } });
                close = async () => (await tab.catch(() => undefined))?.close();
                await (await tab).goto(`${url}/#${workspace.pathAsPathComponent}`);
                return tab;
            }
            const electronApp = _electron.launch({
                args: [appDir('electron'), '--no-sandbox', '--no-cluster', `--plugins=local-dir:${plugins}`, workspace.path],
                env: { ...env, THEIA_ELECTRON_DISABLE_NATIVE_ELEMENTS: '1', THEIA_ELECTRON_NO_EARLY_WINDOW: '1', THEIA_NO_SPLASH: 'true' },
            });
            // The Electron app is single-instance, so one left open would make the next launch, e.g. a retry, quit.
            close = async () => (await electronApp.catch(() => undefined))?.close();
            return (await electronApp).firstWindow();
        };

        await use(async (workspace = new Workspace(), factory = TheiaApp as TheiaAppFactory<never>) => {
            await close();
            workspace.initialize();
            const page = await open(workspace);
            launched.page = page;
            // Shorter than the test timeout, so that an app that does not start fails here, where it can be
            // captured: the tests launch in beforeAll, which test-scoped fixtures like screenshotOnFailure skip.
            page.setDefaultTimeout(45 * 1000);
            const theiaApp = new factory(page, workspace, app === 'electron');
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
    // Playwright's own `screenshot` option only covers the pages it creates for each test.
    screenshotOnFailure: [async ({ launched }, use, testInfo) => {
        await use();
        if (testInfo.status !== testInfo.expectedStatus && launched.page) {
            await attachScreenshot(launched.page, testInfo);
        }
    }, { auto: true }],
});

/**
 * Attaches a screenshot of `page` to the report. Best effort: a page that closed or hangs cannot be captured,
 * and the test's own error is what matters.
 */
async function attachScreenshot(page: Page, testInfo: TestInfo): Promise<void> {
    const screenshot = page.isClosed() ? undefined : await page.screenshot({ timeout: 5000 }).catch(() => undefined);
    if (screenshot) {
        await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });
    }
}

/** Starts the browser app's backend on a free port. */
function startBackend(env: NodeJS.ProcessEnv): { url: Promise<string>, stop: () => Promise<unknown> } {
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
