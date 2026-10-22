/**
 * SPDX-License-Identifier: MIT
 */
import '../../src/browser/welcome/style/welcome.css';

import { CommandContribution, MenuContribution } from '@theia/core';
import { FrontendApplicationContribution, OpenHandler, RemoteConnectionProvider, ServiceConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { ContainerModule } from '@theia/core/shared/inversify';
import { SubmissionTarget } from 'yukibana-submission-ext/lib/common/submission-target';
import { CloudAuth, cloudAuthPath, CloudService, cloudServicePath } from '../common/cloud-protocol';
import { openWorkspacesPath, OpenWorkspacesServer } from '../common/open-workspaces-protocol';
import { CloudAccountMenuContribution } from './cloud-account-menu';
import { CloudAccountService } from './cloud-account-service';
import { AuthClientImpl } from './cloud-auth-client';
import { CloudSubmissionTarget } from './cloud-submission-target';
import { LoginCommandContribution } from './command-contribution';
import { OpenWorkspacesClientImpl, OpenWorkspacesContribution } from './open-workspaces-client';
import { WelcomeContribution } from './welcome/welcome-contribution';
import { WelcomeWidget } from './welcome/welcome-widget';
import { YukibanaProjectOpener } from './yukibana-project-opener';
import { YukibanaOpenHandler } from './yukibana-url-handler';

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

    bind(CloudAccountService).toSelf().inSingletonScope();
    bind(CloudAccountMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CloudAccountMenuContribution);
    bind(CommandContribution).toService(CloudAccountMenuContribution);

    bind(CloudService).toDynamicValue(
        ctx => ServiceConnectionProvider.createProxy<CloudService>(ctx.container, cloudServicePath)
    ).inSingletonScope();

    bind(CloudSubmissionTarget).toSelf().inSingletonScope();
    bind(SubmissionTarget).to(CloudSubmissionTarget);

    bind(YukibanaOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).to(YukibanaOpenHandler);

    bind(OpenWorkspacesClientImpl).toSelf().inSingletonScope();
    bind(OpenWorkspacesServer).toDynamicValue(ctx => {
        const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
        return provider.createProxy<OpenWorkspacesServer>(openWorkspacesPath, ctx.container.get(OpenWorkspacesClientImpl));
    }).inSingletonScope();
    bind(OpenWorkspacesContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OpenWorkspacesContribution);

    bind(WelcomeWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: WelcomeWidget.ID,
        createWidget: () => ctx.container.get(WelcomeWidget),
    })).inSingletonScope();
    bind(WelcomeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WelcomeContribution);
    bind(CommandContribution).toService(WelcomeContribution);
    bind(MenuContribution).toService(WelcomeContribution);
    bind(YukibanaProjectOpener).toSelf().inRequestScope();
});
