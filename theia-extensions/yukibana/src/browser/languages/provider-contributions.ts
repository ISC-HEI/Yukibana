/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { CodeLensToggleContribution } from './code-lens-providers';
import { SuggestionsToggleContribution } from './suggestions-provider';

export function bindLanguageProviderContributions(bind: interfaces.Bind): void {
    bind(SuggestionsToggleContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SuggestionsToggleContribution);

    bind(CodeLensToggleContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CodeLensToggleContribution);
}
