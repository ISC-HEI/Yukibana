/**
 * SPDX-License-Identifier: MIT
 */
import { TheiaApp } from '@theia/playwright';
import { expect, test } from '../src/fixtures';

/** Selector of Yukibana's welcome screen. */
const WELCOME = '[id="yukibana.welcome"]';
/** Selector of Theia's own welcome page, which @theia/ai-ide brings in and Yukibana's replaces. */
const GETTING_STARTED = '[id="getting.started.widget"]';

test.describe('Welcome screen', () => {
    test("should show in a window without a project, instead of Theia's", async ({ launch }) => {
        const app: TheiaApp = await launch('none');
        await expect(app.page.locator(WELCOME)).toBeVisible();
        await expect(app.page.locator(GETTING_STARTED)).toHaveCount(0);
    });

    test("should not show with a project, nor Theia's", async ({ launch }) => {
        const app: TheiaApp = await launch();
        await expect(app.page.locator(GETTING_STARTED)).toHaveCount(0);
        await expect(app.page.locator(WELCOME)).toHaveCount(0);
    });
});
