/**
 * SPDX-License-Identifier: MIT
 */
import { CommandService, ILogger, MessageService, nls, Progress, URI } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TelemetryService } from '@theia/telemetry/lib/common';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Project } from '@yukibana/cli';
import { localizeMarkdown } from 'yukibana-common/lib/localize-markdown';
import { CloudService } from '../common/cloud-protocol';
import { CloudTelemetry } from '../common/cloud-telemetry';
import { CloudAccountService } from './cloud-account-service';
import { LoginCommand } from './command-contribution';
import { ConflictResolutionStrategy, OpenProjectConflictDialog } from './open-project-conflict-dialog';
import { OpenProjectNewWindowDialog } from './open-project-window-dialog';

/** Where a project goes: a folder to download the starter into, or one that already holds the project, to open. */
interface ResolvedConflict {
    readonly strategy: 'open' | 'download';
    readonly destination: URI;
}

@injectable()
export class YukibanaProjectOpener {
    protected outcome: CloudTelemetry.OpenProjectOutcome;
    protected progress: Progress | undefined;

    @inject(ILogger) @named('yukibana:OpenHandler') protected readonly logger!: ILogger;
    @inject(CloudService) protected readonly service!: CloudService;
    @inject(FileDialogService) protected readonly fileDialogs!: FileDialogService;
    @inject(WorkspaceService) protected readonly workspaces!: WorkspaceService;
    @inject(MessageService) protected readonly messages!: MessageService;
    @inject(FileService) protected readonly files!: FileService;
    @inject(TelemetryService) protected readonly telemetry!: TelemetryService;
    @inject(CloudAccountService) protected readonly accounts!: CloudAccountService;
    @inject(CommandService) protected readonly commands!: CommandService;

    constructor() {
        this.outcome = 'error';
    }

    async openProjectURI(uri: URI): Promise<void> {
        this.logger.info(`Opening project from URI: ${uri}`);
        const start = Date.now();
        let stage: CloudTelemetry.OpenProjectStage = 'parse';
        this.outcome = 'error';
        this.progress = undefined;
        let projectId: string | undefined = undefined;
        let newWindow: boolean | undefined = undefined;

        try {
            projectId = this.parseURI(uri);
            if (!projectId) {
                return;
            }

            this.progress = await this.messages.showProgress({
                text: nls.localize('yukibana/cloud/openProject/progressMessage', 'Opening project'),
            });

            stage = 'info';
            const project = await this.getProjectInfo(uri, projectId);
            if (!project) {
                return;
            }

            stage = 'location';
            const folder = await this.chooseFolder(project);
            if (!folder) {
                return;
            }
            const target = await this.chooseDestination(project, folder);
            if (!target) {
                return;
            }

            if (target.strategy === 'download') {
                stage = 'download';
                if (!(await this.downloadStarter(projectId, target.destination))) {
                    return;
                }
            }

            this.progress.report({
                message: nls.localize('yukibana/cloud/openProject/opening', 'Opening...'),
            });

            stage = 'window';
            newWindow = await this.askOpenInNewWindow();

            this.outcome = 'opened';
            this.report(this.outcome, stage, start, projectId, newWindow);
            this.workspaces.open(target.destination, { preserveWindow: !newWindow });
        } catch (e) {
            this.logger.error(`Could not open project (stage: ${stage})`, e);
            this.messages.error(localizeMarkdown('yukibana/cloud/openProject/failed', 'Could not open project: {0}', e instanceof Error ? e.message : String(e)));
        } finally {
            this.progress?.cancel();
            if (this.outcome !== 'opened') {
                this.report(this.outcome, stage, start, projectId, newWindow);
            }
        }
    }

    protected parseURI(uri: URI): string | undefined {
        const projectId = new URLSearchParams(uri.query).get('id') ?? undefined;
        this.logger.info(`Opening project: ${projectId}`);

        if (!projectId) {
            this.outcome = 'invalid-uri';
            this.logger.info('No project id');
        }
        return projectId;
    }

    protected async getProjectInfo(uri: URI, projectId: string): Promise<Project | undefined> {
        this.progress?.report({
            message: nls.localize('yukibana/cloud/openProject/gettingInfo', 'Getting info...'),
        });
        const lookup = await this.service.getProjectInfo(projectId);
        if (lookup.kind === 'not-logged-in') {
            this.outcome = 'not-logged-in';
            this.logger.info('Not logged in');
            this.offerLogin(uri);
            return;
        }
        if (lookup.kind === 'not-found') {
            this.outcome = 'not-found';
            this.logger.info('Project not found');
            this.messages.error(nls.localize('yukibana/cloud/openProject/notFound', 'Project not found'));
            return;
        }
        const info = lookup.project;
        if (!info.starterReady) {
            this.outcome = 'no-starter';
            this.logger.info('Project has no starter');
            this.messages.error(localizeMarkdown('yukibana/cloud/openProject/noStarter', "Project '{0}' has no starter files to download yet", info.title));
            return;
        }
        return info;
    }

