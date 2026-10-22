/**
 * SPDX-License-Identifier: MIT
 */
import { ElectronMainApplication, ElectronMainApplicationContribution } from '@theia/core/lib/electron-main/electron-main-application';
import { ContainerModule } from '@theia/core/shared/inversify';
import { YukibanaIconContribution } from './yukibana-icon-contribution';
import { YukibanaMainApplication } from './yukibana-main-application';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(ElectronMainApplication).to(YukibanaMainApplication).inSingletonScope();

    bind(YukibanaIconContribution).toSelf().inSingletonScope();
    bind(ElectronMainApplicationContribution).toService(YukibanaIconContribution);
});
