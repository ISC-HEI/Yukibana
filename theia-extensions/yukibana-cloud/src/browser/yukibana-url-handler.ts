/**
 * SPDX-License-Identifier: MIT
 */
import { ILogger, MaybePromise, MessageService, nls, URI } from '@theia/core';
import { OpenerOptions, OpenHandler } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CloudService } from '../common/cloud-protocol';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class YukibanaOpenHandler implements OpenHandler {
    readonly id = 'yukibana';
    readonly label = 'Yukibana';

    static readonly PRIORITY: number = 500;

    @inject(ILogger) @named('yukibana:OpenHandler') protected readonly logger!: ILogger;
    @inject(CloudService) protected readonly service!: CloudService;
    @inject(FileDialogService) protected readonly fileDialogs!: FileDialogService;
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(FileService) protected readonly files!: FileService;

    canHandle(uri: URI, options?: OpenerOptions): MaybePromise<number> {
        return uri.scheme === 'yukibana' ? YukibanaOpenHandler.PRIORITY : 0;
    }

    async open(uri: URI, options?: OpenerOptions): Promise<undefined> {
        const subject = uri.authority;
        const command = uri.path.toString();

        this.logger.info(`Opening url: ${uri.toString()}`);

        if (subject === 'project') {
            this.logger.info(`Running project command: ${command}`);
            await this.doProjectCommand(command, uri);
        }
    }

    private async doProjectCommand(command: string, uri: URI): Promise<void> {
        if (command === '/open') {
            const projectId = new URLSearchParams(uri.query).get('id');
            this.logger.info(`Opening project: ${projectId}`);
            // Invalid URI
            if (!projectId) {
                this.logger.info('No project id');
                return;
            }
            const progress = await this.messages.showProgress({ text: nls.localize('yukibana/cloud/openProject/progressMessage', 'Opening project') });
            progress.report({
                message: nls.localize('yukibana/cloud/openProject/gettingInfo', 'Getting info...')
            });
            const info = await this.service.getProjectInfo(projectId);
            // Project not found
            if (!info) {
                this.logger.info('Project not found');
                progress.cancel();
                this.messages.error(nls.localize('yukibana/cloud/openProject/notFound', 'Project not found'));
                return;
            }
            progress.report({
                message: nls.localize('yukibana/cloud/openProject/choosingLocation', 'Choosing download location...')
            });
            const folder = await this.fileDialogs.showOpenDialog({
                title: nls.localize('yukibana/cloud/openProject/downloadLocation', 'Save project \'{0}\'', info.title),
                openLabel: nls.localizeByDefault('Select'),
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
            });
            // No selection
            if (!folder) {
                this.logger.info('No selection');
                progress.cancel();
                return;
            }
            progress.report({
                message: nls.localize('yukibana/cloud/openProject/downloading', 'Downloading...')
            });
            const result = await this.service.downloadProject(projectId, folder.toString());
            if (!result.ok) {
                this.logger.error('Could not download project');
                progress.cancel();
                this.messages.error(nls.localize('yukibana/cloud/openProject/downloadFail', 'Download failed'));
                return;
            }
            progress.report({
                message: nls.localize('yukibana/cloud/openProject/opening', 'Opening...')
            });
            this.workspaces.open(result.uri);
            progress.cancel();
        }
    }
}
