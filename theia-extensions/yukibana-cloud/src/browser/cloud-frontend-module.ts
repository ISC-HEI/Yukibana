/**
 * SPDX-License-Identifier: MIT
 */
import { CommandContribution } from '@theia/core';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { CloudAuth, cloudAuthPath } from '../common/cloud-protocol';
import { AuthClientImpl } from './cloud-auth-client';
import { LoginCommandContribution } from './command-contribution';

export default new ContainerModule(bind => {
    bind(AuthClientImpl).toSelf().inSingletonScope();

    bind(CloudAuth).toDynamicValue(
        ctx => {
            const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            const client = ctx.container.get(AuthClientImpl);
            return provider.createProxy<CloudAuth>(cloudAuthPath, client);
        }
    ).inSingletonScope();

    bind(CommandContribution).to(LoginCommandContribution);
});
