/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { OSUtil, TheiaApp } from '@theia/playwright';
import { expect, test } from '../src/fixtures';

test.describe('Yukibana app', () => {
    let app: TheiaApp;

    test.beforeAll(async ({ launch }) => {
        app = await launch();
    });

    test('should show main content panel', async () => {
        expect(await app.isMainContentPanelVisible()).toBe(true);
    });

    test('should show status bar', async () => {
        expect(await app.statusBar.isVisible()).toBe(true);
    });

    if (!OSUtil.isMacOS) {
        test('should have menu bar items', async () => {
            expect((await app.menuBar.visibleMenuBarItems()).length > 0).toBe(true);
        });
    }
});
