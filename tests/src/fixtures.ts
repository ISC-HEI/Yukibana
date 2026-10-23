/**
 * SPDX-License-Identifier: MIT
 */
import { _electron, test as base, Browser, Page } from '@playwright/test';
import { TheiaApp, TheiaAppFactory, TheiaWorkspace } from '@theia/playwright';
import { spawn } from 'child_process';
import * as path from 'path';

export { expect } from '@playwright/test';

export type App = 'browser' | 'electron';

const root = path.resolve(__dirname, '..', '..');
const plugins = path.join(root, 'plugins');
const appDir = (app: App): string => path.join(root, `${app}-app`);

export type Launch = <T extends TheiaApp = TheiaApp>(workspace?: TheiaWorkspace, factory?: TheiaAppFactory<T>) => Promise<T>;

/**
 * `launch` opens the app of the test's project with a workspace, closing the
 * app it opened before. Each worker has its own backend.
 */
export const test = base.extend<{}, { app: App, launch: Launch }>({
    app: ['browser', { option: true, scope: 'worker' }],
    launch: [async ({ app, playwright, headless, launchOptions }, use) => {
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
                backend ??= startBackend();
                const [started, url] = await Promise.all([browser, backend.url]);
                const tab = started.newPage({ viewport: { width: 1920, height: 1080 } });
                close = async () => (await tab.catch(() => undefined))?.close();
                await (await tab).goto(`${url}/#${workspace.pathAsPathComponent}`);
                return tab;
            }
            const electronApp = _electron.launch({
                args: [appDir('electron'), '--no-sandbox', '--no-cluster', `--plugins=local-dir:${plugins}`, workspace.path],
                env: { ...process.env, THEIA_ELECTRON_DISABLE_NATIVE_ELEMENTS: '1', THEIA_ELECTRON_NO_EARLY_WINDOW: '1', THEIA_NO_SPLASH: 'true' },
            });
            // The Electron app is single-instance, so one left open would make the next launch, e.g. a retry, quit.
            close = async () => (await electronApp.catch(() => undefined))?.close();
            return (await electronApp).firstWindow();
        };

        await use(async (workspace = new TheiaWorkspace(), factory = TheiaApp as TheiaAppFactory<never>) => {
            await close();
            workspace.initialize();
            const page = await open(workspace);
            const theiaApp = new factory(page, workspace, app === 'electron');
            await theiaApp.waitForShellAndInitialized();
            return theiaApp;
        });

        await close();
        await backend?.stop();
        await (await browser?.catch(() => undefined))?.close();
    }, { scope: 'worker' }],
});

/** Starts the browser app's backend on a free port. */
function startBackend(): { url: Promise<string>, stop: () => Promise<unknown> } {
    const backend = spawn(process.execPath, ['lib/backend/main.js', '--port=0', `--plugins=local-dir:${plugins}`], {
        cwd: appDir('browser'),
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
            backend.kill();
            return exited;
        },
    };
}
