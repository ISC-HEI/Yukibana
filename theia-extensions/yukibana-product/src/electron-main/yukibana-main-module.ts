/**
 * SPDX-License-Identifier: MIT
 */
import { ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaIconContribution } from './yukibana-icon-contribution';

export default new ContainerModule(bind => {
    bind(YukibanaIconContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(YukibanaIconContribution);
});
