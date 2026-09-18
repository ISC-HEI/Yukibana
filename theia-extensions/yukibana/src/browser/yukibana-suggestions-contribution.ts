/**
 * SPDX-License-Identifier: MIT
 */
import { MaybePromise } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';

@injectable()
export class SuggestionsContribution implements FrontendApplicationContribution {
    initialize(): MaybePromise<void> {
        monaco.languages.registerCompletionItemProvider = (selector, provider) => ({ dispose: () => { } });
    }
}
