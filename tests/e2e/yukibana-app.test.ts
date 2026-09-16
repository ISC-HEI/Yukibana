/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect, test } from '@playwright/test';
import { TheiaApp, TheiaAppLoader } from '@theia/playwright';

test.describe('Yukibana app', () => {
    let app: TheiaApp;

    test.beforeAll(async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({
            playwright, browser, useElectron: {
                electronAppPath: "../electron-app"
            }
        });
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should show main content panel', async () => {
        expect(await app.isMainContentPanelVisible()).toBe(true);
    });

    test('should show status bar', async () => {
        expect(await app.statusBar.isVisible()).toBe(true);
    });

    test('should have menu bar items', async () => {
        expect((await app.menuBar.visibleMenuBarItems()).length > 0).toBe(true);
    });
});