/********************************************************************************
 * Copyright (C) 2026 ISC @ HES-SO Valais/Wallis and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { TheiaStatusIndicator } from '@theia/playwright';

export class TheiaLanguageIndicator extends TheiaStatusIndicator {
    id = 'editor-status-language';

    async getLanguage(): Promise<string> {
        const handle = await this.getElementHandle();
        const span = await handle?.$('span');
        return await span?.innerText() ?? '';
    }
};
