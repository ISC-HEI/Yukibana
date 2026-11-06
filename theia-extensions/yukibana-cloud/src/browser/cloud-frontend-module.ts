/**
 * SPDX-License-Identifier: MIT
 */
import '../../src/browser/style/download-project-dialog.css';
import '../../src/browser/welcome/style/welcome.css';
import '../../src/browser/update/style/update.css';

import { CommandContribution, MenuContribution, ResourceResolver } from '@theia/core';
import { bindViewContribution, FrontendApplicationContribution, OpenHandler, RemoteConnectionProvider, ServiceConnectionProvider, WidgetFactory } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
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
import { ProjectLocations } from './project-locations';
import { WelcomeContribution } from './welcome/welcome-contribution';
import { WelcomeWidget } from './welcome/welcome-widget';
import { YukibanaProjectOpener } from './yukibana-project-opener';
import { YukibanaOpenHandler } from './yukibana-url-handler';
import { UpdateService, updateServicePath } from '../common/update-protocol';
import { AssignmentUpdates } from './update/assignment-updates';
import { UpdateCheck } from './update/update-check';
import { UpdateMergeEditorFactory } from './update/update-merge-editor';
import { MergeEditorFactory } from '@theia/scm/lib/browser/merge-editor/merge-editor-module';
import { UpdateContribution } from './update/update-contribution';
import { UpdateResourceResolver } from './update/update-resource';
import { UpdateWidget } from './update/update-widget';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(AuthClientImpl).toSelf().inSingletonScope();

    bind(CloudAuth)
        .toDynamicValue(ctx => {
            const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            const client = ctx.container.get(AuthClientImpl);
            return provider.createProxy<CloudAuth>(cloudAuthPath, client);
        })
        .inSingletonScope();

    bind(CommandContribution).to(LoginCommandContribution);

    bind(CloudAccountService).toSelf().inSingletonScope();
    bind(CloudAccountMenuContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CloudAccountMenuContribution);
    bind(CommandContribution).toService(CloudAccountMenuContribution);

    bind(CloudService)
        .toDynamicValue(ctx => ServiceConnectionProvider.createProxy<CloudService>(ctx.container, cloudServicePath))
        .inSingletonScope();

    bind(CloudSubmissionTarget).toSelf().inSingletonScope();
    bind(SubmissionTarget).to(CloudSubmissionTarget);

    bind(YukibanaOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).to(YukibanaOpenHandler);

    bind(OpenWorkspacesClientImpl).toSelf().inSingletonScope();
    bind(OpenWorkspacesServer)
        .toDynamicValue(ctx => {
            const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
            return provider.createProxy<OpenWorkspacesServer>(openWorkspacesPath, ctx.container.get(OpenWorkspacesClientImpl));
        })
        .inSingletonScope();
    bind(OpenWorkspacesContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(OpenWorkspacesContribution);

    bind(WelcomeWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: WelcomeWidget.ID,
            createWidget: () => ctx.container.get(WelcomeWidget),
        }))
        .inSingletonScope();
    bind(WelcomeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(WelcomeContribution);
    bind(CommandContribution).toService(WelcomeContribution);
    bind(MenuContribution).toService(WelcomeContribution);
    bind(YukibanaProjectOpener).toSelf().inRequestScope();
    bind(ProjectLocations).toSelf().inSingletonScope();

    bind(UpdateService)
        .toDynamicValue(ctx => ServiceConnectionProvider.createProxy<UpdateService>(ctx.container, updateServicePath))
        .inSingletonScope();
    bind(AssignmentUpdates).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(AssignmentUpdates);
    bind(UpdateCheck).toService(AssignmentUpdates);
    // Update merges must never reset the student's file; git's merges stay Theia's (see update-merge-editor.ts)
    rebind(MergeEditorFactory)
        .toDynamicValue(ctx => new UpdateMergeEditorFactory(ctx.container))
        .inSingletonScope();
    bind(UpdateResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(UpdateResourceResolver);
    bind(UpdateWidget).toSelf();
    bind(WidgetFactory)
        .toDynamicValue(ctx => ({
            id: UpdateWidget.ID,
            createWidget: () => ctx.container.get(UpdateWidget),
        }))
        .inSingletonScope();
    bindViewContribution(bind, UpdateContribution);
    bind(FrontendApplicationContribution).toService(UpdateContribution);
    bind(TabBarToolbarContribution).toService(UpdateContribution);
});
