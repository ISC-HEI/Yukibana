/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { TheiaApp, TheiaTextEditor, TheiaWorkspace } from '@theia/playwright';
import * as path from 'path';
import { expect, test } from '../src/fixtures';
import { PatchedTheiaApp } from '../src/theia-explorer-patch';
import { TheiaLanguageIndicator } from '../src/theia-language-indicator';

test.describe('Scala extension', () => {
    let app: TheiaApp;

    test.beforeAll(async ({ launch }) => {
        const ws = new TheiaWorkspace([
            path.resolve(__dirname, '..', 'resources')
        ]);
        app = await launch(ws, PatchedTheiaApp);
    });

    test('should set the language of .scala files', async () => {
        await app.openEditor('hello_world.scala', TheiaTextEditor);
        // Wait for extension to start and detect language
        await new Promise(r => setTimeout(r, 1000));
        const languageIndicator = await app.statusBar.statusIndicator(TheiaLanguageIndicator);
        await languageIndicator.waitForVisible();
        expect(await languageIndicator.getLanguage()).toBe('Scala');
    });
});
