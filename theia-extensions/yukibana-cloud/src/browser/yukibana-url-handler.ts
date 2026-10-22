/**
 * SPDX-License-Identifier: MIT
 */
import { CommandService, ILogger, MaybePromise, MessageService, nls, Progress, URI } from '@theia/core';
import { OpenerOptions, OpenHandler } from '@theia/core/lib/browser';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';
import { CloudService } from '../common/cloud-protocol';
import { CloudTelemetry } from '../common/cloud-telemetry';
import { CloudAccountService } from './cloud-account-service';
import { LoginCommand } from './command-contribution';
import { OpenProjectNewWindowDialog } from './open-project-window-dialog';

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
    @inject(TelemetryService) protected readonly telemetry!: TelemetryService;
    @inject(CloudAccountService) protected readonly accounts!: CloudAccountService;
    @inject(CommandService) protected readonly commands!: CommandService;

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
        // The registry, not the keystore, says whether the stored session still works
        if ((await this.accounts.refresh()).kind === 'logged-out') {
            await this.commands.executeCommand(LoginCommand.id);
        }

        if (command === '/open') {
            await this.openProjectURI(uri);
        }
    }

    private async openProjectURI(uri: URI): Promise<void> {
        const start = Date.now();
        let stage: CloudTelemetry.OpenProjectStage = 'parse';
        let outcome: CloudTelemetry.OpenProjectOutcome = 'error';
        let projectId: string | undefined;
        let newWindow: boolean | undefined;
        let progress: Progress | undefined;

        try {
            projectId = new URLSearchParams(uri.query).get('id') ?? undefined;
            this.logger.info(`Opening project: ${projectId}`);
            if (!projectId) {
                outcome = 'invalid-uri';
                this.logger.info('No project id');
                return;
            }

            stage = 'info';

            progress = await this.messages.showProgress({ text: nls.localize('yukibana/cloud/openProject/progressMessage', 'Opening project') });
            progress.report({
                message: nls.localize('yukibana/cloud/openProject/gettingInfo', 'Getting info...')
            });
            const lookup = await this.service.getProjectInfo(projectId);
            if (lookup.kind === 'not-logged-in') {
                outcome = 'not-logged-in';
                this.logger.info('Not logged in');
                this.offerLogin(uri);
                return;
            }
            if (lookup.kind === 'not-found') {
                outcome = 'not-found';
                this.logger.info('Project not found');
                this.messages.error(nls.localize('yukibana/cloud/openProject/notFound', 'Project not found'));
                return;
            }
            const info = lookup.project;
            if (!info.starterReady) {
                outcome = 'no-starter';
                this.logger.info('Project has no starter');
                this.messages.error(localizeMarkdown('yukibana/cloud/openProject/noStarter', 'Project \'{0}\' has no starter files to download yet', info.title));
                return;
            }

            stage = 'location';

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
                outcome = 'cancelled';
                this.logger.info('No selection');
                return;
            }

            stage = 'download';

            progress.report({
                message: nls.localize('yukibana/cloud/openProject/downloading', 'Downloading...')
            });
            const result = await this.service.downloadProject(projectId, folder.toString(), info.slug);
            if (!result.ok) {
                outcome = 'download-failed';
                this.logger.error(`Could not download project: ${result.reason}`);
                this.messages.error(localizeMarkdown('yukibana/cloud/openProject/downloadFailReason', 'Download failed: {0}', result.reason));
                return;
            }

            stage = 'window';

            progress.report({
                message: nls.localize('yukibana/cloud/openProject/opening', 'Opening...')
            });

            newWindow = await this.askOpenInNewWindow();

            outcome = 'opened';
            this.report(outcome, stage, start, projectId, newWindow);
            this.workspaces.open(result.uri, { preserveWindow: !newWindow });
        } catch (e) {
            this.logger.error(`Could not open project (stage: ${stage})`, e);
            this.messages.error(localizeMarkdown('yukibana/cloud/openProject/failed', 'Could not open project: {0}', e instanceof Error ? e.message : String(e)));
        } finally {
            progress?.cancel();
            if (outcome !== 'opened') {
                this.report(outcome, stage, start, projectId, newWindow);
            }
        }
    }

    /** Offers to log in, and opens the project once that worked. */
    protected async offerLogin(uri: URI): Promise<void> {
        const logIn = nls.localize('yukibana/cloud/submission/login', 'Log in');
        const choice = await this.messages.error(nls.localize('yukibana/cloud/openProject/notLoggedIn', 'Log in to open this project'), logIn);
        if (choice !== logIn) {
            return;
        }
        await this.commands.executeCommand(LoginCommand.id);
        if ((await this.accounts.refresh()).kind === 'logged-in') {
            await this.openProjectURI(uri);
        }
    }

    protected askOpenInNewWindow(): Promise<boolean | undefined> {
        return new OpenProjectNewWindowDialog().open();
    }

    private report(outcome: CloudTelemetry.OpenProjectOutcome, stage: CloudTelemetry.OpenProjectStage, start: number, projectId?: string, newWindow?: boolean): void {
        const durationMs = (Date.now()) - start;
        const data = {
            outcome: outcome,
            stage: stage,
            durationMs: durationMs,
            projectId: projectId ?? '',
            newWindow: newWindow ?? false,
        } satisfies CloudTelemetry.OpenProjectURIData;
        this.telemetry.report(
            CloudTelemetry.OpenProjectURI,
            data,
            {
                kind: (outcome === 'opened' || outcome === 'cancelled') ? 'usage' : 'error',
            }
        );
    }
}
