/**
 * SPDX-License-Identifier: MIT
 */
import { Command, CommandContribution, CommandRegistry, CommandService, MessageService, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ConfigProvider } from 'yukibana-ext/lib/browser/config/config-provider';
import { SubmissionOptions, SubmissionService } from '../common/submission-protocol';
import { SubmissionSummaryDialog } from './submission-summary-dialog';

export const PrepareSubmissionCommand: Command = Command.toLocalizedCommand({
    id: 'yukibana.prepareSubmission',
    label: 'Prepare submission',
}, 'yukibana/submission/prepareSubmission');

@injectable()
export class PrepareSubmissionContribution implements CommandContribution {
    @inject(SubmissionService) protected readonly submissionService!: SubmissionService;
    @inject(WorkspaceService) protected readonly workspaceService!: WorkspaceService;
    @inject(ConfigProvider) protected readonly configProvider!: ConfigProvider;
    @inject(MessageService) protected readonly messageService!: MessageService;
    @inject(CommandService) protected readonly commandService!: CommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PrepareSubmissionCommand, {
            execute: async () => {
                await this.configProvider.ready;
                const config = this.configProvider.config;
                const root = (await this.workspaceService.roots)[0].resource;
                const options: SubmissionOptions = {
                    workspaceUri: root.toString(),
                    include: config.submission.include,
                    exclude: config.submission.exclude,
                    outputUri: root.resolve(config.submission.filename).toString(),
                    respectGitignore: config.submission.respectGitignore,
                };
                const preview = await this.submissionService.previewSubmission(options);
                const confirmed = await new SubmissionSummaryDialog(preview).open();
                if (!confirmed) {
                    return;
                }
                const { outputUri, fileCount } = await this.submissionService.prepareSubmission(options);
                const message = nls.localize('yukibana/submission/submissionReady', 'Submission ready at {0} ({1} file(s))', outputUri, fileCount);
                this.messageService.info(
                    message,
                    { timeout: 5000 },
                );
            }
        });
    }
}
