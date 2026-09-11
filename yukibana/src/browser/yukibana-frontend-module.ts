/**
 * Generated using theia-extension-generator
 */
import { YukibanaCommandContribution, YukibanaMenuContribution } from './yukibana-contribution';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { ContainerModule } from '@theia/core/shared/inversify';

export default new ContainerModule(bind => {
    // add your contribution bindings here
    bind(CommandContribution).to(YukibanaCommandContribution);
    bind(MenuContribution).to(YukibanaMenuContribution);
});
