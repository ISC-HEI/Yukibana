/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { bindContribution, CommandContribution, FilterContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ToolbarDefaultsFactory } from '@theia/toolbar/lib/browser/toolbar-defaults';
import { CleanupFrontendContribution } from './yukibana-cleanup-contribution';
import { YukibanaCommandContribution, YukibanaMenuContribution } from './yukibana-contribution';
import { YukibanaFilterContribution } from './yukibana-filter-contribution';
import { YukibanaToolbarDefaults } from './yukibana-toolbar-contributions';
import { SuggestionsContribution } from './yukibana-suggestions-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(CommandContribution).to(YukibanaCommandContribution);
    bind(MenuContribution).to(YukibanaMenuContribution);

    bind(YukibanaFilterContribution).toSelf().inSingletonScope();
    bindContribution(bind, YukibanaFilterContribution, [FilterContribution]);

    bind(CleanupFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CleanupFrontendContribution);

    if (isBound(ToolbarDefaultsFactory)) {
        rebind(ToolbarDefaultsFactory).toConstantValue(YukibanaToolbarDefaults);
    } else {
        bind(ToolbarDefaultsFactory).toConstantValue(YukibanaToolbarDefaults);
    }

    bind(SuggestionsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(SuggestionsContribution);
});
