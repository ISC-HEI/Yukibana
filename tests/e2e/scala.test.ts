/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect, test } from '@playwright/test';
import { TheiaApp, TheiaAppLoader, TheiaTextEditor, TheiaWorkspace } from '@theia/playwright';
import * as path from "path";
import { TheiaLanguageIndicator } from '../src/theia-language-indicator';


test.describe('Scala extension', () => {
    let app: TheiaApp;
    
    test.beforeAll(async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([
            path.resolve(__dirname, '..', '..', 'resources')
        ]);
        app = await TheiaAppLoader.load({
            playwright, browser, useElectron: {
                electronAppPath: "../electron-app",
                pluginsPath: "../plugins"
            }
        }, ws);
    });
    
    test.afterAll(async () => {
        await app.page.close();
    });

    test('should set the language of .scala files', async () => {
        await app.openEditor('hello_world.scala', TheiaTextEditor);
        // Wait for extension to start and detect language
        await new Promise(r => setTimeout(r, 1000))
        const languageIndicator = await app.statusBar.statusIndicator(TheiaLanguageIndicator);
        await languageIndicator.waitForVisible()
        expect(await languageIndicator.getLanguage()).toBe('Scala')
    });
});
