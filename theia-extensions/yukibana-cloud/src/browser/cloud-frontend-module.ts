/**
 * SPDX-License-Identifier: MIT
 */
import { CommandContribution } from '@theia/core';
import { RemoteConnectionProvider, ServiceConnectionProvider } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionTarget } from 'yukibana-submission-ext/lib/common/submission-target';
import { CloudAuth, cloudAuthPath, CloudService, cloudServicePath } from '../common/cloud-protocol';
import { AuthClientImpl } from './cloud-auth-client';
import { CloudSubmissionTarget } from './cloud-submission-target';
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

    bind(CloudService).toDynamicValue(
        ctx => ServiceConnectionProvider.createProxy<CloudService>(ctx.container, cloudServicePath)
    ).inSingletonScope();

    bind(CloudSubmissionTarget).toSelf().inSingletonScope();
    bind(SubmissionTarget).to(CloudSubmissionTarget);
});
