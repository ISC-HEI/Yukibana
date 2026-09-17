/**
 * SPDX-License-Identifier: MIT
 */
import { YukibanaCommandContribution, YukibanaMenuContribution } from './yukibana-contribution';
import { bindContribution, CommandContribution, FilterContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaFilterContribution } from './yukibana-filter-contribution';
import { CleanupFrontendContribution } from './yukibana-cleanup-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';

export default new ContainerModule(bind => {
    bind(CommandContribution).to(YukibanaCommandContribution);
    bind(MenuContribution).to(YukibanaMenuContribution);

    bind(YukibanaFilterContribution).toSelf().inSingletonScope();
    bindContribution(bind, YukibanaFilterContribution, [FilterContribution]);

    bind(CleanupFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CleanupFrontendContribution);
});
