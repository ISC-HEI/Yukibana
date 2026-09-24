/**
 * SPDX-License-Identifier: MIT
 */
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { bindContribution, CommandContribution, FilterContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { ProblemContribution } from '@theia/markers/lib/browser/problem/problem-contribution';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import { ToolbarDefaultsFactory } from '@theia/toolbar/lib/browser/toolbar-defaults';
import { bindConfig } from './config/config-contribution';
import { CleanupFrontendContribution } from './yukibana-cleanup-contribution';
import { YukibanaCommandContribution, YukibanaMenuContribution } from './yukibana-contribution';
import { YukibanaFilterContribution } from './yukibana-filter-contribution';
import { bindLayout } from './yukibana-layout-contribution';
import { YukibanaProblemContributioun } from './yukibana-problem-contribution';
import { YukibanaProblemManager } from './yukibana-problem-manager';
import { SuggestionsContribution } from './yukibana-suggestions-contribution';
import { YukibanaToolbarDefaults } from './yukibana-toolbar-contributions';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindConfig(bind);

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

    bind(YukibanaProblemManager).toSelf().inSingletonScope();
    rebind(ProblemManager).toService(YukibanaProblemManager);

    bind(YukibanaProblemContributioun).toSelf().inRequestScope();
    rebind(ProblemContribution).toService(YukibanaProblemContributioun);

    bindLayout(bind, rebind);
});
