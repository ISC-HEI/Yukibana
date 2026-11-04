/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { SuggestionsToggleContribution } from './suggestions-provider';

export function bindLanguageProviderContributions(bind: interfaces.Bind): void {
    bind(SuggestionsToggleContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SuggestionsToggleContribution);
}
