/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { TheiaStatusIndicator } from '@theia/playwright';

/** The status bar's indicator of the current editor's language. */
export class TheiaLanguageIndicator extends TheiaStatusIndicator {
    /** The status bar entry's ID. */
    id = 'editor-status-language';

    /** Returns the language's name, or an empty string if the indicator shows none. */
    async getLanguage(): Promise<string> {
        const handle = await this.getElementHandle();
        const span = await handle?.$('span');
        return (await span?.innerText()) ?? '';
    }
}