    protected async chooseFolder(project: Project): Promise<URI | undefined> {
        this.progress?.report({
            message: nls.localize('yukibana/cloud/openProject/choosingLocation', 'Choosing download location...'),
        });
        const folder = await this.fileDialogs.showOpenDialog({
            title: nls.localize('yukibana/cloud/openProject/downloadLocation', "Save project '{0}'", project.title),
            openLabel: nls.localizeByDefault('Select'),
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        });
        // No selection
        if (!folder) {
            this.outcome = 'cancelled';
            this.logger.info('No selection');
        }
        return folder;
    }

    /**
     * Unpacks the starter of `projectId` straight into `destination` and returns `true` iff it did, telling the person
     * about anything left out or why nothing was unpacked.
     */
    protected async downloadStarter(projectId: string, destination: URI): Promise<boolean> {
        this.progress?.report({
            message: nls.localize('yukibana/cloud/openProject/downloading', 'Downloading...'),
        });
        const result = await this.service.downloadProject(projectId, destination.toString());
        if (!result.ok) {
            this.outcome = 'download-failed';
            this.logger.error(`Could not download project: ${result.reason}`);
            this.messages.error(localizeMarkdown('yukibana/cloud/openProject/downloadFailReason', 'Download failed: {0}', result.reason));
            return false;
        }
        if (result.leftOut.length > 0) {
            this.messages.warn(localizeMarkdown('yukibana/cloud/openProject/leftOut', 'Some files of the starter were not unpacked: {0}', result.leftOut.join('; ')));
        }
        return true;
    }

    /**
     * Returns where `project` goes in `selectedFolder`: a folder named after its slug, or, when that already holds
     * something, what the person chose instead; `undefined` if they cancelled.
     */
    protected async chooseDestination(project: Project, selectedFolder: URI): Promise<ResolvedConflict | undefined> {
        const destination = selectedFolder.resolve(project.slug);
        if (await this.isDirectoryEmptyOrMissing(destination)) {
            return { strategy: 'download', destination };
        }
        return this.resolveConflict(project, destination);
    }

    protected async resolveConflict(project: Project, initialDestination: URI): Promise<ResolvedConflict | undefined> {
        const initialFolderName: string = initialDestination.path.base;
        let destination: URI = initialDestination;
        while (!(await this.isDirectoryEmptyOrMissing(destination))) {
            const alternative: URI = await this.findAvailableFolderName(destination);
            const newFolderName = alternative.path.base;
            const dialog = new OpenProjectConflictDialog(initialFolderName, newFolderName);
            const conflictResolution = await dialog.open();

            switch (conflictResolution?.strategy) {
                case ConflictResolutionStrategy.OPEN:
                    return {
                        strategy: 'open',
                        destination: destination,
                    };

                case ConflictResolutionStrategy.RENAME:
                    destination = alternative.parent.resolve(conflictResolution.newName);
                    break;

                case ConflictResolutionStrategy.RELOCATE:
                    const newFolder = await this.chooseFolder(project);
                    if (!newFolder) {
                        return;
                    }
                    destination = newFolder.resolve(initialFolderName);
                    break;

                default:
                    this.outcome = 'cancelled';
                    return;
            }
        }
        return {
            strategy: 'download',
            destination: destination,
        };
    }

    protected async findAvailableFolderName(initialDestination: URI): Promise<URI> {
        const parent: URI = initialDestination.parent;
        const initialFolderName: string = initialDestination.path.base;
        let index: number = 1;
        let candidate: URI;
        do {
            candidate = parent.resolve(`${initialFolderName}-${index++}`);
        } while (!(await this.isDirectoryEmptyOrMissing(candidate)));
        return candidate;
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
        const durationMs = Date.now() - start;
        const data = {
            outcome: outcome,
            stage: stage,
            durationMs: durationMs,
            projectId: projectId ?? '',
            newWindow: newWindow ?? false,
        } satisfies CloudTelemetry.OpenProjectURIData;
        this.telemetry.report(CloudTelemetry.OpenProjectURI, data, {
            kind: outcome === 'opened' || outcome === 'cancelled' ? 'usage' : 'error',
        });
    }

    private async isDirectoryEmptyOrMissing(uri: URI): Promise<boolean> {
        if (!(await this.files.exists(uri))) {
            return true;
        }
        const stat = await this.files.resolve(uri, { resolveMetadata: false });
        if (!stat.isDirectory) {
            return false;
        }
        return stat.children === undefined || stat.children.length === 0;
    }
}
